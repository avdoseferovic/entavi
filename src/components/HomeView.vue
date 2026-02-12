<script setup lang="ts">
import { Plus, DoorOpen } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'
import MicSelector from './MicSelector.vue'

const { state } = useAppState()

defineEmits<{
  create: []
  join: []
}>()
</script>

<template>
  <div class="view">
    <div class="action-row">
      <button class="btn-primary" @click="$emit('create')">
        <Plus :size="16" />
        Create Room
      </button>
      <button class="btn-secondary" @click="$emit('join')">
        <DoorOpen :size="16" />
        Join Room
      </button>
    </div>

    <div class="section-divider"><span>Settings</span></div>

    <div class="setting-group">
      <label class="setting-label">Display name</label>
      <input
        v-model="state.displayName"
        type="text"
        placeholder="Your name"
      />
    </div>

    <MicSelector />
  </div>
</template>
