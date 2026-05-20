<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Check } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'
import ParticipantItem from './ParticipantItem.vue'
import RoomControls from './RoomControls.vue'
import PingIndicator from './PingIndicator.vue'
import ChatPanel from './ChatPanel.vue'

const { state, peerCountLabel, getDisplayName } = useAppState()

const copyFeedback = ref<'idle' | 'ok' | 'fail'>('idle')

defineEmits<{
  'toggle-mute': []
  leave: []
}>()

async function copyRoomCode() {
  if (!state.roomCode) return
  try {
    await navigator.clipboard.writeText(state.roomCode)
    copyFeedback.value = 'ok'
  } catch (err) {
    console.warn('Clipboard write failed:', err)
    copyFeedback.value = 'fail'
  }
  setTimeout(() => { copyFeedback.value = 'idle' }, 1500)
}
</script>

<template>
  <div class="view">
    <div class="room-header">
      <h2 class="room-name">{{ state.roomName }}</h2>
      <span class="room-header-right">
        <PingIndicator />
        <span class="room-peer-count">{{ peerCountLabel }}</span>
      </span>
    </div>
    <div class="room-subtitle">
      <code>{{ state.roomCode }}</code>
      <button
        type="button"
        class="copy-btn"
        title="Copy room code to clipboard"
        aria-label="Copy room code to clipboard"
        @click="copyRoomCode"
      >
        <Check v-if="copyFeedback === 'ok'" :size="14" />
        <Copy v-else :size="14" />
        {{ copyFeedback === 'ok' ? 'Copied!' : copyFeedback === 'fail' ? 'Failed' : 'Copy' }}
      </button>
    </div>
    <div class="room-divider"></div>

    <div class="room-tabs">
      <button
        class="room-tab"
        :class="{ active: state.activeRoomTab === 'people' }"
        @click="state.activeRoomTab = 'people'"
      >
        People
      </button>
      <button
        class="room-tab"
        :class="{ active: state.activeRoomTab === 'chat' }"
        @click="state.activeRoomTab = 'chat'; state.chatUnread = 0"
      >
        Chat
        <span v-if="state.chatUnread > 0" class="chat-unread-dot"></span>
      </button>
    </div>

    <div v-if="state.activeRoomTab === 'people'" class="participant-list">
      <ParticipantItem
        :name="getDisplayName()"
        :is-self="true"
        :is-host-entry="state.isHost"
        :is-speaking="state.selfSpeaking && !state.isMuted"
        :is-muted-peer="state.isMuted"
      />
      <ParticipantItem
        v-for="[peerId, name] in state.peerList"
        :key="peerId"
        :name="name || peerId.substring(0, 8)"
        :is-self="false"
        :is-host-entry="peerId === state.hostPeerId"
        :is-speaking="state.speakingPeers.has(peerId)"
        :is-muted-peer="state.mutedPeers.has(peerId)"
        :peer-id="peerId"
      />
    </div>

    <ChatPanel v-if="state.activeRoomTab === 'chat'" />

    <div
      class="room-status-pill room-status-pill--reconnecting"
      :class="{ visible: state.isReconnecting }"
    >
      <span class="reconnecting-pulse" />
      Reconnecting… (attempt {{ state.reconnectAttempt }})
    </div>

    <div
      class="room-status-pill room-status-pill--muted"
      :class="{ visible: state.noticeBannerVisible }"
    >
      You were muted by the host
    </div>

    <RoomControls
      @toggle-mute="$emit('toggle-mute')"
      @leave="$emit('leave')"
    />
  </div>
</template>
