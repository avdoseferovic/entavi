import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

type View = 'home' | 'create' | 'join' | 'room';

interface CallState {
    state: 'idle' | 'connecting' | 'in_room' | 'error';
    room_id?: string;
    room_name?: string;
    is_host?: boolean;
    locked?: boolean;
    message?: string;
}

interface AudioDevice {
    name: string;
    is_default: boolean;
}

interface PeerInfo {
    peer_id: string;
    name: string;
}

class Entavi {
    private roomName: string | null = null;
    private roomCode: string | null = null;
    private isMuted = false;
    private selectedMic: string | null = null;
    private isMicTesting = false;
    private isHost = false;
    private isRoomLocked = false;
    private peerList: Map<string, string> = new Map();
    private joinPasswordNeeded = false;

    constructor() {
        this.initEventListeners();
        this.initUI();
        this.loadMicDevices();
    }

    async initEventListeners() {
        // Tray mute toggle
        await listen('tray-toggle-mute', () => this.toggleMute());

        // Engine events from Rust backend
        await listen<CallState>('state-changed', (event) => {
            this.handleStateChanged(event.payload);
        });

        await listen<PeerInfo>('peer-joined', (event) => {
            console.log('Peer joined:', event.payload);
            const { peer_id, name } = event.payload;
            if (!this.peerList.has(peer_id)) {
                this.peerList.set(peer_id, name);
                this.renderParticipantList();
                this.updatePeerCount();
            }
        });

        await listen<string>('peer-left', (event) => {
            console.log('Peer left:', event.payload);
            const peerId = event.payload;
            this.peerList.delete(peerId);
            this.renderParticipantList();
            this.updatePeerCount();
        });

        await listen<string>('error', (event) => {
            console.error('Engine error:', event.payload);
            this.setStatus(event.payload, 'error');
        });

        await listen('kicked', () => {
            this.showView('home');
            this.notify('Kicked', 'You were removed from the room by the host');
            this.resetModerationState();
        });

        await listen('force-muted', () => {
            this.isMuted = true;
            this.$('btn-mute').classList.add('muted');
            this.$('btn-mute').title = 'Unmute';
            emit('mute-state-changed', 'muted');
            // Show notice banner briefly
            this.$('notice-banner').classList.add('visible');
            setTimeout(() => {
                this.$('notice-banner').classList.remove('visible');
            }, 3000);
        });

        await listen<boolean>('room-locked', (event) => {
            this.isRoomLocked = event.payload;
            this.updateLockButton();
        });
    }

    handleStateChanged(state: CallState) {
        switch (state.state) {
            case 'idle':
                break;
            case 'connecting':
                this.setStatus('Connecting...', 'connecting');
                break;
            case 'in_room':
                this.setStatus('Connected', 'connected');
                this.updatePeerCount();
                if (state.is_host !== undefined) {
                    this.isHost = state.is_host;
                }
                if (state.locked !== undefined) {
                    this.isRoomLocked = state.locked;
                }
                this.updateHostControls();
                this.renderParticipantList();
                break;
            case 'error':
                if (state.message === 'Room is password-protected') {
                    // Stay on join view, show password field
                    this.joinPasswordNeeded = true;
                    this.showView('join');
                    // Restore the room code in the input
                    if (this.roomCode) {
                        (this.$('input-room-id') as HTMLInputElement).value = this.roomCode;
                    }
                    this.$('join-password-group').style.display = 'block';
                    (this.$('input-join-password') as HTMLInputElement).focus();
                } else {
                    this.setStatus(state.message ?? 'An error occurred', 'error');
                }
                break;
        }
    }

    initUI() {
        this.$('btn-create').addEventListener('click', () => this.showView('create'));
        this.$('btn-join').addEventListener('click', () => this.showView('join'));
        this.$('btn-do-create').addEventListener('click', () => this.createRoom());
        this.$('btn-do-join').addEventListener('click', () => this.joinRoom());
        this.$('btn-back-create').addEventListener('click', () => this.showView('home'));
        this.$('btn-back-join').addEventListener('click', () => this.showView('home'));
        this.$('btn-leave').addEventListener('click', () => this.leaveRoom());
        this.$('btn-copy-id').addEventListener('click', () => this.copyRoomCode());
        this.$('btn-mute').addEventListener('click', () => this.toggleMute());
        this.$('btn-set-password').addEventListener('click', () => this.setRoomPassword());

        this.$('input-room-name').addEventListener('keydown', (e: Event) => {
            if ((e as KeyboardEvent).key === 'Enter') this.createRoom();
        });
        this.$('input-room-id').addEventListener('keydown', (e: Event) => {
            if ((e as KeyboardEvent).key === 'Enter') this.joinRoom();
        });
        this.$('input-join-password').addEventListener('keydown', (e: Event) => {
            if ((e as KeyboardEvent).key === 'Enter') this.joinRoom();
        });
        this.$('input-room-password').addEventListener('keydown', (e: Event) => {
            if ((e as KeyboardEvent).key === 'Enter') this.setRoomPassword();
        });

        (this.$('select-mic') as HTMLSelectElement).addEventListener('change', (e) => {
            const value = (e.target as HTMLSelectElement).value;
            this.selectedMic = value || null;
            invoke('set_input_device', { deviceName: this.selectedMic });
            // Restart mic test with new device if currently testing
            if (this.isMicTesting) {
                invoke('stop_mic_test');
                invoke('start_mic_test');
            }
        });

        this.$('btn-mic-test').addEventListener('click', () => this.toggleMicTest());
    }

