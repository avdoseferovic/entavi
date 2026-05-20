<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { Send } from 'lucide-vue-next'
import { useAppState } from '../composables/useAppState'
import { useTauri } from '../composables/useTauri'

const { state } = useAppState()
const { sendChatMessage } = useTauri()

const input = ref('')
const messagesEl = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
}

watch(() => state.messages.length, scrollToBottom)

async function send() {
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  await sendChatMessage(text)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 10) return 'just now'
  if (diff < 60) return `${diff}s`
  const m = Math.floor(diff / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}
</script>

<template>
  <div class="chat-panel">
    <div ref="messagesEl" class="chat-messages">
      <div v-if="state.messages.length === 0" class="chat-empty">
        <span class="chat-empty-eyebrow">CHAT</span>
        No messages yet — say hi
      </div>
      <div
        v-for="msg in state.messages"
        :key="msg.id"
        class="chat-bubble"
        :class="{ self: msg.is_self }"
      >
        <div v-if="!msg.is_self" class="chat-bubble-meta">
          <span class="chat-sender">{{ msg.sender_name }}</span>
          <span class="chat-time">{{ relativeTime(msg.timestamp) }}</span>
        </div>
        <div class="chat-content">{{ msg.content }}</div>
        <span v-if="msg.is_self" class="chat-time chat-time--self">
          {{ relativeTime(msg.timestamp) }}
        </span>
      </div>
    </div>
    <div class="chat-compose">
      <input
        v-model="input"
        type="text"
        class="chat-input"
        placeholder="Message…"
        @keydown="onKeydown"
      />
      <button class="chat-send-btn" :disabled="!input.trim()" @click="send">
        <Send :size="16" />
      </button>
    </div>
  </div>
</template>
