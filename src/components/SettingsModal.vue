<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'
import { useTauri } from '../composables/useTauri'
import MicSelector from './MicSelector.vue'
import SpeakerSelector from './SpeakerSelector.vue'

const { state } = useAppState()
const tauri = useTauri()

const emit = defineEmits<{ close: [] }>()

function toggleNoiseSuppression() {
  state.noiseSuppression = !state.noiseSuppression
  localStorage.setItem('entavi:noiseSuppression', String(state.noiseSuppression))
  tauri.setNoiseSuppression(state.noiseSuppression)
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
      <div
        class="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        <div class="settings-modal-header">
          <h2 id="settings-modal-title">Settings</h2>
          <button
            class="settings-close-btn"
            aria-label="Close settings"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>
        <div class="settings-modal-body">
          <p class="settings-section-eyebrow">Audio</p>
          <MicSelector />
          <SpeakerSelector />
          <div class="setting-group">
            <button
              type="button"
              class="noise-toggle"
              role="switch"
              :aria-checked="state.noiseSuppression"
              @click="toggleNoiseSuppression"
            >
              <span class="toggle-track" :class="{ on: state.noiseSuppression }">
                <span class="toggle-thumb" />
              </span>
              <span class="toggle-label">Noise suppression</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
