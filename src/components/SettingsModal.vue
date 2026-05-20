<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'
import { useTauri } from '../composables/useTauri'
import MicSelector from './MicSelector.vue'
import SpeakerSelector from './SpeakerSelector.vue'
import ShortcutSettings from './ShortcutSettings.vue'
import HostControls from './HostControls.vue'

const { state } = useAppState()
const tauri = useTauri()

const emit = defineEmits<{ close: [] }>()

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

function onVoiceSensitivityChange(e: Event) {
  const value = parseInt((e.target as HTMLInputElement).value)
  state.voiceSensitivity = value
  localStorage.setItem('entavi:voiceSensitivity', String(value))
  const threshold = Math.pow(10, -4 + 3 * value / 100)
  tauri.setVadThreshold(threshold)
}

function toggleAgc() {
  state.agcEnabled = !state.agcEnabled
  localStorage.setItem('entavi:agc', String(state.agcEnabled))
  tauri.setAgc(state.agcEnabled)
}

function onOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('settings-overlay')) emit('close')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Transition name="modal-slide">
    <div class="settings-overlay" @click="onOverlayClick">
      <div class="settings-modal">
        <div class="settings-modal-header">
          <h2>Settings</h2>
          <button class="settings-close-btn" @click="emit('close')">
            <X :size="16" />
          </button>
        </div>
        <div class="settings-modal-body">

          <p class="settings-section-eyebrow">01 / Audio</p>
          <MicSelector />
          <SpeakerSelector />
          <div class="setting-group">
            <label class="setting-label">Voice sensitivity</label>
            <div class="range-row">
              <span class="range-label-left">More</span>
              <input
                type="range" min="0" max="100"
                :value="state.voiceSensitivity"
                @input="onVoiceSensitivityChange"
              />
              <span class="range-label-right">Less</span>
            </div>
          </div>

          <p class="settings-section-eyebrow">02 / Processing</p>
          <div class="setting-group">
            <label class="noise-toggle" @click="toggleNoiseSuppression">
              <span class="toggle-track" :class="{ on: state.noiseSuppression }">
                <span class="toggle-thumb" />
              </span>
              <span class="toggle-label">Noise suppression</span>
            </label>
          </div>
          <div class="setting-group">
            <label class="noise-toggle" @click="toggleAgc">
              <span class="toggle-track" :class="{ on: state.agcEnabled }">
                <span class="toggle-thumb" />
              </span>
              <span class="toggle-label">Auto gain control</span>
            </label>
          </div>

          <p class="settings-section-eyebrow">03 / Shortcuts</p>
          <ShortcutSettings />

          <template v-if="state.isHost && state.currentView === 'room'">
            <p class="settings-section-eyebrow">04 / Host Controls</p>
            <HostControls />
          </template>

          <p class="settings-section-eyebrow">05 / Advanced</p>
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
      </div>
    </div>
  </Transition>
</template>
