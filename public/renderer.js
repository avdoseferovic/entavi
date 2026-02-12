const { ipcRenderer } = require('electron');
const Peer = require('simple-peer');

class P2PVoiceCall {
    constructor() {
        this.localStream = null;
        this.peers = new Map();
        this.roomId = null;
        this.userId = this.generateUserId();
        this.isHost = false;
        this.isAudioStarted = false;
        this.isMuted = false;
        
        this.connectedPeers = new Set();
        this.pendingConnections = new Map();
        this.peerSignals = new Map();
        
        this.initializeEventListeners();
        this.updateStatus('Ready');
    }

    generateUserId() {
        return Math.random().toString(36).substr(2, 9);
    }

    initializeEventListeners() {
        // Listen for IPC messages from main process
        ipcRenderer.on('start-audio', () => this.startAudio());
        ipcRenderer.on('stop-audio', () => this.stopAudio());
        ipcRenderer.on('toggle-mute', () => this.toggleMute());
        ipcRenderer.on('create-room', () => this.createRoom());
        ipcRenderer.on('join-room-prompt', () => this.promptJoinRoom());
        ipcRenderer.on('leave-room', () => this.leaveRoom());
        ipcRenderer.on('toggle-audio', () => this.toggleAudio());
    }

    createRoom() {
        const roomId = this.generateUserId();
        this.roomId = roomId;
        this.isHost = true;
        
        this.log(`Created room: ${roomId}`);
        this.showNotification('Room Created', `Room ID: ${roomId}`);
        this.updateStatus('Room created - waiting for peers');
        this.updateTrayMenu();
    }

    async promptJoinRoom() {
        // In a real app, you'd show a dialog, but for now we'll use a simple prompt
        const roomId = prompt('Enter room ID:');
        if (roomId) {
            await this.joinRoom(roomId);
        }
    }

    async joinRoom(roomId) {
        this.roomId = roomId;
        this.isHost = false;
        
        this.log(`Joining room: ${roomId}`);
        this.updateStatus('Joining room...');
        
        // Simulate peer discovery
        await this.simulatePeerDiscovery();
    }

    async simulatePeerDiscovery() {
        this.log('Searching for peers in room...');
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Simulate finding 1-2 peers
        const peerCount = Math.floor(Math.random() * 2) + 1;
        for (let i = 0; i < peerCount; i++) {
            const peerId = this.generateUserId();
            await this.connectToPeer(peerId);
        }
    }

    async connectToPeer(peerId) {
        this.log(`Connecting to peer: ${peerId}`);
        
        try {
            if (!this.localStream) {
                this.log(`Audio not started - cannot connect to peer: ${peerId}`);
                return;
            }

            const peer = new Peer({ 
                initiator: this.isHost,
                stream: this.localStream,
                trickle: false
            });

            peer.on('signal', (data) => {
                this.handlePeerSignal(peerId, data);
            });

            peer.on('stream', (stream) => {
                this.handlePeerStream(peerId, stream);
            });

            peer.on('connect', () => {
                this.log(`Connected to peer: ${peerId}`);
                this.connectedPeers.add(peerId);
                this.updateStatus(`Connected to ${this.connectedPeers.size} peer(s)`);
                this.updateTrayMenu();
                this.showNotification('Peer Connected', `Connected to peer ${peerId.substring(0, 6)}`);
            });

            peer.on('close', () => {
                this.log(`Disconnected from peer: ${peerId}`);
                this.connectedPeers.delete(peerId);
                this.peers.delete(peerId);
                this.peerSignals.delete(peerId);
                this.updateStatus();
                this.updateTrayMenu();
            });

            peer.on('error', (err) => {
                this.log(`Error with peer ${peerId}: ${err.message}`);
                this.peers.delete(peerId);
                this.peerSignals.delete(peerId);
            });

            this.peers.set(peerId, peer);
            this.pendingConnections.set(peerId, peer);
            
            if (this.isHost) {
                this.log(`Initiating connection to peer: ${peerId}`);
            } else {
                this.log(`Waiting for connection from host: ${peerId}`);
            }

        } catch (error) {
            this.log(`Failed to connect to peer ${peerId}: ${error.message}`);
        }
    }

    handlePeerSignal(peerId, signal) {
        const peer = this.peers.get(peerId);
        if (!peer) {
            this.log(`Peer ${peerId} not found for signaling`);
            return;
        }

        if (signal.type === 'offer') {
            this.peerSignals.set(peerId, signal);
            this.log(`Received offer from peer: ${peerId}`);
            
            setTimeout(() => {
                this.simulateAnswerResponse(peerId, signal);
            }, 200);
            
        } else if (signal.type === 'answer') {
            this.log(`Received answer from peer: ${peerId}`);
            
            if (peer.initiator) {
                try {
                    peer.signal(signal);
                } catch (error) {
                    this.log(`Error processing answer from ${peerId}: ${error.message}`);
                }
            }
        } else {
            try {
                peer.signal(signal);
            } catch (error) {
                this.log(`Error processing candidate from ${peerId}: ${error.message}`);
            }
        }
    }

