<script setup lang="ts">
import { ref } from 'vue'
import { Mic, MicOff, LogOut, Settings } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'
import { useTauri } from '../composables/useTauri'

const { state } = useAppState()
const tauri = useTauri()

defineEmits<{
  'toggle-mute': []
  leave: []
}>()

const showSettings = ref(false)
const roomPassword = ref('')

async function setRoomPassword() {
  try {
    if (state.isRoomLocked) {
      await tauri.lockRoom(null)
      roomPassword.value = ''
    } else {
      const pw = roomPassword.value.trim()
      if (!pw) return
      await tauri.lockRoom(pw)
    }
  } catch (err) {
    console.error('Set password error:', err)
  }
}
</script>

<template>
  <div class="room-controls-wrapper">
    <div v-if="showSettings" class="room-settings-dropdown">
      <div class="password-row">
        <input
          v-model="roomPassword"
          type="text"
          placeholder="Room password"
          class="input-room-password"
          :disabled="state.isRoomLocked"
          @keydown.enter="setRoomPassword"
        />
        <button
          class="btn-lock"
          :class="{ locked: state.isRoomLocked }"
          @click="setRoomPassword"
        >
          {{ state.isRoomLocked ? 'Clear' : 'Set' }}
        </button>
      </div>
    </div>
    <div class="room-controls">
      <button
        v-if="state.isHost"
        class="btn-settings-circle"
        :class="{ active: showSettings }"
        title="Room settings"
        @click="showSettings = !showSettings"
      >
        <Settings :size="20" />
      </button>
      <button
        class="btn-mute-circle"
        :class="{ muted: state.isMuted }"
        :title="state.isMuted ? 'Unmute' : 'Mute'"
        @click="$emit('toggle-mute')"
      >
        <MicOff v-if="state.isMuted" :size="22" />
        <Mic v-else :size="22" />
      </button>
      <button
        class="btn-leave-circle"
        title="Leave room"
        @click="$emit('leave')"
      >
        <LogOut :size="20" />
      </button>
    </div>
  </div>
</template>
