use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleRate;
use ringbuf::{
    traits::{Consumer, Observer, Producer, Split},
    HeapRb,
};

use tauri::{AppHandle, Emitter};

use crate::types::{AudioDevice, EncodedFrame, FRAME_SIZE, SAMPLE_RATE, EVENT_MIC_TEST_LEVEL};

// ── AudioCapture ──

pub struct AudioCapture {
    muted: Arc<AtomicBool>,
    speaking: Arc<AtomicBool>,
    pub encoded_rx: flume::Receiver<EncodedFrame>,
}

impl AudioCapture {
    pub fn new(device_name: Option<String>, noise_suppression: Arc<AtomicBool>) -> Result<Self> {
        let muted = Arc::new(AtomicBool::new(false));
        let speaking = Arc::new(AtomicBool::new(false));
        let (encoded_tx, encoded_rx) = flume::unbounded::<EncodedFrame>();
        let muted_flag = Arc::clone(&muted);
        let speaking_flag = Arc::clone(&speaking);

        std::thread::Builder::new()
            .name("audio-capture".into())
            .spawn(move || {
                if let Err(e) = run_capture(device_name, muted_flag, speaking_flag, encoded_tx, noise_suppression) {
                    tracing::error!("Audio capture thread error: {e}");
                }
            })?;

        Ok(Self { muted, speaking, encoded_rx })
    }

    pub fn set_muted(&self, muted: bool) {
        self.muted.store(muted, Ordering::Relaxed);
    }

    pub fn is_speaking(&self) -> bool {
        self.speaking.load(Ordering::Relaxed)
    }
}

