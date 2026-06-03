<script setup lang="ts">
import { Mic, MicOff, PhoneOff } from 'lucide-vue-next'

defineProps<{
  muted: boolean
}>()

defineEmits<{
  'toggle-mute': []
  leave: []
}>()
</script>

<template>
  <div class="ctrlbar">
    <button
      class="ctl"
      :class="{ off: muted }"
      :title="muted ? 'Unmute' : 'Mute'"
      :aria-label="muted ? 'Unmute microphone' : 'Mute microphone'"
      :aria-pressed="muted"
      @click="$emit('toggle-mute')"
    >
      <component :is="muted ? MicOff : Mic" :size="22" />
    </button>

    <button class="ctl end" title="End call" aria-label="End call" @click="$emit('leave')">
      <PhoneOff :size="22" />
    </button>
  </div>
</template>