    simulateAnswerResponse(peerId, offerSignal) {
        const peer = this.peers.get(peerId);
        if (!peer || peer.initiator) {
            return;
        }

        this.log(`Simulating answer response for peer: ${peerId}`);
        
        try {
            peer.signal(offerSignal);
        } catch (error) {
            this.log(`Error creating answer for ${peerId}: ${error.message}`);
        }
    }

    handlePeerStream(peerId, stream) {
        this.log(`Received audio stream from: ${peerId}`);
        
        const audio = new Audio();
        audio.srcObject = stream;
        audio.play().catch(err => {
            this.log(`Failed to play audio from ${peerId}: ${err.message}`);
        });
    }

    async startAudio() {
        try {
            if (this.localStream) {
                this.log('Audio already started');
                return;
            }

            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: true, 
                video: false 
            });
            
            this.isAudioStarted = true;
            this.log('Audio started');
            this.updateStatus('Audio active');
            this.updateTrayMenu();
            this.showNotification('Audio Started', 'Microphone is now active');
            
            if (this.roomId && this.peers.size === 0) {
                if (this.isHost) {
                    await this.simulatePeerDiscovery();
                } else {
                    this.log('Waiting for host to connect...');
                }
            }
            
            this.peers.forEach((peer, peerId) => {
                if (peer && !peer.destroyed) {
                    try {
                        peer.addStream(this.localStream);
                    } catch (error) {
                        this.log(`Error adding stream to peer ${peerId}: ${error.message}`);
                    }
                }
            });
            
        } catch (error) {
            this.log(`Failed to start audio: ${error.message}`);
            this.showNotification('Audio Error', `Failed to start audio: ${error.message}`);
        }
    }

    stopAudio() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => { track.stop(); });
            this.localStream = null;
            this.isAudioStarted = false;
            this.isMuted = false;
            this.log('Audio stopped');
            this.updateStatus('Audio stopped');
            this.updateTrayMenu();
            this.showNotification('Audio Stopped', 'Microphone is now off');
        }
    }

    toggleAudio() {
        if (this.isAudioStarted) {
            this.stopAudio();
        } else {
            this.startAudio();
        }
    }

    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isMuted = !audioTrack.enabled;
                this.log(this.isMuted ? 'Microphone muted' : 'Microphone unmuted');
                this.updateTrayMenu();
                this.showNotification('Microphone', this.isMuted ? 'Muted' : 'Unmuted');
            }
        }
    }

    leaveRoom() {
        this.peers.forEach((peer) => {
            peer.destroy();
        });
        
        this.peers.clear();
        this.connectedPeers.clear();
        this.pendingConnections.clear();
        this.peerSignals.clear();
        
        this.stopAudio();
        
        this.roomId = null;
        this.isHost = false;
        
        this.log('Left room');
        this.updateStatus('Ready');
        this.updateTrayMenu();
        this.showNotification('Room Left', 'Disconnected from all peers');
    }

    updateStatus(status = '') {
        if (!status) {
            if (this.isAudioStarted) {
                status = this.isMuted ? 'Audio Active (Muted)' : 'Audio Active';
                if (this.connectedPeers.size > 0) {
                    status += ` - ${this.connectedPeers.size} peer(s)`;
                }
            } else {
                status = 'Inactive';
            }
        }
        
        // Send status to main process for tray menu update
        ipcRenderer.send('update-status', status, this.connectedPeers.size, this.isAudioStarted, this.isMuted);
    }

    updateTrayMenu() {
        this.updateStatus();
    }

    showNotification(title, body) {
        ipcRenderer.send('show-notification', title, body);
    }

    log(message) {
        console.log(`[P2P Voice Call] ${message}`);
        
        // Update debug div if visible
        const debug = document.getElementById('debug');
        if (debug && debug.style.display !== 'none') {
            const timestamp = new Date().toLocaleTimeString();
            debug.innerHTML += `<div>[${timestamp}] ${message}</div>`;
            debug.scrollTop = debug.scrollHeight;
        }
    }
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.voiceCall = new P2PVoiceCall();
    
    // Auto-create a room for easy testing
    setTimeout(() => {
        window.voiceCall.createRoom();
    }, 1000);
});