fn run_capture(
    device_name: Option<String>,
    muted: Arc<AtomicBool>,
    speaking: Arc<AtomicBool>,
    encoded_tx: flume::Sender<EncodedFrame>,
    noise_suppression: Arc<AtomicBool>,
) -> Result<()> {
    let host = cpal::default_host();
    let device = if let Some(ref name) = device_name {
        host.input_devices()
            .context("Failed to enumerate input devices")?
            .find(|d| d.name().ok().as_deref() == Some(name))
            .with_context(|| format!("Input device '{}' not found, falling back to default", name))
            .or_else(|e| {
                tracing::warn!("{e}");
                host.default_input_device().context("No input audio device found")
            })?
    } else {
        host.default_input_device()
            .context("No input audio device found")?
    };

    tracing::info!("Using input device: {:?}", device.name());

    // Query the device's default config instead of hardcoding
    let default_config = device.default_input_config()?;
    let device_rate = default_config.sample_rate().0;
    let device_channels = default_config.channels();

    tracing::info!(
        "Input device config: {}Hz, {} channels (target: {}Hz mono)",
        device_rate,
        device_channels,
        SAMPLE_RATE
    );

    let config = cpal::StreamConfig {
        channels: device_channels,
        sample_rate: SampleRate(device_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    // Size ring buffer for the device rate (enough for ~200ms)
    let ring_size = (device_rate as usize / 5) * device_channels as usize;
    let ring = HeapRb::<f32>::new(ring_size);
    let (mut producer, mut consumer) = ring.split();

    let muted_flag = Arc::clone(&muted);

    let stream = device.build_input_stream(
        &config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            if muted_flag.load(Ordering::Relaxed) {
                return;
            }
            let _ = producer.push_slice(data);
        },
        move |err| {
            tracing::error!("Audio input error: {err}");
        },
        None,
    )?;
    stream.play()?;

    // Opus encoder — always 48kHz mono
    let mut encoder =
        opus::Encoder::new(SAMPLE_RATE, opus::Channels::Mono, opus::Application::Audio)
            .map_err(|e| anyhow::anyhow!("Failed to create opus encoder: {e}"))?;

    let _ = encoder.set_bitrate(opus::Bitrate::Bits(64_000));
    let _ = encoder.set_inband_fec(true);
    let _ = encoder.set_packet_loss_perc(10);
    let _ = encoder.set_bandwidth(opus::Bandwidth::Fullband);
    let _ = encoder.set_vbr(true);
    let _ = encoder.set_complexity(10);

    // Noise suppression (RNNoise) — works on 480-sample frames in i16 range
    const DENOISE_FRAME: usize = nnnoiseless::FRAME_SIZE; // 480
    let mut denoise = nnnoiseless::DenoiseState::new();
    let mut denoise_in = vec![0.0f32; DENOISE_FRAME];
    let mut denoise_out = vec![0.0f32; DENOISE_FRAME];

    // We need to read device frames, convert to mono 48kHz, then encode in 20ms chunks.
    // Device frame size in samples (interleaved): 20ms worth at device rate * channels
    let device_frame_samples = (device_rate as usize / 50) * device_channels as usize;
    let mut device_buf = vec![0.0f32; device_frame_samples];
    let mut mono_48k_buf = vec![0.0f32; FRAME_SIZE]; // 960 samples = 20ms @ 48kHz
    let mut opus_buf = vec![0u8; 4000];

    let need_resample = device_rate != SAMPLE_RATE;
    let need_downmix = device_channels > 1;

    loop {
        if consumer.occupied_len() < device_frame_samples {
            std::thread::sleep(std::time::Duration::from_millis(5));
            continue;
        }

        consumer.pop_slice(&mut device_buf);

        // Step 1: Downmix to mono if needed
        let mono: Vec<f32> = if need_downmix {
            device_buf
                .chunks(device_channels as usize)
                .map(|frame| frame.iter().sum::<f32>() / device_channels as f32)
                .collect()
        } else {
            device_buf.clone()
        };

        // Step 2: Resample to 48kHz if needed (linear interpolation)
        if need_resample {
            let ratio = SAMPLE_RATE as f64 / device_rate as f64;
            for i in 0..FRAME_SIZE {
                let src_pos = i as f64 / ratio;
                let idx = src_pos as usize;
                let frac = src_pos - idx as f64;
                let s0 = *mono.get(idx).unwrap_or(&0.0);
                let s1 = *mono.get(idx + 1).unwrap_or(&s0);
                mono_48k_buf[i] = (s0 as f64 * (1.0 - frac) + s1 as f64 * frac) as f32;
            }
        } else {
            let len = mono.len().min(FRAME_SIZE);
            mono_48k_buf[..len].copy_from_slice(&mono[..len]);
            for s in &mut mono_48k_buf[len..] {
                *s = 0.0;
            }
        }

        // Step 3: Noise suppression (two 480-sample frames per 960-sample Opus frame)
        if noise_suppression.load(Ordering::Relaxed) {
            for chunk_idx in 0..2 {
                let offset = chunk_idx * DENOISE_FRAME;
                for i in 0..DENOISE_FRAME {
                    // nnnoiseless expects i16-range floats [-32768, 32767]
                    denoise_in[i] = mono_48k_buf[offset + i] * 32767.0;
                }
                denoise.process_frame(&mut denoise_out, &denoise_in);
                for i in 0..DENOISE_FRAME {
                    // Convert back to [-1.0, 1.0]
                    mono_48k_buf[offset + i] = denoise_out[i] / 32767.0;
                }
            }
        }

        // Step 4: Voice activity detection (after denoising)
        let peak = mono_48k_buf.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        speaking.store(peak > 0.01, Ordering::Relaxed);

        // Step 5: Opus encode
        match encoder.encode_float(&mono_48k_buf, &mut opus_buf) {
            Ok(len) => {
                let frame = EncodedFrame {
                    data: opus_buf[..len].to_vec(),
                };
                if encoded_tx.send(frame).is_err() {
                    break;
                }
            }
            Err(e) => {
                tracing::warn!("Opus encode error: {e}");
            }
        }
    }

    Ok(())
}

// ── Device enumeration ──

pub fn list_input_devices() -> Vec<AudioDevice> {
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|d| d.name().ok());

    let devices = match host.input_devices() {
        Ok(devs) => devs,
        Err(e) => {
            tracing::error!("Failed to enumerate input devices: {e}");
            return Vec::new();
        }
    };

    devices
        .filter_map(|d| {
            let name = d.name().ok()?;
            let is_default = default_name.as_deref() == Some(&name);
            Some(AudioDevice { name, is_default })
        })
        .collect()
}

