<script setup lang="ts">
import { ref } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'

const roomName = ref('')
const password = ref('')

const emit = defineEmits<{
  back: []
  create: [roomName: string, password: string | null]
}>()

function submit() {
  const name = roomName.value.trim()
  if (!name) return
  emit('create', name, password.value.trim() || null)
}
</script>

<template>
  <div class="view">
    <p class="form-label">Room name</p>
    <input
      v-model="roomName"
      type="text"
      placeholder="e.g. Team Standup"
      autofocus
      @keydown.enter="submit"
    />
    <p class="form-label">Password (optional)</p>
    <input
      v-model="password"
      type="text"
      placeholder="Leave empty for open room"
      @keydown.enter="submit"
    />
    <button class="btn-primary" @click="submit">Create</button>
    <button class="back-btn" @click="$emit('back')">
      <ArrowLeft :size="16" />
      Back
    </button>
  </div>
</template>
