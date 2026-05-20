<script setup lang="ts">
import { Plus, DoorOpen, Settings } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'

const { state } = useAppState()

const isTauriHost = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

defineEmits<{
  create: []
  join: []
}>()

function onDisplayNameInput() {
  localStorage.setItem('entavi:displayName', state.displayName)
}
</script>

<template>
  <div class="view home-view">
    <div class="home-cta-stack">
      <button class="btn-primary home-btn-create" @click="$emit('create')">
        <Plus :size="16" />
        Start a room
      </button>
      <button class="btn-secondary home-btn-join" @click="$emit('join')">
        <DoorOpen :size="16" />
        Join with code
      </button>
    </div>

    <div class="home-name-group">
      <label class="form-label" for="home-display-name">Calling as</label>
      <input
        id="home-display-name"
        v-model="state.displayName"
        type="text"
        placeholder="Your name"
        @input="onDisplayNameInput"
      />
    </div>

    <button
      v-if="isTauriHost"
      class="btn-quiet home-settings-link"
      @click="state.showSettings = true"
    >
      <Settings :size="14" />
      Settings
    </button>
  </div>
</template>
