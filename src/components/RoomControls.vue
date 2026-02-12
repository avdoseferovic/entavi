<script setup lang="ts">
import { Mic, MicOff, LogOut } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'

const { state } = useAppState()

defineEmits<{
  'toggle-mute': []
  leave: []
}>()
</script>

<template>
  <div class="room-controls">
    <button
      class="btn-mute-circle"
      :class="{ muted: state.isMuted }"
      :title="state.isMuted ? 'Unmute' : 'Mute'"
      @click="$emit('toggle-mute')"
    >
      <MicOff v-if="state.isMuted" :size="22" />
      <Mic v-else :size="22" />
    </button>
    <button
      class="btn-leave-circle"
      title="Leave room"
      @click="$emit('leave')"
    >
      <LogOut :size="20" />
    </button>
  </div>
</template>
