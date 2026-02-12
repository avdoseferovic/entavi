<script setup lang="ts">
import { computed } from 'vue'
import { Signal, SignalMedium, SignalLow, SignalZero } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'

const { state } = useAppState()

const pingClass = computed(() => {
  const ms = state.pingMs
  if (ms == null) return 'ping-none'
  if (ms < 80) return 'ping-good'
  if (ms < 150) return 'ping-medium'
  return 'ping-bad'
})

const pingIcon = computed(() => {
  const ms = state.pingMs
  if (ms == null) return SignalZero
  if (ms < 80) return Signal
  if (ms < 150) return SignalMedium
  return SignalLow
})

const pingLabel = computed(() => {
  return state.pingMs != null ? `${state.pingMs}ms` : '—'
})
</script>

<template>
  <span class="ping-indicator" :class="pingClass">
    <component :is="pingIcon" :size="14" />
    {{ pingLabel }}
  </span>
</template>
