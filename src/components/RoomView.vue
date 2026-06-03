<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Lock, MicOff } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'
import RoomControls from './RoomControls.vue'

const { state, getInitials, getDisplayName } = useAppState()

defineEmits<{
  'toggle-mute': []
  leave: []
}>()

const elapsed = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const connected = computed(() => state.peerList.size > 0)
const totalTiles = computed(() => state.peerList.size + 1)
const gridCols = computed(() => {
  const n = totalTiles.value
  if (n <= 1) return 1
  if (n <= 4) return 2
  return 3
})

const timeLabel = computed(() => {
  const mm = String(Math.floor(elapsed.value / 60)).padStart(2, '0')
  const ss = String(elapsed.value % 60).padStart(2, '0')
  return `${mm}:${ss}`
})

watch(
  connected,
  (isUp) => {
    if (isUp && !timer) {
      elapsed.value = 0
      timer = setInterval(() => { elapsed.value += 1 }, 1000)
    } else if (!isUp && timer) {
      clearInterval(timer)
      timer = null
    }
  },
  { immediate: true },
)

onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="stage">
    <div class="scrim" />

    <!-- Encrypted + timer pill -->
    <div class="enc-pill">
      <span class="lk"><Lock :size="14" /></span>
      Encrypted <span class="timer">· {{ connected ? timeLabel : '00:00' }} ·</span>
      <span class="muted-dim">not recorded</span>
    </div>

    <!-- Reconnecting status -->
    <div class="room-status-pill room-status-pill--reconnecting" :class="{ visible: state.isReconnecting }">
      <span class="reconnecting-pulse" /> Reconnecting… (attempt {{ state.reconnectAttempt }})
    </div>

    <!-- Connecting (no peer yet) -->
    <div v-if="!connected" class="calling">
      <div class="calling-av">
        <span class="pulse-ring" /><span class="pulse-ring d2" /><span class="pulse-ring d3" />
        <div class="av" style="width: 120px; height: 120px; font-size: 40px">{{ getInitials(getDisplayName()) }}</div>
      </div>
      <div class="calling-name">{{ state.isJoining ? 'Connecting…' : 'Waiting for your guest' }}</div>
      <div class="calling-status"><Lock :size="14" color="var(--teal-300)" /> Connecting securely — only you two can hear this.</div>
    </div>

    <!-- In-call video grid -->
    <div v-else class="vgrid" :class="`cols-${gridCols}`">
      <div
        v-for="[peerId, name] in state.peerList"
        :key="peerId"
        class="vtile"
        :class="{ speaking: state.speakingPeers.has(peerId) && !state.mutedPeers.has(peerId) }"
      >
        <div class="av" style="width: 116px; height: 116px; font-size: 38px">{{ getInitials(name || peerId.slice(0, 2)) }}</div>
        <div class="tname">
          {{ name || peerId.slice(0, 8) }} <span class="sub">· this call only</span>
          <MicOff v-if="state.mutedPeers.has(peerId)" :size="13" />
        </div>
      </div>

      <div class="vtile you" :class="{ speaking: state.selfSpeaking && !state.isMuted }">
        <div class="av" style="width: 108px; height: 108px; font-size: 34px">{{ getInitials(getDisplayName()) }}</div>
        <div class="tname">
          You
          <MicOff v-if="state.isMuted" :size="13" />
        </div>
      </div>
    </div>

    <!-- Control bar: mute + end -->
    <RoomControls
      :muted="state.isMuted"
      @toggle-mute="$emit('toggle-mute')"
      @leave="$emit('leave')"
    />
  </div>
</template>
