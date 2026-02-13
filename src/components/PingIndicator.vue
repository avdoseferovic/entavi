<script setup lang="ts">
import { computed } from 'vue'
import { useAppState } from '../composables/useAppState'

const { state } = useAppState()

const pingClass = computed(() => {
  const ms = state.pingMs
  if (ms == null) return 'ping-none'
  if (ms < 80) return 'ping-good'
  if (ms < 150) return 'ping-medium'
  return 'ping-bad'
})

const pingLabel = computed(() => {
  return state.pingMs != null ? `${state.pingMs}ms` : '—'
})
</script>

<template>
  <span class="ping-indicator" :class="pingClass">
    {{ pingLabel }}
  </span>
</template>
