<script setup lang="ts">
import { ref } from 'vue'
import { ChevronLeft } from 'lucide-vue-next'

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
  <div class="view create-view">
    <div class="entry-form">
      <p class="form-label">Room name</p>
      <input
        v-model="roomName"
        type="text"
        placeholder="e.g. Team Standup"
        autofocus
        @keydown.enter="submit"
      />
      <p class="form-label">Password <span class="form-label-opt">(optional)</span></p>
      <input
        v-model="password"
        type="text"
        placeholder="Leave empty for open room"
        @keydown.enter="submit"
      />
      <button class="btn-primary entry-submit-btn" @click="submit">Create</button>
    </div>
    <button class="back-btn" @click="$emit('back')">
      <ChevronLeft :size="14" />
      Back
    </button>
  </div>
</template>
