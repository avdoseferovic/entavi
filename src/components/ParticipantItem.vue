<script setup lang="ts">
import { Crown } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'
import { useTauri } from '../composables/useTauri'

const props = defineProps<{
  name: string
  isSelf: boolean
  isHostEntry: boolean
  peerId?: string
}>()

const { state, getInitials } = useAppState()
const tauri = useTauri()

async function kick() {
  if (props.peerId) {
    try {
      await tauri.kickPeer(props.peerId)
    } catch (err) {
      console.error('Kick peer error:', err)
    }
  }
}

async function forceMute() {
  if (props.peerId) {
    try {
      await tauri.forceMutePeer(props.peerId)
    } catch (err) {
      console.error('Force mute error:', err)
    }
  }
}
</script>

<template>
  <div class="participant-item">
    <div class="avatar">{{ getInitials(name) }}</div>
    <div class="participant-info">
      <span class="peer-label">{{ name }}</span>
      <span v-if="isSelf" class="you-tag">(You)</span>
      <span v-if="isHostEntry" class="host-crown">
        <Crown :size="14" />
      </span>
    </div>
    <div v-if="state.isHost && !isSelf && peerId" class="participant-actions">
      <button class="btn-force-mute" @click="forceMute">Mute</button>
      <button class="btn-kick" @click="kick">Kick</button>
    </div>
  </div>
</template>