    async loadMicDevices() {
        try {
            const devices = await invoke<AudioDevice[]>('list_input_devices');
            const select = this.$('select-mic') as HTMLSelectElement;
            // Keep the "System Default" option, remove the rest
            select.innerHTML = '<option value="">System Default</option>';
            for (const dev of devices) {
                const opt = document.createElement('option');
                opt.value = dev.name;
                opt.textContent = dev.is_default ? `${dev.name} (default)` : dev.name;
                select.appendChild(opt);
            }
        } catch (err) {
            console.error('Failed to load mic devices:', err);
        }
    }

    $(id: string): HTMLElement {
        return document.getElementById(id)!;
    }

    showView(view: View) {
        for (const v of ['home', 'create', 'join', 'room']) {
            this.$(`view-${v}`).classList.toggle('active', v === view);
        }
        if (view === 'create') {
            (this.$('input-room-name') as HTMLInputElement).value = '';
            (this.$('input-room-name') as HTMLInputElement).focus();
        }
        if (view === 'join') {
            if (!this.joinPasswordNeeded) {
                (this.$('input-room-id') as HTMLInputElement).value = '';
                this.$('join-password-group').style.display = 'none';
                (this.$('input-join-password') as HTMLInputElement).value = '';
            }
            this.joinPasswordNeeded = false;
            (this.$('input-room-id') as HTMLInputElement).focus();
        }
    }

    setStatus(text: string, state: 'connecting' | 'connected' | 'error' = 'connecting') {
        this.$('room-status').innerHTML = `<span class="status-dot ${state}"></span>${text}`;
    }

    updatePeerCount() {
        const count = this.peerList.size + 1; // +1 for self
        this.$('peer-count').textContent = count === 1 ? 'Only you in the room' : `${count} people in room`;
    }

    updateHostControls() {
        const hostControls = this.$('host-controls');
        hostControls.classList.toggle('visible', this.isHost);
        this.updateLockButton();

        // Update host badge in room title
        const titleEl = this.$('room-title');
        const existing = titleEl.querySelector('.host-badge');
        if (this.isHost && !existing) {
            const badge = document.createElement('span');
            badge.className = 'host-badge';
            badge.textContent = 'Host';
            titleEl.appendChild(badge);
        } else if (!this.isHost && existing) {
            existing.remove();
        }
    }

    updateLockButton() {
        const btn = this.$('btn-set-password');
        const input = this.$('input-room-password') as HTMLInputElement;
        if (this.isRoomLocked) {
            btn.classList.add('locked');
            btn.textContent = 'Clear Password';
            input.disabled = true;
        } else {
            btn.classList.remove('locked');
            btn.textContent = 'Set Password';
            input.disabled = false;
        }
    }

    renderParticipantList() {
        const container = this.$('participant-list');
        container.innerHTML = '';

        if (this.peerList.size === 0) {
            container.classList.remove('visible');
            return;
        }

        container.classList.add('visible');

        for (const [peerId, name] of this.peerList) {
            const item = document.createElement('div');
            item.className = 'participant-item';

            const label = document.createElement('span');
            label.className = 'peer-label';
            label.textContent = name || peerId.substring(0, 8);
            label.title = peerId;
            item.appendChild(label);

            if (this.isHost) {
                const actions = document.createElement('div');
                actions.className = 'participant-actions';

                const muteBtn = document.createElement('button');
                muteBtn.className = 'btn-force-mute';
                muteBtn.textContent = 'Mute';
                muteBtn.addEventListener('click', () => this.forceMutePeer(peerId));
                actions.appendChild(muteBtn);

                const kickBtn = document.createElement('button');
                kickBtn.className = 'btn-kick';
                kickBtn.textContent = 'Kick';
                kickBtn.addEventListener('click', () => this.kickPeer(peerId));
                actions.appendChild(kickBtn);

                item.appendChild(actions);
            }

            container.appendChild(item);
        }
    }

    // ── Room Actions (delegated to Rust backend) ──

    private getDisplayName(): string {
        return (this.$('input-display-name') as HTMLInputElement).value.trim() || 'Anonymous';
    }

