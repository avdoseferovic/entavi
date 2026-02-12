<script setup lang="ts">
import { ref } from 'vue'
import { useAppState } from '../composables/useAppState'
import { useTauri } from '../composables/useTauri'

const { state } = useAppState()
const tauri = useTauri()

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
  <div class="host-controls">
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
        {{ state.isRoomLocked ? 'Clear Password' : 'Set Password' }}
      </button>
    </div>
  </div>
</template>
