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
    devices.value = await tauri.listInputDevices()
  } catch (err) {
    console.error('Failed to load mic devices:', err)
  }
}

async function onDeviceChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  state.selectedMic = value || null
  tauri.setInputDevice(state.selectedMic)
  if (state.isMicTesting) {
    tauri.stopMicTest()
    tauri.startMicTest()
  }
}

async function toggleMicTest() {
  if (state.isMicTesting) {
    await tauri.stopMicTest()
    state.isMicTesting = false
  } else {
    try {
      await tauri.startMicTest()
      state.isMicTesting = true
    } catch (err) {
      console.error('Mic test error:', err)
    }
  }
}

onMounted(loadDevices)
</script>

<template>
  <div class="mic-selector">
    <label>Microphone</label>
    <select :value="state.selectedMic ?? ''" @change="onDeviceChange">
      <option value="">System Default</option>
      <option
        v-for="dev in devices"
        :key="dev.name"
        :value="dev.name"
      >
        {{ dev.is_default ? `${dev.name} (default)` : dev.name }}
      </option>
    </select>
    <button
      class="btn-mic-test"
      :class="{ active: state.isMicTesting }"
      @click="toggleMicTest"
    >
      {{ state.isMicTesting ? 'Stop Test' : 'Test Mic' }}
    </button>
  </div>
</template>
