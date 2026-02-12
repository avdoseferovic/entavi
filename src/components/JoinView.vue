<script setup lang="ts">
import { ref, watch } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'

const { state } = useAppState()

const roomId = ref('')
const password = ref('')

const emit = defineEmits<{
  back: []
  join: [roomId: string, password: string | null]
}>()

// When returning to join view due to password-protected room, restore roomCode
watch(() => state.joinPasswordNeeded, (needed) => {
  if (needed && state.roomCode) {
    roomId.value = state.roomCode
    state.joinPasswordNeeded = false
  }
})

function submit() {
  const code = roomId.value.trim().toLowerCase()
  if (!code) return
  emit('join', code, password.value.trim() || null)
}

function goBack() {
  state.joinPasswordNeeded = false
  emit('back')
}
</script>

<template>
  <div class="view">
    <p class="form-label">Room ID</p>
    <input
      v-model="roomId"
      type="text"
      placeholder="e.g. a1b2c3"
      autofocus
      @keydown.enter="submit"
    />
    <div v-if="state.joinPasswordNeeded || password" class="password-group">
      <p class="form-label password-hint">This room is password-protected</p>
      <input
        v-model="password"
        type="text"
        placeholder="Room password"
        @keydown.enter="submit"
      />
    </div>
    <button class="btn-primary" @click="submit">Join</button>
    <button class="back-btn" @click="goBack">
      <ArrowLeft :size="16" />
      Back
    </button>
  </div>
</template>
