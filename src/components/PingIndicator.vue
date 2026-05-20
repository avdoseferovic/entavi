<script setup lang="ts">
import { computed } from 'vue'
import { useAppState } from '../composables/useAppState'

const { state } = useAppState()

const quality = computed(() => {
  const ms = state.pingMs
  if (ms === null) return 'none'
  if (ms < 80) return 'good'
  if (ms < 150) return 'medium'
  return 'bad'
})

const label = computed(() => state.pingMs !== null ? `${state.pingMs}ms` : '—')
</script>

<template>
  <span class="ping-indicator" :class="`ping-${quality}`" :title="label">
    <svg width="14" height="11" viewBox="0 0 14 11" fill="currentColor" aria-hidden="true">
      <rect x="0" y="7" width="3" height="4" rx="1" :opacity="quality !== 'none' ? 1 : 0.25" />
      <rect x="4" y="4" width="3" height="7" rx="1" :opacity="quality === 'medium' || quality === 'good' ? 1 : 0.25" />
      <rect x="8" y="1" width="3" height="10" rx="1" :opacity="quality === 'good' ? 1 : 0.25" />
    </svg>
  </span>
</template>
