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
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
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
</script>

<template>
  <div class="chat-panel">
    <div ref="messagesEl" class="chat-messages">
      <div v-if="state.messages.length === 0" class="chat-empty">
        No messages yet
      </div>
      <div
        v-for="msg in state.messages"
        :key="msg.id"
        class="chat-bubble"
        :class="{ self: msg.is_self }"
      >
        <div v-if="!msg.is_self" class="chat-sender">{{ msg.sender_name }}</div>
        <div class="chat-content">{{ msg.content }}</div>
      </div>
    </div>
    <div class="chat-input-row">
      <input
        v-model="input"
        type="text"
        class="chat-input"
        placeholder="Type a message..."
        @keydown="onKeydown"
      />
      <button class="chat-send-btn" @click="send" :disabled="!input.trim()">
        <Send :size="18" />
      </button>
    </div>
  </div>
</template>
