<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppState } from '../composables/useAppState'
import { useTauri } from '../composables/useTauri'
import type { AudioDevice } from '../types'

const { state } = useAppState()
const tauri = useTauri()

const devices = ref<AudioDevice[]>([])

async function loadDevices() {
  try {
    devices.value = await tauri.listOutputDevices()
  } catch (err) {
    console.error('Failed to load output devices:', err)
  }
}

async function onDeviceChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  state.selectedOutput = value || null
  localStorage.setItem('entavi:outputDevice', value)
  tauri.setOutputDevice(state.selectedOutput)
  if (state.isMicTesting) {
    tauri.stopMicTest()
    tauri.startMicTest()
  }
}

onMounted(loadDevices)
</script>

<template>
  <div class="mic-selector">
    <label class="setting-label">Speaker</label>
    <select :value="state.selectedOutput ?? ''" @change="onDeviceChange">
      <option value="">System Default</option>
      <option
        v-for="dev in devices"
        :key="dev.name"
        :value="dev.name"
      >
        {{ dev.is_default ? `${dev.name} (default)` : dev.name }}
      </option>
    </select>
  </div>
</template>
