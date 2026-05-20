<script setup lang="ts">
import { computed } from 'vue'
import { Crown, MicOff, MoreHorizontal } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'
import { useTauri } from '../composables/useTauri'

const props = defineProps<{
  name: string
  isSelf: boolean
  isHostEntry: boolean
  isSpeaking: boolean
  isMutedPeer: boolean
  peerId?: string
}>()

const { state, getInitials } = useAppState()
const tauri = useTauri()

// Deterministic color from name — 6-color palette
const AVATAR_COLORS = [
  { bg: 'rgba(124,108,255,0.18)', text: '#9a8dff' }, // indigo
  { bg: 'rgba(74,222,128,0.15)',  text: '#4ade80' }, // green
  { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b' }, // amber
  { bg: 'rgba(248,113,113,0.15)', text: '#f87171' }, // red
  { bg: 'rgba(96,165,250,0.15)',  text: '#60a5fa' }, // blue
  { bg: 'rgba(232,121,249,0.15)', text: '#e879f9' }, // fuchsia
]

const avatarColor = computed(() => {
  let hash = 0
  for (let i = 0; i < props.name.length; i++) hash = (hash * 31 + props.name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
})

async function kick() {
  if (props.peerId) await tauri.kickPeer(props.peerId).catch(console.error)
}

async function forceMute() {
  if (props.peerId) await tauri.forceMutePeer(props.peerId).catch(console.error)
}
</script>

<template>
  <div class="participant-item" :class="{ speaking: isSpeaking && !isMutedPeer }">
    <!-- Avatar: square, name-hashed color -->
    <div
      class="peer-avatar"
      :style="{ background: avatarColor.bg, color: avatarColor.text }"
      :class="{ 'peer-avatar--muted': isMutedPeer }"
    >
      {{ getInitials(name) }}
    </div>

    <!-- Name + badges -->
    <div class="participant-info">
      <span class="peer-label">{{ name }}</span>
      <span v-if="isSelf" class="you-tag">(You)</span>
      <span v-if="isHostEntry" class="host-crown"><Crown :size="12" /></span>
    </div>

    <!-- Speaking level bar (CSS-only animation) -->
    <div v-if="isSpeaking && !isMutedPeer" class="peer-level-bar" aria-hidden="true">
      <div class="peer-level-fill" />
    </div>

    <!-- Muted indicator -->
    <span v-if="isMutedPeer" class="muted-indicator"><MicOff :size="13" /></span>

    <!-- Host actions: hover (desktop) + overflow (touch) -->
    <template v-if="state.isHost && !isSelf && peerId">
      <div class="participant-actions">
        <button class="btn-force-mute" @click="forceMute">Mute</button>
        <button class="btn-kick" @click="kick">Kick</button>
      </div>
      <button class="participant-overflow" title="More" @click.stop>
        <MoreHorizontal :size="14" />
      </button>
    </template>
  </div>
</template>
