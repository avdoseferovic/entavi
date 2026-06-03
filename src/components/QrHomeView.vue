<script setup lang="ts">
import { ref, watch } from 'vue'
import QRCode from 'qrcode'
import { Link, Copy, Check, RefreshCw, ScanLine, ShieldCheck, Loader, RotateCcw } from 'lucide-vue-next'
import { callUrl, callLink } from '../lib/callcode'
import markUrl from '../assets/entavi-mark.svg'

const props = defineProps<{
  code: string | null
  loading: boolean
  error: string
}>()

defineEmits<{
  rotate: []
  scan: []
}>()

const qrSrc = ref('')
const copied = ref(false)

watch(
  () => props.code,
  async (code) => {
    if (!code) {
      qrSrc.value = ''
      return
    }
    try {
      qrSrc.value = await QRCode.toDataURL(callLink(code), {
        width: 188,
        margin: 0,
        errorCorrectionLevel: 'H',
        color: { dark: '#143036', light: '#ffffff' },
      })
    } catch {
      qrSrc.value = ''
    }
  },
  { immediate: true },
)

async function copy() {
  if (!props.code) return
  try {
    await navigator.clipboard.writeText(callLink(props.code))
    copied.value = true
    setTimeout(() => { copied.value = false }, 1600)
  } catch {
    /* clipboard unavailable */
  }
}
</script>

<template>
  <div class="qrcard">
    <div class="eyebrow">Your call code</div>
    <h1>Scan to call me</h1>
    <p class="lede">Anyone who scans this can ring you - once. No number, no account, no trail.</p>

    <div class="qrwrap">
      <template v-if="error">
        <div class="qr-loading" style="animation: none">
          <button class="iconbtn" title="Try again" aria-label="Try again" @click="$emit('rotate')">
            <RotateCcw :size="28" />
          </button>
        </div>
      </template>
      <template v-else-if="loading || !code">
        <div class="qr-loading"><Loader :size="36" /></div>
      </template>
      <template v-else>
        <img class="qr" :src="qrSrc" alt="QR code for your call link" />
        <img class="badge-mark" :src="markUrl" alt="" aria-hidden="true" />
      </template>
    </div>

    <div class="codeline">
      <span class="lk"><Link :size="15" /></span>
      <code>{{ code ? callUrl(code) : (error ? 'Couldn’t reach the network' : 'Generating your code…') }}</code>
      <button v-if="code" class="copy" :aria-label="copied ? 'Copied' : 'Copy call link'" @click="copy">
        <component :is="copied ? Check : Copy" :size="14" /> {{ copied ? 'Copied' : 'Copy' }}
      </button>
    </div>

    <div class="qr-actions">
      <button class="cta ghost" @click="$emit('rotate')"><RefreshCw :size="17" /> New code</button>
      <button class="cta primary" @click="$emit('scan')"><ScanLine :size="18" /> Scan a code</button>
    </div>

    <div class="notrace">
      <span class="lk"><ShieldCheck :size="14" /></span> Nothing is saved - no contacts, no history
    </div>
  </div>
</template>
