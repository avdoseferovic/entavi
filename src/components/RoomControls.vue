<script setup lang="ts">
import { Mic, MicOff, LogOut, Settings } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'

const { state } = useAppState()

defineEmits<{
  'toggle-mute': []
  leave: []
}>()
</script>

<template>
  <div class="room-controls-wrapper">
    <div class="room-dock">
      <!-- Settings -->
      <button
        class="room-settings"
        :class="{ active: state.showSettings }"
        title="Settings"
        aria-label="Settings"
        @click="state.showSettings = !state.showSettings"
      >
        <Settings :size="18" />
      </button>

      <!-- Mute pill (dominant action) -->
      <button
        class="room-mute"
        :class="{ muted: state.isMuted }"
        :title="state.isMuted ? 'Unmute microphone' : 'Mute microphone'"
        :aria-label="state.isMuted ? 'Unmute microphone' : 'Mute microphone'"
        :aria-pressed="state.isMuted"
        @click="$emit('toggle-mute')"
      >
        <MicOff v-if="state.isMuted" :size="20" />
        <Mic v-else :size="20" />
        <span class="room-mute-label">{{ state.isMuted ? 'Unmute' : 'Mute' }}</span>
        <span
          v-if="!state.isMuted"
          class="room-mute-level"
          :class="{ active: state.selfSpeaking }"
          aria-hidden="true"
        />
      </button>

      <!-- Leave -->
      <button
        class="room-leave"
        title="Leave room"
        aria-label="Leave room"
        @click="$emit('leave')"
      >
        <LogOut :size="18" />
      </button>
    </div>
  </div>
</template>