// ── AudioPlayback ──

pub struct AudioPlayback {
    tx: flume::Sender<Vec<f32>>,
}

impl AudioPlayback {
    pub fn new() -> Result<Self> {
        let (tx, rx) = flume::unbounded::<Vec<f32>>();

        std::thread::Builder::new()
            .name("audio-playback".into())
            .spawn(move || {
                if let Err(e) = run_playback(rx) {
                    tracing::error!("Audio playback thread error: {e}");
                }
            })?;

        Ok(Self { tx })
    }

    pub fn write(&self, samples: &[f32]) {
        let _ = self.tx.send(samples.to_vec());
    }
}

// ── MicTest (loopback through opus encode → decode) ──

pub struct MicTest {
    stop: Arc<AtomicBool>,
}

impl MicTest {
    pub fn new(device_name: Option<String>, app: AppHandle, noise_suppression: Arc<AtomicBool>) -> Result<Self> {
        let stop = Arc::new(AtomicBool::new(false));
        let stop_flag = Arc::clone(&stop);

        std::thread::Builder::new()
            .name("mic-test".into())
            .spawn(move || {
                if let Err(e) = run_mic_test(device_name, stop_flag, app, noise_suppression) {
                    tracing::error!("Mic test error: {e}");
                }
            })?;

        Ok(Self { stop })
    }

