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
      <label class="form-label" for="create-room-name">Room name</label>
      <input
        id="create-room-name"
        v-model="roomName"
        type="text"
        placeholder="e.g. Team Standup"
        autofocus
        @keydown.enter="submit"
      />
      <label class="form-label" for="create-password">Password <span class="form-label-opt">(optional)</span></label>
      <input
        id="create-password"
        v-model="password"
        type="password"
        placeholder="Leave empty for open room"
        autocomplete="new-password"
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
