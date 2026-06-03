<script setup lang="ts">
import { EyeOff, Settings } from 'lucide-vue-next'
import markUrl from '../assets/entavi-mark.svg'

const isTauriHost = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

defineEmits<{ settings: [] }>()
</script>

<template>
  <header class="appbar">
    <div class="brand">
      <img :src="markUrl" alt="Entavi" />
      <span class="wordmark">Entavi</span>
    </div>
    <div class="appbar-right">
      <span class="ghosttag"><EyeOff :size="14" /> No trace</span>
      <button
        v-if="isTauriHost"
        class="iconbtn"
        title="Settings"
        aria-label="Settings"
        @click="$emit('settings')"
      >
        <Settings :size="19" />
      </button>
    </div>
  </header>
</template>
