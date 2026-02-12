<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Check } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'
import ParticipantItem from './ParticipantItem.vue'
import RoomControls from './RoomControls.vue'
import HostControls from './HostControls.vue'
import PingIndicator from './PingIndicator.vue'

const { state, peerCountLabel, getDisplayName } = useAppState()

const copyFeedback = ref(false)

defineEmits<{
  'toggle-mute': []
  leave: []
}>()

async function copyRoomCode() {
  if (!state.roomCode) return
  try {
    await navigator.clipboard.writeText(state.roomCode)
    copyFeedback.value = true
    setTimeout(() => { copyFeedback.value = false }, 1500)
  } catch (_) { /* ignore */ }
}
</script>

<template>
  <div class="view">
    <div class="room-header">
      <h2>{{ state.roomName }}</h2>
      <span class="room-header-right">
        <PingIndicator />
        <span class="room-peer-count">{{ peerCountLabel }}</span>
      </span>
    </div>
    <div class="room-subtitle">
      <code>{{ state.roomCode }}</code>
      <span class="copy-btn" title="Copy to clipboard" @click="copyRoomCode">
        <Check v-if="copyFeedback" :size="14" />
        <Copy v-else :size="14" />
        {{ copyFeedback ? 'Copied!' : 'Copy' }}
      </span>
    </div>
    <p class="status-text">
      <span class="status-dot" :class="state.statusState"></span>
      {{ state.statusText }}
    </p>
    <div class="room-divider"></div>

    <div class="participant-list">
      <ParticipantItem
        :name="getDisplayName()"
        :is-self="true"
        :is-host-entry="state.isHost"
      />
      <ParticipantItem
        v-for="[peerId, name] in state.peerList"
        :key="peerId"
        :name="name || peerId.substring(0, 8)"
        :is-self="false"
        :is-host-entry="false"
        :peer-id="peerId"
      />
    </div>

    <HostControls v-if="state.isHost" />

    <div
      class="notice-banner"
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
