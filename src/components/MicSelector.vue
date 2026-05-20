<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppState } from '../composables/useAppState'
import { useTauri } from '../composables/useTauri'
import type { AudioDevice } from '../types'

const { state } = useAppState()
const tauri = useTauri()

const devices = ref<AudioDevice[]>([])

async function loadDevices() {
  try { devices.value = await tauri.listInputDevices() }
  catch (err) { console.error('Failed to load mic devices:', err) }
}

async function onDeviceChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  state.selectedMic = value || null
  tauri.setInputDevice(state.selectedMic)
  if (state.isMicTesting) { tauri.stopMicTest(); tauri.startMicTest() }
}

async function toggleMicTest() {
  if (state.isMicTesting) {
    await tauri.stopMicTest()
    state.isMicTesting = false
    state.micTestLevel = 0
  } else {
    try { await tauri.startMicTest(); state.isMicTesting = true }
    catch (err) { console.error('Mic test error:', err) }
  }
}

// Segmented VU meter: 12 cells, each 0–1 threshold
const CELL_COUNT = 12
function cellActive(i: number): boolean {
  return state.isMicTesting && state.micTestLevel * CELL_COUNT > i
}
function cellColor(i: number): string {
  if (i >= 10) return 'var(--danger)'
  if (i >= 8) return 'var(--warning)'
  return 'var(--success)'
}

onMounted(loadDevices)
</script>

<template>
  <div class="mic-selector">
    <label class="setting-label" for="mic-select">Microphone</label>
    <select id="mic-select" :value="state.selectedMic ?? ''" @change="onDeviceChange">
      <option value="">System Default</option>
      <option v-for="dev in devices" :key="dev.name" :value="dev.name">
        {{ dev.is_default ? `${dev.name} (default)` : dev.name }}
      </option>
    </select>
    <button class="btn-mic-test" :class="{ active: state.isMicTesting }" @click="toggleMicTest">
      {{ state.isMicTesting ? 'Stop Test' : 'Test Mic' }}
    </button>
    <!-- Segmented VU meter (12 cells) -->
    <div class="vu-meter" aria-hidden="true">
      <div
        v-for="i in CELL_COUNT"
        :key="i"
        class="vu-cell"
        :style="{ background: cellActive(i - 1) ? cellColor(i - 1) : 'var(--bg-elev)' }"
      />
    </div>
  </div>
</template>
