<script setup lang="ts">
import { Plus, DoorOpen } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'
import { useTauri } from '../composables/useTauri'
import MicSelector from './MicSelector.vue'

const { state } = useAppState()
const tauri = useTauri()

defineEmits<{
  create: []
  join: []
}>()

function onDisplayNameInput() {
  localStorage.setItem('entavi:displayName', state.displayName)
}

function onSignalingUrlChange() {
  const url = state.signalingUrl.trim()
  if (url) {
    localStorage.setItem('entavi:signalingUrl', url)
    tauri.setSignalingUrl(url)
  } else {
    localStorage.removeItem('entavi:signalingUrl')
    tauri.setSignalingUrl(null)
  }
}

function toggleNoiseSuppression() {
  state.noiseSuppression = !state.noiseSuppression
  localStorage.setItem('entavi:noiseSuppression', String(state.noiseSuppression))
  tauri.setNoiseSuppression(state.noiseSuppression)
}
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
        @input="onDisplayNameInput"
      />
    </div>

    <MicSelector />

    <div class="section-divider"><span>Advanced</span></div>

    <div class="setting-group">
      <label class="noise-toggle" @click="toggleNoiseSuppression">
        <span class="toggle-track" :class="{ on: state.noiseSuppression }">
          <span class="toggle-thumb" />
        </span>
        <span class="toggle-label">Noise suppression</span>
      </label>
    </div>

    <div class="setting-group">
      <label class="setting-label">Signaling server</label>
      <input
        v-model="state.signalingUrl"
        type="text"
        placeholder="Default (entavi-signaling.avdo.workers.dev)"
        @change="onSignalingUrlChange"
      />
    </div>
  </div>
</template>
