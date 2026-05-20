<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useTauri } from '../composables/useTauri'

const tauri = useTauri()

const toggleMuteShortcut = ref<string | null>(null)
const pushToTalkShortcut = ref<string | null>(null)
const recording = ref<string | null>(null) // which mode is being recorded

onMounted(async () => {
  // Restore from localStorage
  toggleMuteShortcut.value = localStorage.getItem('entavi:shortcutToggleMute')
  pushToTalkShortcut.value = localStorage.getItem('entavi:shortcutPushToTalk')
})

function startRecording(mode: string) {
  recording.value = mode
  window.addEventListener('keydown', onKeyDown)
}

function onKeyDown(e: KeyboardEvent) {
  e.preventDefault()
  e.stopPropagation()

  // Ignore modifier-only keys
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('CmdOrCtrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')

  // Map key names to Tauri format
  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  else if (key === 'ArrowUp') key = 'Up'
  else if (key === 'ArrowDown') key = 'Down'
  else if (key === 'ArrowLeft') key = 'Left'
  else if (key === 'ArrowRight') key = 'Right'

  parts.push(key)
  const shortcutStr = parts.join('+')

  if (recording.value === 'toggle_mute') {
    toggleMuteShortcut.value = shortcutStr
    localStorage.setItem('entavi:shortcutToggleMute', shortcutStr)
    tauri.setShortcut('toggle_mute', shortcutStr)
  } else if (recording.value === 'push_to_talk') {
    pushToTalkShortcut.value = shortcutStr
    localStorage.setItem('entavi:shortcutPushToTalk', shortcutStr)
    tauri.setShortcut('push_to_talk', shortcutStr)
  }

  recording.value = null
  window.removeEventListener('keydown', onKeyDown)
}

function clearShortcut(mode: string) {
  if (mode === 'toggle_mute') {
    toggleMuteShortcut.value = null
    localStorage.removeItem('entavi:shortcutToggleMute')
  } else {
    pushToTalkShortcut.value = null
    localStorage.removeItem('entavi:shortcutPushToTalk')
  }
  tauri.setShortcut(mode, null)
}
</script>

<template>
  <div class="shortcut-settings">
    <label class="setting-label">Keyboard shortcuts</label>
    <div class="shortcut-row">
      <span class="shortcut-label">Toggle mute</span>
      <button
        class="shortcut-btn"
        :class="{ recording: recording === 'toggle_mute' }"
        @click="startRecording('toggle_mute')"
      >
        {{ recording === 'toggle_mute' ? 'Press keys...' : toggleMuteShortcut || 'Not set' }}
      </button>
      <button
        v-if="toggleMuteShortcut"
        class="shortcut-clear"
        @click="clearShortcut('toggle_mute')"
      >&times;</button>
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">Push to talk</span>
      <button
        class="shortcut-btn"
        :class="{ recording: recording === 'push_to_talk' }"
        @click="startRecording('push_to_talk')"
      >
        {{ recording === 'push_to_talk' ? 'Press keys...' : pushToTalkShortcut || 'Not set' }}
      </button>
      <button
        v-if="pushToTalkShortcut"
        class="shortcut-clear"
        @click="clearShortcut('push_to_talk')"
      >&times;</button>
    </div>
  </div>
</template>
