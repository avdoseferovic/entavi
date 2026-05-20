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
      <label class="form-label" for="join-room-code">Room code</label>
      <input
        id="join-room-code"
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
          <label class="form-label password-hint" for="join-password">This room is password-protected</label>
          <input
            id="join-password"
            v-model="password"
            type="password"
            placeholder="Room password"
            autocomplete="current-password"
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
