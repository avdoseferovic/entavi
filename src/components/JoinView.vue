<script setup lang="ts">
import { ref } from 'vue'
import { ChevronLeft } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'

const { state } = useAppState()

const roomId = ref('')
const password = ref('')

const emit = defineEmits<{
  back: []
  join: [roomId: string, password: string | null]
}>()

function submit() {
  if (state.isJoining) return
  const code = roomId.value.trim().toLowerCase()
  if (!code) return
  state.roomNotFound = false
  emit('join', code, password.value.trim() || null)
}

function goBack() {
  state.joinPasswordNeeded = false
  state.roomNotFound = false
  emit('back')
}
</script>

<template>
  <div class="view join-view">
    <div class="entry-form">
      <p class="form-label">Room code</p>
      <input
        v-model="roomId"
        type="text"
        placeholder="e.g. a1b2c3"
        autofocus
        :disabled="state.isJoining"
        @keydown.enter="submit"
      />
      <p v-if="state.roomNotFound" class="error-hint">Room not found</p>

      <Transition name="pw-reveal">
        <div v-if="state.joinPasswordNeeded || password" class="password-group">
          <p class="form-label password-hint">This room is password-protected</p>
          <input
            v-model="password"
            type="text"
            placeholder="Room password"
            :disabled="state.isJoining"
            @keydown.enter="submit"
          />
        </div>
      </Transition>

      <button class="btn-primary entry-submit-btn" :disabled="state.isJoining" @click="submit">
        {{ state.isJoining ? 'Joining…' : 'Join' }}
      </button>
    </div>
    <button class="back-btn" :disabled="state.isJoining" @click="goBack">
      <ChevronLeft :size="14" />
      Back
    </button>
  </div>
</template>