    pub fn stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

impl Drop for MicTest {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

fn run_mic_test(device_name: Option<String>, stop: Arc<AtomicBool>, app: AppHandle, noise_suppression: Arc<AtomicBool>) -> Result<()> {
    let host = cpal::default_host();

    // ── Input device ──
    let in_device = if let Some(ref name) = device_name {
        host.input_devices()
            .context("Failed to enumerate input devices")?
            .find(|d| d.name().ok().as_deref() == Some(name))
            .or_else(|| host.default_input_device())
            .context("No input audio device found")?
    } else {
        host.default_input_device()
            .context("No input audio device found")?
    };
    tracing::info!("Mic test input: {:?}", in_device.name());

    // ── Output device ──
    let out_device = host
        .default_output_device()
        .context("No output audio device found")?;

    // ── Input stream setup ──
    let in_config = in_device.default_input_config()?;
    let in_rate = in_config.sample_rate().0;
    let in_channels = in_config.channels();

    let in_stream_config = cpal::StreamConfig {
        channels: in_channels,
        sample_rate: SampleRate(in_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    let ring_size = (in_rate as usize / 5) * in_channels as usize;
    let ring = HeapRb::<f32>::new(ring_size);
    let (mut producer, mut consumer) = ring.split();

    let in_stream = in_device.build_input_stream(
        &in_stream_config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            let _ = producer.push_slice(data);
        },
        |err| tracing::error!("Mic test input error: {err}"),
        None,
    )?;
    in_stream.play()?;

    // ── Output stream setup ──
    let out_config = out_device.default_output_config()?;
    let out_rate = out_config.sample_rate().0;
    let out_channels = out_config.channels();

    let out_stream_config = cpal::StreamConfig {
        channels: out_channels,
        sample_rate: SampleRate(out_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    let out_ring_size = (out_rate as usize / 5) * out_channels as usize;
    let out_ring = HeapRb::<f32>::new(out_ring_size);
    let (out_producer, mut out_consumer) = out_ring.split();
    let out_producer = Arc::new(std::sync::Mutex::new(out_producer));

    let out_stream = out_device.build_output_stream(
        &out_stream_config,
        move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
            for sample in data.iter_mut() {
                *sample = out_consumer.try_pop().unwrap_or(0.0);
            }
        },
        |err| tracing::error!("Mic test output error: {err}"),
        None,
    )?;
    out_stream.play()?;

    // ── Opus encode → decode loopback ──
    let mut encoder =
        opus::Encoder::new(SAMPLE_RATE, opus::Channels::Mono, opus::Application::Audio)
            .map_err(|e| anyhow::anyhow!("opus encoder: {e}"))?;
    let _ = encoder.set_bitrate(opus::Bitrate::Bits(64_000));
    let _ = encoder.set_bandwidth(opus::Bandwidth::Fullband);
    let _ = encoder.set_vbr(true);
    let _ = encoder.set_complexity(10);

    let mut decoder = opus::Decoder::new(SAMPLE_RATE, opus::Channels::Mono)
        .map_err(|e| anyhow::anyhow!("opus decoder: {e}"))?;

    // Noise suppression
    const DENOISE_FRAME: usize = nnnoiseless::FRAME_SIZE;
    let mut denoise = nnnoiseless::DenoiseState::new();
    let mut denoise_in = vec![0.0f32; DENOISE_FRAME];
    let mut denoise_out = vec![0.0f32; DENOISE_FRAME];

    let need_resample_in = in_rate != SAMPLE_RATE;
    let need_downmix = in_channels > 1;
    let need_resample_out = out_rate != SAMPLE_RATE;
    let need_upmix = out_channels > 1;

    let device_frame_samples = (in_rate as usize / 50) * in_channels as usize;
    let mut device_buf = vec![0.0f32; device_frame_samples];
    let mut mono_48k = vec![0.0f32; FRAME_SIZE];
    let mut opus_buf = vec![0u8; 4000];
    let mut decoded_buf = vec![0.0f32; FRAME_SIZE];
    let mut level_counter: u32 = 0;

    while !stop.load(Ordering::Relaxed) {
        if consumer.occupied_len() < device_frame_samples {
            std::thread::sleep(std::time::Duration::from_millis(5));
            continue;
        }

        consumer.pop_slice(&mut device_buf);

        // Downmix to mono
        let mono: Vec<f32> = if need_downmix {
            device_buf
                .chunks(in_channels as usize)
                .map(|frame| frame.iter().sum::<f32>() / in_channels as f32)
                .collect()
        } else {
            device_buf.clone()
        };

        // Resample to 48kHz
        if need_resample_in {
            let ratio = SAMPLE_RATE as f64 / in_rate as f64;
            for i in 0..FRAME_SIZE {
                let src_pos = i as f64 / ratio;
                let idx = src_pos as usize;
                let frac = src_pos - idx as f64;
                let s0 = *mono.get(idx).unwrap_or(&0.0);
                let s1 = *mono.get(idx + 1).unwrap_or(&s0);
                mono_48k[i] = (s0 as f64 * (1.0 - frac) + s1 as f64 * frac) as f32;
            }
        } else {
            let len = mono.len().min(FRAME_SIZE);
            mono_48k[..len].copy_from_slice(&mono[..len]);
            for s in &mut mono_48k[len..] {
                *s = 0.0;
            }
        }

        // Noise suppression (conditional)
        if noise_suppression.load(Ordering::Relaxed) {
            for chunk_idx in 0..2 {
                let offset = chunk_idx * DENOISE_FRAME;
                for i in 0..DENOISE_FRAME {
                    denoise_in[i] = mono_48k[offset + i] * 32767.0;
                }
                denoise.process_frame(&mut denoise_out, &denoise_in);
                for i in 0..DENOISE_FRAME {
                    mono_48k[offset + i] = denoise_out[i] / 32767.0;
                }
            }
        }

        // Emit level event (~every 50ms = every 2-3 frames at 20ms/frame)
        level_counter += 1;
        if level_counter >= 3 {
            level_counter = 0;
            let peak = mono_48k.iter().map(|s| s.abs()).fold(0.0f32, f32::max).clamp(0.0, 1.0);
            let _ = app.emit(EVENT_MIC_TEST_LEVEL, peak);
        }

        // Opus encode
        let encoded_len = match encoder.encode_float(&mono_48k, &mut opus_buf) {
            Ok(len) => len,
            Err(_) => continue,
        };

        // Opus decode
        let decoded_samples = match decoder.decode_float(&opus_buf[..encoded_len], &mut decoded_buf, false) {
            Ok(n) => n,
            Err(_) => continue,
        };

        let pcm = &decoded_buf[..decoded_samples];

        // Resample from 48kHz to output rate
        let resampled: Vec<f32> = if need_resample_out {
            let ratio = out_rate as f64 / SAMPLE_RATE as f64;
            let out_len = (pcm.len() as f64 * ratio) as usize;
            (0..out_len)
                .map(|i| {
                    let src_pos = i as f64 / ratio;
                    let idx = src_pos as usize;
                    let frac = src_pos - idx as f64;
                    let s0 = *pcm.get(idx).unwrap_or(&0.0);
                    let s1 = *pcm.get(idx + 1).unwrap_or(&s0);
                    (s0 as f64 * (1.0 - frac) + s1 as f64 * frac) as f32
                })
                .collect()
        } else {
            pcm.to_vec()
        };

        // Upmix to output channels
        let output: Vec<f32> = if need_upmix {
            resampled
                .iter()
                .flat_map(|&s| std::iter::repeat_n(s, out_channels as usize))
                .collect()
        } else {
            resampled
        };

        if let Ok(mut p) = out_producer.lock() {
            let _ = p.push_slice(&output);
        }
    }

    tracing::info!("Mic test stopped");
    Ok(())
}

fn run_playback(rx: flume::Receiver<Vec<f32>>) -> Result<()> {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .context("No output audio device found")?;

    tracing::info!("Using output device: {:?}", device.name());

    // Query the device's default output config
    let default_config = device.default_output_config()?;
    let device_rate = default_config.sample_rate().0;
    let device_channels = default_config.channels();

    tracing::info!(
        "Output device config: {}Hz, {} channels (source: {}Hz mono)",
        device_rate,
        device_channels,
        SAMPLE_RATE
    );

    let config = cpal::StreamConfig {
        channels: device_channels,
        sample_rate: SampleRate(device_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    let need_resample = device_rate != SAMPLE_RATE;
    let need_upmix = device_channels > 1;

    // Ring buffer sized for the device rate and channels
    let ring_size = (device_rate as usize / 5) * device_channels as usize;
    let ring = HeapRb::<f32>::new(ring_size);
    let (producer, mut consumer) = ring.split();
    let producer = Arc::new(std::sync::Mutex::new(producer));

    let stream = device.build_output_stream(
        &config,
        move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
            for sample in data.iter_mut() {
                *sample = consumer.try_pop().unwrap_or(0.0);
            }
        },
        move |err| {
            tracing::error!("Audio output error: {err}");
        },
        None,
    )?;
    stream.play()?;

    // Read decoded 48kHz mono, resample/upmix to device format, push to ring buffer
    let producer_clone = Arc::clone(&producer);
    while let Ok(samples) = rx.recv() {
        // Resample from 48kHz to device rate if needed
        let resampled: Vec<f32> = if need_resample {
            let ratio = device_rate as f64 / SAMPLE_RATE as f64;
            let out_len = (samples.len() as f64 * ratio) as usize;
            (0..out_len)
                .map(|i| {
                    let src_pos = i as f64 / ratio;
                    let idx = src_pos as usize;
                    let frac = src_pos - idx as f64;
                    let s0 = *samples.get(idx).unwrap_or(&0.0);
                    let s1 = *samples.get(idx + 1).unwrap_or(&s0);
                    (s0 as f64 * (1.0 - frac) + s1 as f64 * frac) as f32
                })
                .collect()
        } else {
            samples
        };

        // Upmix mono to device channels if needed
        let output: Vec<f32> = if need_upmix {
            resampled
                .iter()
                .flat_map(|&s| std::iter::repeat_n(s, device_channels as usize))
                .collect()
        } else {
            resampled
        };

        if let Ok(mut p) = producer_clone.lock() {
            let _ = p.push_slice(&output);
        }
    }

    Ok(())
}
