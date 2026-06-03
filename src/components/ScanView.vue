<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ScanLine, Link, ArrowLeft } from 'lucide-vue-next'
import { parseCode } from '../lib/callcode'
import { useAppState } from '../composables/useAppState'

const { state } = useAppState()

const emit = defineEmits<{
  connect: [code: string]
  back: []
}>()

const link = ref('')
const error = ref('')
const videoEl = ref<HTMLVideoElement | null>(null)
const cameraOn = ref(false)

let stream: MediaStream | null = null
let detectTimer: ReturnType<typeof setInterval> | null = null
let stopped = false

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

function submitLink() {
  const code = parseCode(link.value)
  if (!code) {
    error.value = 'That doesn’t look like an Entavi code.'
    return
  }
  connect(code)
}

function connect(code: string) {
  stopCamera()
  emit('connect', code)
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    if (stopped) { stopCamera(); return }
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play().catch(() => {})
      cameraOn.value = true
      startDetection()
    }
  } catch {
    // No camera / permission denied — paste-a-link remains the path.
    cameraOn.value = false
  }
}

function startDetection() {
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (!Ctor || !videoEl.value) return
  const detector = new Ctor({ formats: ['qr_code'] })
  detectTimer = setInterval(async () => {
    if (!videoEl.value || videoEl.value.readyState < 2) return
    try {
      const found = await detector.detect(videoEl.value)
      if (found.length > 0) {
        const code = parseCode(found[0].rawValue)
        if (code) connect(code)
      }
    } catch {
      /* transient decode error — keep polling */
    }
  }, 350)
}

function stopCamera() {
  if (detectTimer) { clearInterval(detectTimer); detectTimer = null }
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null }
  cameraOn.value = false
}

onMounted(() => {
  if (state.roomNotFound) {
    error.value = 'That code isn’t active anymore — ask them for a fresh one.'
    state.roomNotFound = false
  }
  startCamera()
})
onUnmounted(() => { stopped = true; stopCamera() })
</script>

<template>
  <div class="scancard">
    <div class="viewfinder">
      <video ref="videoEl" v-show="cameraOn" muted playsinline></video>
      <span class="corner tl" /><span class="corner tr" />
      <span class="corner bl" /><span class="corner br" />
      <span class="scanline" />
      <div v-if="!cameraOn" class="hint">
        <ScanLine :size="30" color="rgba(255,255,255,.7)" />
        Point at someone’s Entavi code
      </div>
    </div>

    <h1>Scan a code to call</h1>
    <p>Hold their QR in the frame — the call connects the moment it’s read.</p>

    <div class="orline">or paste a link</div>
    <div class="paste">
      <div class="inp">
        <Link :size="16" color="var(--fg-3)" />
        <input
          v-model="link"
          type="text"
          placeholder="entavi.app/c/…"
          autofocus
          @keydown.enter="submitLink"
          @input="error = ''"
        />
      </div>
      <button class="cta primary" style="padding: 11px 18px" @click="submitLink">Connect</button>
    </div>

    <p v-if="error" class="scan-error">{{ error }}</p>

    <button class="rotate" @click="$emit('back')"><ArrowLeft :size="15" /> Back to my code</button>
  </div>
</template>