    async createRoom() {
        const input = this.$('input-room-name') as HTMLInputElement;
        const roomName = input.value.trim();
        if (!roomName) return;

        this.stopMicTest();
        this.roomName = roomName;
        this.$('room-title').textContent = this.roomName;
        this.setStatus('Starting room...', 'connecting');
        this.updateMicIndicator();
        this.showView('room');

        try {
            const roomId = await invoke<string>('create_room', {
                roomName,
                name: this.getDisplayName(),
            });
            this.roomCode = roomId;
            this.$('room-id-display').textContent = this.roomCode;
            this.setStatus('Waiting for peers...', 'connected');
            this.updatePeerCount();
            this.notify('Room Created', `${this.roomName} — Code: ${this.roomCode}`);
        } catch (err) {
            this.setStatus(`${err}`, 'error');
        }
    }

    async joinRoom() {
        const input = this.$('input-room-id') as HTMLInputElement;
        const code = input.value.trim().toLowerCase();
        if (!code) return;

        const passwordInput = this.$('input-join-password') as HTMLInputElement;
        const password = passwordInput.value.trim() || null;

        this.stopMicTest();
        this.roomCode = code;
        this.roomName = `Room ${code}`;

        this.$('room-title').textContent = this.roomName;
        this.$('room-id-display').textContent = this.roomCode;
        this.setStatus('Connecting to room...', 'connecting');
        this.updateMicIndicator();
        this.showView('room');

        try {
            await invoke('join_room', {
                roomId: code,
                name: this.getDisplayName(),
                password,
            });
            this.notify('Joined Room', `Code: ${this.roomCode}`);
        } catch (err) {
            this.setStatus(`${err}`, 'error');
        }
    }

    async leaveRoom() {
        try {
            await invoke('leave_room');
        } catch (err) {
            console.error('Leave room error:', err);
        }

        this.showView('home');
        this.notify('Left Room', this.roomName || 'Disconnected');
        this.resetModerationState();
    }

    private resetModerationState() {
        this.roomCode = null;
        this.roomName = null;
        this.isMuted = false;
        this.isHost = false;
        this.isRoomLocked = false;
        this.peerList = new Map();
        this.$('btn-mute').classList.remove('muted');
        this.$('btn-mute').title = 'Mute';
        this.$('notice-banner').classList.remove('visible');
        this.$('participant-list').classList.remove('visible');
        this.$('host-controls').classList.remove('visible');
        // Remove host badge if present
        const badge = this.$('room-title').querySelector('.host-badge');
        if (badge) badge.remove();
        emit('mute-state-changed', 'unmuted');
    }

    async toggleMute() {
        this.isMuted = !this.isMuted;
        try {
            await invoke('set_muted', { muted: this.isMuted });
        } catch (err) {
            console.error('Mute error:', err);
            this.isMuted = !this.isMuted; // revert
            return;
        }
        const btn = this.$('btn-mute');
        btn.classList.toggle('muted', this.isMuted);
        btn.title = this.isMuted ? 'Unmute' : 'Mute';
        // Notify tray to update its label
        await emit('mute-state-changed', this.isMuted ? 'muted' : 'unmuted');
    }

    async setRoomPassword() {
        const input = this.$('input-room-password') as HTMLInputElement;
        try {
            if (this.isRoomLocked) {
                // Clear password
                await invoke('lock_room', { password: null });
                input.value = '';
            } else {
                // Set password
                const pw = input.value.trim();
                if (!pw) return;
                await invoke('lock_room', { password: pw });
            }
        } catch (err) {
            console.error('Set password error:', err);
        }
    }

    async kickPeer(peerId: string) {
        try {
            await invoke('kick_peer', { peerId });
        } catch (err) {
            console.error('Kick peer error:', err);
        }
    }

    async forceMutePeer(peerId: string) {
        try {
            await invoke('force_mute_peer', { peerId });
        } catch (err) {
            console.error('Force mute error:', err);
        }
    }

    async toggleMicTest() {
        const btn = this.$('btn-mic-test');
        if (this.isMicTesting) {
            await invoke('stop_mic_test');
            this.isMicTesting = false;
            btn.textContent = 'Test Mic';
            btn.classList.remove('active');
        } else {
            try {
                await invoke('start_mic_test');
                this.isMicTesting = true;
                btn.textContent = 'Stop Test';
                btn.classList.add('active');
            } catch (err) {
                console.error('Mic test error:', err);
            }
        }
    }

    private stopMicTest() {
        if (this.isMicTesting) {
            invoke('stop_mic_test');
            this.isMicTesting = false;
            this.$('btn-mic-test').textContent = 'Test Mic';
            this.$('btn-mic-test').classList.remove('active');
        }
    }

    // ── Utility ──

    updateMicIndicator() {
        const label = this.selectedMic ?? 'System Default';
        this.$('mic-indicator').textContent = `Mic: ${label}`;
    }

    async copyRoomCode() {
        if (!this.roomCode) return;
        try {
            await navigator.clipboard.writeText(this.roomCode);
            const btn = this.$('btn-copy-id');
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        } catch (_) {}
    }

    private async notify(title: string, body: string) {
        try {
            await invoke('show_notification', { title, body });
        } catch (_) {}
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Entavi();
});
