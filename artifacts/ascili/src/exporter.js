// ─── Canvas Frame Renderer ─────────────────────────────────────────────────
// Renders one video frame as ASCII art directly onto an HTMLCanvasElement.
// Used by AsciliVideoExporter to produce the recording canvas frames.

import { AsciliEngine, CHAR_SETS, getAnsiColorLut, clamp, adjustPixel, ANSI16, ANSI256, computeCropBox, applyDithering } from './engine.js';
import { AsciliGifEncoder } from './gif-encoder.js';

// Reuse a single offscreen canvas across calls to avoid GC pressure
let _offscreen = null;
let _offCtx    = null;

function getOffscreen(w, h) {
  if (!_offscreen) {
    _offscreen = document.createElement('canvas');
    _offCtx    = _offscreen.getContext('2d', { willReadFrequently: true });
  }
  if (_offscreen.width !== w || _offscreen.height !== h) {
    _offscreen.width  = w;
    _offscreen.height = h;
  }
  return { canvas: _offscreen, ctx: _offCtx };
}

// CHAR_W_FACTOR: fraction of fontSize that one monospace character occupies horizontally.
// Tuned for Courier New at typical sizes.
export const CHAR_W_FACTOR = 0.601;

// ─── Resolution Presets ─────────────────────────────────────────────────────

export const RESOLUTIONS = {
  auto:    null,          // use whatever cols + fontSize produce
  '720p':  { w: 1280, h: 720  },
  '1080p': { w: 1920, h: 1080 },
  '1440p': { w: 2560, h: 1440 },
  '4k':    { w: 3840, h: 2160 },
};

/**
 * Compute a fontSize that makes the ASCII grid fill a target resolution.
 * Returns the text-grid dimensions and the requested encoded dimensions.
 */
export function computeFontForResolution(cols, videoW, videoH, resolution) {
  const res = RESOLUTIONS[resolution];
  if (!res) return null; // 'auto' — caller uses its own fontSize

  const isPortrait = videoH > videoW;
  const targetW = isPortrait ? Math.min(res.w, res.h) : Math.max(res.w, res.h);
  const targetH = isPortrait ? Math.max(res.w, res.h) : Math.min(res.w, res.h);

  const rows = Math.max(1, Math.round(cols * (videoH / videoW) * 0.45));
  // Target: cols * fontSize * CHAR_W_FACTOR ≈ targetW
  const fontFromW = targetW / (cols * CHAR_W_FACTOR);
  // Target: rows * fontSize ≈ targetH
  const fontFromH = targetH / rows;
  // Use the smaller to fit both dimensions
  const fontSize = Math.min(120, Math.max(1, Math.floor(Math.min(fontFromW, fontFromH))));

  const canvasW = makeEven(Math.ceil(cols * fontSize * CHAR_W_FACTOR));
  const canvasH = makeEven(rows * fontSize);
  return { fontSize, canvasW, canvasH, outputW: targetW, outputH: targetH, rows };
}

/**
 * Returns prioritized MIME candidates based on format selection and audio availability.
 */
export function getCandidateMimeTypes(format = 'auto', hasAudio = true) {
  const audioSuffix = hasAudio ? ',mp4a.40.2' : '';
  const opusSuffix = hasAudio ? ',opus' : '';

  const hevcList = [
    `video/mp4;codecs=hevc${audioSuffix}`,
    `video/mp4;codecs=hvc1${audioSuffix}`,
    `video/mp4;codecs=hev1${audioSuffix}`,
    `video/mp4;codecs=hvc1.1.6.L93.B0${audioSuffix}`,
    `video/mp4;codecs=hev1.1.6.L93.B0${audioSuffix}`,
    'video/mp4;codecs=hevc',
    'video/mp4;codecs=hvc1',
    'video/mp4;codecs=hev1',
    'video/mp4;codecs=hvc1.1.6.L93.B0',
    'video/mp4;codecs=hev1.1.6.L93.B0',
  ];

  const avcList = [
    `video/mp4;codecs=avc1.640028${audioSuffix}`, // High Profile (ideal for 1080p)
    `video/mp4;codecs=avc1.4D401F${audioSuffix}`, // Main Profile
    `video/mp4;codecs=avc1.42E01E${audioSuffix}`, // Baseline
    `video/mp4;codecs=avc1${audioSuffix}`,
    'video/mp4;codecs=avc1.640028',
    'video/mp4;codecs=avc1.4D401F',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];

  const webmList = [
    `video/webm;codecs=vp9${opusSuffix}`,
    'video/webm;codecs=vp9',
    `video/webm;codecs=vp8${opusSuffix}`,
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  if (format === 'mp4-h265' || format === 'h265' || format === 'hevc') {
    return [...hevcList, ...avcList, ...webmList];
  }

  if (format === 'mp4-h264' || format === 'h264' || format === 'mp4' || format === 'avc') {
    return [...avcList, ...webmList];
  }

  if (format === 'webm-vp9' || format === 'webm' || format === 'vp9') {
    return [...webmList, ...avcList];
  }

  const isLinux = typeof navigator !== 'undefined' && /Linux|X11/i.test(navigator.userAgent || '') && !/Android/i.test(navigator.userAgent || '');
  return isLinux
    ? [...webmList, ...avcList, ...hevcList]
    : [...avcList, ...hevcList, ...webmList];
}

/** Force a dimension to an even number (required by H.264 encoders). */
function makeEven(n) { return (n + 1) & ~1; }

let _sharedEngine = null;

export function getSharedEngine() {
  if (!_sharedEngine) {
    _sharedEngine = new AsciliEngine();
  }
  return _sharedEngine;
}

export function setSharedEngine(engine) {
  _sharedEngine = engine;
}

/**
 * Render a single video frame as ASCII art onto `outputCanvas`.
 * Delegates directly to AsciliEngine.renderFrame for 100% preview-export parity.
 * Returns { rows, cols, rendered }.
 *
 * @param {HTMLVideoElement|HTMLCanvasElement} videoEl
 * @param {HTMLCanvasElement} outputCanvas
 * @param {object} cfg
 * @param {object} [overrides]  — optional { fontSize } to override cfg.fontSize
 * @param {AsciliEngine} [engineInstance] — optional engine instance
 */
export function renderFrameToCanvas(videoEl, outputCanvas, cfg, overrides, engineInstance = null) {
  const eng = engineInstance || getSharedEngine();
  const cols = Math.min(1000, Math.max(20, Math.round(cfg.cols || 80)));
  const vw = videoEl.videoWidth || videoEl.width || 640;
  const vh = videoEl.videoHeight || videoEl.height || 480;
  const crop = computeCropBox(vw, vh, cfg.aspectRatio);
  const rows = cfg.rows ?? Math.max(1, Math.round(cols * (crop.sh / crop.sw) * 0.45));

  const fontSize = overrides?.fontSize ?? cfg.fontSize ?? 10;
  const charW = fontSize * CHAR_W_FACTOR;
  const targetW = outputCanvas.width > 0 ? outputCanvas.width : makeEven(Math.ceil(cols * charW));
  const targetH = outputCanvas.height > 0 ? outputCanvas.height : makeEven(rows * fontSize);

  if (outputCanvas.width !== targetW || outputCanvas.height !== targetH) {
    outputCanvas.width = targetW;
    outputCanvas.height = targetH;
  }

  const renderCfg = { ...cfg, ...(overrides || {}), cols, rows, syncOnly: true };
  const res = eng.renderFrame(videoEl, outputCanvas, renderCfg);
  return { rows, cols, rendered: Boolean(res?.rendered) };
}

// ─── AsciliVideoExporter ────────────────────────────────────────────────────
// Records an ASCII-rendered video using MediaRecorder + canvas.captureStream.
//
// Plays the source sequentially and captures the rendered canvas at the target
// frame rate, avoiding expensive per-frame seeks on long videos.
//
// Usage:
//   const exp = new AsciliVideoExporter();
//   exp.start(videoEl, cfg, { onProgress, onComplete, onError });
//   exp.stop();  // cancel

export class AsciliVideoExporter {
  constructor(engine = null) {
    this._canvas = document.createElement('canvas');
    this._frameCanvas = document.createElement('canvas');
    this._engine = engine || getSharedEngine();
    this._recorder = null;
    this._chunks = [];
    this._running = false;
    this._startWall = 0;
    this._mimeType = '';
    this._aborted = false;
    this._writable = null;
    this._writeChain = Promise.resolve();
    this._pendingWriteBytes = 0;
    this._writePauseBytes = 16 * 1024 * 1024;
    this._writeResumeBytes = 2 * 1024 * 1024;
    this._bufferedBytes = 0;
    this._maxBufferedBytes = Infinity;
    this._stream = null;
    this._wakeLock = null;
    this._ticker = null;
  }

  get canvas() { return this._canvas; }

  /**
   * Begin recording by playing the source and capturing rendered frames.
   *
   * @param {HTMLVideoElement} videoEl  – source video
   * @param {object}           cfg      – ASCILI render config
   * @param {object}           opts
   *   opts.onProgress(pct, elapsed, eta)  – called each rendered frame
   *   opts.onComplete(blob, mimeType)     – called when recording finishes
   *   opts.onError(msg)                   – called on failure
   *   opts.targetFps                      – recording FPS (default 60)
   *   opts.resolution                     – 'auto', '720p', '1080p', '1440p'
   *   opts.engine                         – shared AsciliEngine instance
   */
  start(videoEl, cfg, opts = {}) {
    const {
      onProgress, onComplete, onError, targetFps = 60, resolution = '1080p',
      format = 'mp4-h264', writable = null, maxBufferedBytes = Infinity, engine = null,
    } = opts;

    if (this._running) {
      onError?.('A video export is already running. Stop it before starting another.');
      return;
    }

    if (engine) {
      this._engine = engine;
    }

    // Guard 1: Verify source video readiness
    if (!videoEl || typeof videoEl.getBoundingClientRect !== 'function') {
      onError?.('Invalid source video element.');
      return;
    }
    const vw = videoEl.videoWidth || videoEl.width || 0;
    const vh = videoEl.videoHeight || videoEl.height || 0;
    if (vw <= 0 || vh <= 0) {
      onError?.('Source video dimensions are not available (0x0). Please wait for the video to load before exporting.');
      return;
    }
    if (videoEl.readyState < 2) {
      onError?.('Source video is not ready for playback (readyState < 2). Please wait for the video to load.');
      return;
    }

    this._writable = writable;
    this._writeChain = Promise.resolve();
    this._pendingWriteBytes = 0;
    this._bufferedBytes = 0;
    this._outputError = null;
    this._maxBufferedBytes = maxBufferedBytes;

    const targetFpsVal = Math.min(120, Math.max(1, parseFloat(targetFps) || 60));

    // Pick best supported MIME type using requested format
    const candidates = getCandidateMimeTypes(format, true);
    const defaultMime = (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/mp4')) ? 'video/mp4' : 'video/webm';
    this._mimeType = candidates.find(t => {
      try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
    }) || defaultMime;

    // Compute fontSize override for target resolution
    const crop = computeCropBox(vw, vh, cfg.aspectRatio);
    const resInfo = computeFontForResolution(cfg.cols || 80, vw, vh, resolution);
    const overrides = resInfo ? { fontSize: resInfo.fontSize } : undefined;
    const fontSize = overrides?.fontSize ?? cfg.fontSize ?? 10;
    const cols = Math.min(1000, Math.max(20, Math.round(cfg.cols || 80)));
    const rows = Math.max(1, Math.round(cols * (crop.sh / crop.sw) * 0.45));
    const charW = fontSize * CHAR_W_FACTOR;
    const frameW = makeEven(Math.ceil(cols * charW));
    const frameH = makeEven(rows * fontSize);
    const canvasW = resInfo?.outputW || frameW;
    const canvasH = resInfo?.outputH || frameH;

    // Guard 2: Verify valid canvas dimensions
    if (canvasW <= 0 || canvasH <= 0 || isNaN(canvasW) || isNaN(canvasH)) {
      onError?.(`Invalid output canvas dimensions: ${canvasW}x${canvasH}.`);
      return;
    }

    if (canvasW > 16384 || canvasH > 16384 || canvasW * canvasH > 16_777_216) {
      this._writable?.abort().catch(() => {});
      this._writable = null;
      onError?.('Output dimensions exceed this browser\'s canvas limit. Reduce columns or choose a smaller resolution.');
      return;
    }

    if (this._canvas.width !== canvasW || this._canvas.height !== canvasH) {
      this._canvas.width  = canvasW;
      this._canvas.height = canvasH;
    }

    const renderCfg = { ...cfg, ...(overrides || {}), cols, rows, syncOnly: true };

    const drawFrame = () => {
      let res = null;
      try {
        res = this._engine.renderFrame(videoEl, this._canvas, renderCfg);
      } catch (err) {
        console.warn('[AsciliVideoExporter] GPU frame render warning:', err);
      }

      if (!res?.rendered) {
        renderFrameToCanvas(videoEl, this._canvas, renderCfg, overrides, this._engine);
      }

      if (this._canvas.width <= 0 || this._canvas.height <= 0) {
        throw new Error(`Export canvas has invalid dimensions: ${this._canvas.width}x${this._canvas.height}`);
      }
    };

    // Guard 3: Pre-render first frame and verify non-empty buffer
    try {
      drawFrame();
    } catch (error) {
      this._writable?.abort().catch(() => {});
      this._writable = null;
      onError?.('Initial frame render failed: ' + error.message);
      return;
    }

    try {
      const ctx = this._canvas.getContext('2d');
      if (ctx) {
        const sampleW = Math.min(32, this._canvas.width);
        const sampleH = Math.min(32, this._canvas.height);
        const sampleData = ctx.getImageData(0, 0, sampleW, sampleH).data;
        let hasPixels = false;
        for (let i = 0; i < sampleData.length; i += 4) {
          if (sampleData[i + 3] > 0 || sampleData[i] > 0 || sampleData[i + 1] > 0 || sampleData[i + 2] > 0) {
            hasPixels = true;
            break;
          }
        }
        if (!hasPixels) {
          this._writable?.abort().catch(() => {});
          this._writable = null;
          onError?.('Rendered frame canvas is empty (0 pixels). Check video source and graphics support.');
          return;
        }
      }
    } catch {}

    // Guard 4: Create stream and verify video track
    let stream;
    try {
      stream = this._canvas.captureStream(targetFpsVal);
    } catch (e) {
      try {
        stream = this._canvas.captureStream();
      } catch (e2) {
        this._writable?.abort().catch(() => {});
        this._writable = null;
        onError?.('Canvas captureStream not supported: ' + (e2?.message || e.message));
        return;
      }
    }

    const videoTrack = stream?.getVideoTracks?.()[0];
    if (!videoTrack) {
      this._writable?.abort().catch(() => {});
      this._writable = null;
      onError?.('Could not capture video track from canvas stream.');
      return;
    }
    const hasRequestFrame = typeof videoTrack.requestFrame === 'function';

    // Only attach audio if the source video has unmuted, active sound (muted tracks stall MediaRecorder)
    if (!videoEl.muted && videoEl.volume > 0) {
      try {
        const sourceStream = videoEl.captureStream ? videoEl.captureStream() : (videoEl.mozCaptureStream ? videoEl.mozCaptureStream() : null);
        const audioTracks = sourceStream?.getAudioTracks() || [];
        if (audioTracks.length > 0) stream.addTrack(audioTracks[0].clone());
      } catch {}
    }

    this._chunks  = [];
    this._running = true;
    this._aborted = false;
    this._stream = stream;
    this._startWall = performance.now();

    // Acquire wake lock to keep display and CPU active for long exports
    try {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(lock => {
          this._wakeLock = lock;
        }).catch(() => {});
      }
    } catch {}

    // Use higher bitrate for higher resolutions (1080p, 1440p, 4K)
    const maxDim = Math.max(this._canvas.width, this._canvas.height);
    const bitsPerSecond = maxDim >= 3600 ? 25_000_000
                        : maxDim >= 2400 ? 16_000_000
                        : maxDim >= 1800 ? 12_000_000
                        : maxDim >= 1200 ? 6_000_000
                        : 4_000_000;

    let recorder = null;
    const hasAudio = stream.getAudioTracks().length > 0;
    const effectiveCandidates = candidates.map(c => {
      if (!hasAudio) {
        return c.replace(/,opus|,mp4a\.[0-9a-zA-Z.]+/g, '');
      }
      return c;
    });

    const initialMime = this._mimeType ? (hasAudio ? this._mimeType : this._mimeType.replace(/,opus|,mp4a\.[0-9a-zA-Z.]+/g, '')) : null;
    const tryCandidates = [initialMime, ...effectiveCandidates].filter(Boolean);
    for (const cand of tryCandidates) {
      try {
        if (MediaRecorder.isTypeSupported(cand)) {
          recorder = new MediaRecorder(stream, {
            mimeType: cand,
            videoBitsPerSecond: bitsPerSecond,
          });
          this._mimeType = cand;
          break;
        }
      } catch {}
    }
    if (!recorder && stream.getAudioTracks().length > 0) {
      // Audio tracks may conflict with codec — remove and retry video-only
      stream.getAudioTracks().forEach(track => stream.removeTrack(track));
      const videoOnlyCandidates = candidates.map(c => c.replace(/,opus|,mp4a\.[0-9a-zA-Z.]+/g, ''));
      for (const cand of videoOnlyCandidates) {
        try {
          if (MediaRecorder.isTypeSupported(cand)) {
            recorder = new MediaRecorder(stream, {
              mimeType: cand,
              videoBitsPerSecond: bitsPerSecond,
            });
            this._mimeType = cand;
            break;
          }
        } catch {}
      }
    }
    if (!recorder) {
      try {
        recorder = new MediaRecorder(stream, { videoBitsPerSecond: bitsPerSecond });
        this._mimeType = recorder.mimeType || 'video/webm';
      } catch (e) {
        this._running = false;
        this._wakeLock?.release().catch(() => {});
        this._wakeLock = null;
        this._stream?.getTracks().forEach(track => track.stop());
        this._stream = null;
        this._writable?.abort().catch(() => {});
        this._writable = null;
        onError?.('MediaRecorder error: ' + e.message); return;
      }
    }
    this._recorder = recorder;

    this._recorder.ondataavailable = e => {
      if (!e.data || e.data.size === 0) return;
      this._bufferedBytes += e.data.size;
      this._chunks.push(e.data);
      if (this._writable) {
        const chunk = e.data;
        this._pendingWriteBytes += chunk.size;
        if (this._pendingWriteBytes > this._writePauseBytes && this._recorder.state === 'recording') {
          this._recorder.pause();
        }
        this._writeChain = this._writeChain.then(() => this._writable.write(chunk)).catch(error => {
          this._outputError = error;
          this.stop();
          onError?.('Could not write video file: ' + error.message);
        }).finally(() => {
          this._pendingWriteBytes -= chunk.size;
          if (this._pendingWriteBytes < this._writeResumeBytes && this._recorder?.state === 'paused' && this._running) {
            this._recorder.resume();
          }
        });
      }
    };

    this._recorder.onpause = () => videoEl.pause();
    this._recorder.onresume = () => {
      if (this._running) {
        lastSourceAdvanceAt = performance.now();
        videoEl.play().catch(error => {
          this._outputError = error;
          this.stop();
          onError?.('Could not resume source video: ' + error.message);
        });
      }
    };

    this._recorder.onstop = async () => {
      this._ticker?.stop();
      this._ticker = null;
      this._wakeLock?.release().catch(() => {});
      this._wakeLock = null;
      this._stream?.getTracks().forEach(track => track.stop());
      this._stream = null;
      if (this._aborted) {
        this._running = false;
        this._chunks  = [];
        await this._writeChain;
        try { await this._writable?.abort(); } catch {}
        this._writable = null;
        return;
      }
      if (this._outputError) {
        this._running = false;
        this._chunks = [];
        try { await this._writable?.abort(); } catch {}
        this._writable = null;
        return;
      }
      if (this._writable) {
        try {
          await this._writeChain;
          await this._writable.close();
          this._writable = null;
        } catch (error) {
          try { await this._writable?.abort(); } catch {}
          this._writable = null;
        }
      }
      const blob = this._chunks.length > 0 ? new Blob(this._chunks, { type: this._mimeType }) : null;
      this._running = false;
      this._chunks  = [];
      onComplete?.(blob, this._mimeType, { savedToDisk: Boolean(this._writable && !blob) });
    };

    this._recorder.onerror = e => {
      this._outputError = e.error || new Error('MediaRecorder failed');
      this.stop();
      onError?.('Recorder error: ' + e.error?.message);
    };

    try {
      this._recorder.start(500); // flush chunks every 500 ms
    } catch (e) {
      this._running = false;
      this._wakeLock?.release().catch(() => {});
      this._wakeLock = null;
      this._stream?.getTracks().forEach(track => track.stop());
      this._stream = null;
      this._writable?.abort().catch(() => {});
      this._writable = null;
      onError?.('Could not start video recorder: ' + e.message); return;
    }

    const rawDuration = videoEl.duration;
    const duration = (isFinite(rawDuration) && rawDuration > 0) ? rawDuration : 10;
    const frameIntervalMs = 1000 / targetFpsVal;
    let cancelSeek = null;
    let lastSourceTime = -1;
    let lastSourceAdvanceAt = performance.now();
    let playbackStarted = false;
    let finishing = false;

    const fail = (message, error) => {
      this._outputError = error || new Error(message);
      this._finishRecording();
      onError?.(message);
    };

    const captureFrame = () => {
      if (!this._running || !playbackStarted || finishing) return;
      if (this._recorder?.state === 'paused') {
        return;
      }

      const sourceTime = Math.min(duration, videoEl.currentTime);
      if (sourceTime > lastSourceTime + 0.0001) {
        lastSourceTime = sourceTime;
        lastSourceAdvanceAt = performance.now();
      } else {
        if (videoEl.paused && this._running && sourceTime < duration) {
          videoEl.play().catch(() => {});
        }
        if (performance.now() - lastSourceAdvanceAt > 60000 && sourceTime < duration) {
          fail('Timed out while decoding the source video. Try a browser-supported video format.');
          return;
        }
      }

      try {
        drawFrame();
      } catch (error) {
        fail('Frame render failed: ' + error.message, error);
        return;
      }
      if (hasRequestFrame) {
        try { videoTrack.requestFrame(); } catch {}
      }

      const pct = Math.min(1, sourceTime / duration);
      const elapsed = (performance.now() - this._startWall) / 1000;
      const eta = pct > 0.002 ? (elapsed / pct) * (1 - pct) : null;
      onProgress?.(pct, elapsed, eta);

      if (videoEl.ended || sourceTime >= duration - (1 / targetFpsVal) * 0.5) {
        finishing = true;
        this._ticker?.stop();
        setTimeout(() => this._finishRecording(), 250);
        return;
      }
    };

    // Dedicated non-throttled worker timer to ensure steady FPS in background tabs
    try {
      const tickerBlob = new Blob([`
        let t = null;
        self.onmessage = e => {
          if (e.data === 'start') {
            if (t) clearInterval(t);
            t = setInterval(() => self.postMessage(1), ${frameIntervalMs});
          } else if (e.data === 'stop') {
            if (t) clearInterval(t);
            t = null;
          }
        };
      `], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(tickerBlob);
      const tickerWorker = new Worker(workerUrl);
      tickerWorker.onmessage = () => {
        if (this._running && playbackStarted) captureFrame();
      };
      this._ticker = {
        start: () => {
          try { tickerWorker.postMessage('start'); } catch {}
        },
        stop: () => {
          try {
            tickerWorker.postMessage('stop');
            tickerWorker.terminate();
            URL.revokeObjectURL(workerUrl);
          } catch {}
        }
      };
    } catch {
      let id = null;
      this._ticker = {
        start: () => {
          if (id) clearInterval(id);
          id = setInterval(() => {
            if (this._running && playbackStarted) captureFrame();
          }, frameIntervalMs);
        },
        stop: () => {
          if (id) clearInterval(id);
          id = null;
        }
      };
    }

    const startPlayback = async () => {
      if (!this._running) return;
      try {
        videoEl.muted = true;
        videoEl.defaultMuted = true;
        if (videoEl.currentTime > 0 || videoEl.ended) {
          await new Promise((resolve) => {
            const finishSeek = () => {
              clearTimeout(timeout);
              videoEl.removeEventListener('seeked', onSeeked);
              cancelSeek = null;
              resolve();
            };
            const timeout = setTimeout(finishSeek, 1500);
            const onSeeked = finishSeek;
            cancelSeek = finishSeek;
            videoEl.addEventListener('seeked', onSeeked, { once: true });
            try { videoEl.currentTime = 0; } catch { resolve(); }
          });
        }
        if (!this._running) return;
        await videoEl.play();
        if (!this._running) return;
        lastSourceTime = -1;
        lastSourceAdvanceAt = performance.now();
        playbackStarted = true;
        captureFrame();
        this._ticker?.start();
      } catch (error) {
        fail('Could not start source video playback: ' + error.message, error);
      }
    };

    const onVideoEnded = () => {
      if (this._running && !finishing) {
        finishing = true;
        this._ticker?.stop();
        setTimeout(() => this._finishRecording(), 100);
      }
    };
    videoEl.addEventListener('ended', onVideoEnded, { once: true });

    this._cleanup = () => {
      this._ticker?.stop();
      this._ticker = null;
      videoEl.removeEventListener('ended', onVideoEnded);
      cancelSeek?.();
      videoEl.pause();
    };

    startPlayback();
  }

  /** Internal: finalize the recording gracefully. */
  _finishRecording() {
    if (!this._running && (!this._recorder || this._recorder.state === 'inactive')) return;
    this._running = false;
    this._ticker?.stop();
    this._ticker = null;
    this._wakeLock?.release().catch(() => {});
    this._wakeLock = null;
    if (this._cleanup) { this._cleanup(); this._cleanup = null; }
    if (this._recorder && this._recorder.state !== 'inactive') {
      try { this._recorder.requestData(); } catch {}
      try { this._recorder.stop(); } catch {}
    }
  }

  /** Stop recording (also called automatically at video end). */
  stop() {
    this._aborted = true;
    this._running = false;
    this._ticker?.stop();
    this._ticker = null;
    this._wakeLock?.release().catch(() => {});
    this._wakeLock = null;
    if (this._cleanup) { this._cleanup(); this._cleanup = null; }
    if (this._recorder && this._recorder.state !== 'inactive') {
      this._recorder.stop();
    }
  }

  get mimeType() { return this._mimeType; }
}

export class AsciliSrtExporter {
  constructor() {
    this._running = false;
    this._aborted = false;
    this._writable = null;
    this._writeChain = Promise.resolve();
    this._chunks = [];
    this._bufferedBytes = 0;
    this._maxBufferedBytes = 128 * 1024 * 1024;
    this._maxOutputBytes = 1_000_000_000;
    this._startWall = 0;
    this._cleanup = null;
    this._outputError = null;
    this._wakeLock = null;
    this._ticker = null;
    this.canvas = null;
  }

  start(videoEl, cfg, opts = {}) {
    const {
      targetFps = 15,
      writable = null,
      format = 'srt',
      speed = 2.5,
      onProgress,
      onComplete,
      onError
    } = opts;
    if (this._running) return;

    const isYtt = format === 'ytt';
    const isYoutube = format === 'youtube';
    const isAss = format === 'ass';
    const isVtt = format === 'vtt' || isYoutube;
    const isSrt = format === 'srt';
    const videoWidth = videoEl.videoWidth || 640;
    const videoHeight = videoEl.videoHeight || 480;
    // Bound pixel count: up to 100 cols for YTT, 160 cols for ASS, 32 for basic YouTube VTT, 40 for standard SRT/VTT
    const maxCols = isAss ? 160 : isYtt ? 100 : isYoutube ? 32 : 40;
    const defaultCols = isAss ? 160 : isYtt ? (cfg.cols && cfg.cols >= 80 ? Math.min(100, cfg.cols) : 80) : isYoutube ? 30 : 80;
    const cols = isYtt
      ? (cfg.cols ? Math.min(100, Math.max(20, Math.round(cfg.cols))) : defaultCols)
      : Math.min(maxCols, Math.max(10, Math.round(cfg.cols || defaultCols)));
    const crop = computeCropBox(videoWidth, videoHeight, cfg.aspectRatio);
    const calculatedRows = Math.max(1, Math.round(cols * (crop.sh / crop.sw) * 0.45));
    const rows = isYoutube ? Math.min(4, Math.max(2, calculatedRows)) : calculatedRows;
    const fontSize = isAss ? (cfg.assFontSize || (cfg.fontSize === 10 || !cfg.fontSize ? 9 : cfg.fontSize)) : (cfg.fontSize || 10);
    const duration = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;
    if (!duration || !videoEl.videoWidth) {
      onError?.('The source video is not ready for subtitle export.');
      return;
    }

    // Guard against YouTube crashes on long videos (14min = 840s) by capping total cues under ~1800 for plain VTT
    const rawFps = parseFloat(targetFps) || (isYtt ? 24 : isYoutube ? 2 : 15);
    const maxSafeFps = (!isYtt && isYoutube && duration > 240)
      ? Math.min(rawFps, Math.max(1, Math.floor(1800 / duration)))
      : rawFps;
    const targetFpsVal = Math.min(60, Math.max(1, maxSafeFps));
    const effectiveSpeed = Math.min(2.0, Math.max(1.0, parseFloat(speed) || (targetFpsVal <= 15 ? 2.0 : targetFpsVal <= 30 ? 1.5 : 1.0)));
    const sampleInterval = 1 / targetFpsVal;
    const charset = Array.from(cfg.charSet || CHAR_SETS.standard);
    const lastChar = charset.length - 1;
    const invert = Boolean(cfg.invertChars);
    const colorMode = isYoutube ? 'monochrome' : (cfg.colorMode || 'monochrome');
    const monoColor = cfg.monoColor || '#39ff52';

    let yttPalette = [];
    let yttPenLut = null;
    if (isYtt) {
      if (colorMode === 'monochrome') {
        const monoClean = monoColor.replace('#', '');
        const mr = parseInt(monoClean.slice(0, 2), 16) || 0x39;
        const mg = parseInt(monoClean.slice(2, 4), 16) || 0xff;
        const mb = parseInt(monoClean.slice(4, 6), 16) || 0x52;
        yttPalette = [[mr, mg, mb]];
      } else if (colorMode === 'ansi16') {
        yttPalette = ANSI16;
        yttPenLut = new Uint16Array(32 * 32 * 32);
        for (let r = 0; r < 32; r++) {
          const vr = (r * 255 / 31) | 0;
          for (let g = 0; g < 32; g++) {
            const vg = (g * 255 / 31) | 0;
            for (let b = 0; b < 32; b++) {
              const vb = (b * 255 / 31) | 0;
              let best = 0, bestD = 9999999;
              for (let i = 0; i < 16; i++) {
                const pal = ANSI16[i];
                const dr = vr - pal[0], dg = vg - pal[1], db = vb - pal[2];
                const d = dr * dr + dg * dg + db * db;
                if (d < bestD) { bestD = d; best = i; if (d === 0) break; }
              }
              yttPenLut[(r << 10) | (g << 5) | b] = best + 1;
            }
          }
        }
      } else if (colorMode === 'grayscale') {
        yttPalette = [];
        for (let i = 0; i < 16; i++) {
          const v = Math.round(i * 17);
          yttPalette.push([v, v, v]);
        }
        yttPenLut = new Uint16Array(32 * 32 * 32);
        for (let r = 0; r < 32; r++) {
          const vr = (r * 255 / 31) | 0;
          for (let g = 0; g < 32; g++) {
            const vg = (g * 255 / 31) | 0;
            for (let b = 0; b < 32; b++) {
              const vb = (b * 255 / 31) | 0;
              const lum = 0.299 * vr + 0.587 * vg + 0.114 * vb;
              const level = Math.max(0, Math.min(15, Math.round(lum * 15 / 255)));
              yttPenLut[(r << 10) | (g << 5) | b] = level + 1;
            }
          }
        }
      } else {
        // ansi256, truecolor: instant direct LUT calculation in ~2 ms
        yttPalette = ANSI256;
        yttPenLut = new Uint16Array(32 * 32 * 32);
        for (let r = 0; r < 32; r++) {
          const vr = (r * 255 / 31) | 0;
          for (let g = 0; g < 32; g++) {
            const vg = (g * 255 / 31) | 0;
            for (let b = 0; b < 32; b++) {
              const vb = (b * 255 / 31) | 0;
              let idx;
              if (Math.abs(vr - vg) <= 6 && Math.abs(vg - vb) <= 6) {
                if (vr < 8) idx = 16;
                else if (vr > 248) idx = 231;
                else idx = 232 + Math.round(((vr - 8) / 239) * 23);
              } else {
                const r6 = Math.min(5, Math.max(0, Math.round((vr / 255) * 5)));
                const g6 = Math.min(5, Math.max(0, Math.round((vg / 255) * 5)));
                const b6 = Math.min(5, Math.max(0, Math.round((vb / 255) * 5)));
                idx = 16 + (36 * r6) + (6 * g6) + b6;
              }
              yttPenLut[(r << 10) | (g << 5) | b] = (idx & 255) + 1;
            }
          }
        }
      }
    }
    const sample = getOffscreen(cols, rows);
    this.canvas = sample.canvas;
    const parts = [];
    const YTT_MAX_BYTES = 20 * 1024 * 1024; // Strict 20 MB ceiling for YouTube upload
    let currentYttBytes = 0;
    let bufferedBytes = 0;
    let outputBytes = 0;
    let batch = [];
    let batchBytes = 0;
    let cueNumber = 0;
    let pendingText = null;
    let pendingStart = 0;
    let lastSampleTime = -1;
    let lastSourceTime = -1;
    let lastSourceAdvanceAt = performance.now();
    let cancelSeek = null;
    let animId = null;
    let rvfcId = null;
    let finishing = false;
    let isScheduled = false;

    this._running = true;
    this._aborted = false;
    this._writable = writable;
    this._writeChain = Promise.resolve();
    this._chunks = parts;
    this._bufferedBytes = 0;
    this._outputError = null;
    this._startWall = performance.now();

    // Acquire wake lock to keep screen and browser active during long conversions
    try {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(lock => {
          this._wakeLock = lock;
        }).catch(() => {});
      }
    } catch {}

    // Dedicated non-throttled worker timer to ensure steady frame processing in background tabs
    const frameIntervalMs = Math.max(8, Math.round(1000 / (targetFpsVal * effectiveSpeed * 1.5)));
    try {
      const tickerBlob = new Blob([`
        let t = null;
        self.onmessage = e => {
          if (e.data === 'start') {
            if (t) clearInterval(t);
            t = setInterval(() => self.postMessage(1), ${frameIntervalMs});
          } else if (e.data === 'stop') {
            if (t) clearInterval(t);
            t = null;
          }
        };
      `], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(tickerBlob);
      const tickerWorker = new Worker(workerUrl);
      tickerWorker.onmessage = () => {
        if (this._running && !finishing) processTick();
      };
      this._ticker = {
        start: () => {
          try { tickerWorker.postMessage('start'); } catch {}
        },
        stop: () => {
          try {
            tickerWorker.postMessage('stop');
            tickerWorker.terminate();
            URL.revokeObjectURL(workerUrl);
          } catch {}
        }
      };
    } catch {
      let id = null;
      this._ticker = {
        start: () => {
          if (id) clearInterval(id);
          id = setInterval(() => {
            if (this._running && !finishing) processTick();
          }, frameIntervalMs);
        },
        stop: () => {
          if (id) clearInterval(id);
          id = null;
        }
      };
    }

    const onEnded = () => {
      if (this._running && !finishing) {
        processTick();
        finish();
      }
    };
    videoEl.addEventListener('ended', onEnded);

    const timestamp = (seconds, vtt = isVtt) => {
      const milliseconds = Math.max(0, Math.round(seconds * 1000));
      const hours = Math.floor(milliseconds / 3_600_000);
      const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
      const secondsPart = Math.floor((milliseconds % 60_000) / 1000);
      const millisPart = milliseconds % 1000;
      const sep = vtt ? '.' : ',';
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}${sep}${String(millisPart).padStart(3, '0')}`;
    };

    const timestampAss = (seconds) => {
      const totalCs = Math.max(0, Math.round(seconds * 100));
      const cs = totalCs % 100;
      const totalSecs = Math.floor(totalCs / 100);
      const s = totalSecs % 60;
      const totalMins = Math.floor(totalSecs / 60);
      const m = totalMins % 60;
      const h = Math.floor(totalMins / 60);
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    };

    const hexBytes = Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0'));
    const rgbHex = (red, green, blue) => `#${hexBytes[red]}${hexBytes[green]}${hexBytes[blue]}`;
    const assHex = (red, green, blue) => `&H${hexBytes[blue]}${hexBytes[green]}${hexBytes[red]}&`.toUpperCase();

    if (isYtt) {
      const monoClean = monoColor.startsWith('#') ? monoColor : `#${monoColor}`;
      const yttSz = Math.max(75, Math.min(100, Math.round((cfg.fontSize || 10) * 10)));
      const penLines = [
        '  <pen id="0" sz="100" fc="#000000" fo="0" bo="0"/>'
      ];
      if (colorMode === 'monochrome') {
        penLines.push(`  <pen id="1" fs="3" sz="${yttSz}" fc="${monoClean}" fo="254" bo="0"/>`);
      } else {
        for (let i = 0; i < yttPalette.length; i++) {
          const [r, g, b] = yttPalette[i];
          const hex = (r === 255 && g === 255 && b === 255) ? '#FEFEFE' : rgbHex(r, g, b);
          penLines.push(`  <pen id="${i + 1}" fs="3" sz="${yttSz}" fc="${hex}" fo="254" bo="0"/>`);
        }
      }
      const yttHeader = [
        '<?xml version="1.0" encoding="utf-8" ?>',
        '<timedtext format="3">',
        '<head>',
        '  <wp id="0" ap="7" ah="0" av="0"/>',
        '  <wp id="1" ap="0" ah="0" av="0"/>',
        '  <ws id="0" ju="0" pd="0" sd="0" wfo="0"/>',
        '  <ws id="1" ju="0" pd="0" sd="0" wfo="0"/>',
        penLines.join('\n'),
        '</head>',
        '<body>',
        ''
      ].join('\n');
      batch.push(yttHeader);
      batchBytes += yttHeader.length * 2;
      currentYttBytes += yttHeader.length;
    } else if (isAss) {
      const playResX = videoWidth || 1920;
      const playResY = videoHeight || 1080;
      const monoClean = monoColor.replace('#', '');
      const monoR = parseInt(monoClean.slice(0, 2), 16) || 0x39;
      const monoG = parseInt(monoClean.slice(2, 4), 16) || 0xff;
      const monoB = parseInt(monoClean.slice(4, 6), 16) || 0x52;
      const assMonoColor = `&H00${hexBytes[monoB]}${hexBytes[monoG]}${hexBytes[monoR]}`.toUpperCase();

      const assHeader = [
        '[Script Info]',
        '; Script generated by ASCILI Streamer',
        'Title: ASCILI ASCII Art Subtitles',
        'ScriptType: v4.00+',
        'WrapStyle: 2',
        'ScaledBorderAndShadow: yes',
        'YCbCr Matrix: None',
        `PlayResX: ${playResX}`,
        `PlayResY: ${playResY}`,
        '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        `Style: Default,monospace,${fontSize},${assMonoColor},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,5,5,5,1`,
        '',
        '[Events]',
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        ''
      ].join('\n');
      batch.push(assHeader);
      batchBytes += assHeader.length * 2;
    } else if (isVtt) {
      batch.push('WEBVTT\n\n');
      batchBytes += 16;
    }

    const escapeText = character => character.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapeAss = character => character === '{' ? '(' : character === '}' ? ')' : character === '\\' ? '/' : character;
    const escapeYoutube = character => character === ' ' ? '\u00A0' : (character === '&' ? '&amp;' : character === '<' ? '&lt;' : character === '>' ? '&gt;' : character);
    const escapeXmlChar = character => character === ' ' ? '&#160;' : (character === '&' ? '&amp;' : character === '<' ? '&lt;' : character === '>' ? '&gt;' : character === '"' ? '&quot;' : character === "'" ? '&apos;' : character);
    const safeChars = isAss ? charset.map(escapeAss) : isYtt ? charset.map(escapeXmlChar) : isYoutube ? charset.map(escapeYoutube) : charset.map(escapeText);

    // Precompute adjustment LUT for brightness, contrast, and gamma
    const doAdjust = Boolean(cfg.brightness || cfg.contrast || cfg.gamma || cfg.saturation);
    const brightnessOffset = (cfg.brightness || 0) * 2.55;
    const contrast = cfg.contrast || 0;
    const contrastFactor = contrast ? (259 * (contrast + 255)) / (255 * (259 - contrast)) : 1;
    const saturation = (cfg.saturation || 0) !== 0 ? ((cfg.saturation || 0) + 100) / 100 : 1;
    const gamma = cfg.gamma || 0;
    const gammaValue = gamma > 0 ? 1 / (1 + gamma / 100) : gamma < 0 ? 1 + Math.abs(gamma) / 100 : 1;
    const lut = getAnsiColorLut(colorMode);

    const adjustLut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      let val = v;
      if (cfg.brightness) val += brightnessOffset;
      if (contrast) val = contrastFactor * (val - 128) + 128;
      if (gamma) val = 255 * Math.pow(Math.max(0, Math.min(255, val)) / 255, gammaValue);
      adjustLut[v] = Math.max(0, Math.min(255, Math.round(val)));
    }

    const isMono = colorMode === 'monochrome';
    const monoLower = monoColor.toLowerCase();

    const renderText = () => {
      sample.ctx.save();
      if (cfg.mirror) {
        sample.ctx.translate(cols, 0);
        sample.ctx.scale(-1, 1);
      }
      sample.ctx.drawImage(videoEl, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cols, rows);
      sample.ctx.restore();
      const pixels = sample.ctx.getImageData(0, 0, cols, rows).data;
      const lines = new Array(rows);

      if (isYtt) {
        if (colorMode === 'monochrome') {
          for (let row = 0; row < rows; row++) {
            let lineStr = '';
            const rowOffset = row * cols * 4;
            for (let col = 0; col < cols; col++) {
              const index = rowOffset + col * 4;
              let red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
              if (doAdjust) {
                red = adjustLut[red]; green = adjustLut[green]; blue = adjustLut[blue];
                if (saturation !== 1) {
                  const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
                  red = gray + saturation * (red - gray);
                  green = gray + saturation * (green - gray);
                  blue = gray + saturation * (blue - gray);
                }
              }
              const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
              let charIndex = Math.round(luminance * lastChar);
              if (invert) charIndex = lastChar - charIndex;
              lineStr += safeChars[charIndex] || '&#160;';
            }
            lines[row] = lineStr;
          }
          return lines.join('\n');
        }

        // Color YTT: group adjacent characters with matching penId into <s p="ID"> runs
        const runs = [];
        let runPenId = -1;
        let runText = '';
        let spanR = -999, spanG = -999, spanB = -999;

        for (let row = 0; row < rows; row++) {
          if (row > 0) {
            runText += '\n';
          }
          const rowOffset = row * cols * 4;
          for (let col = 0; col < cols; col++) {
            const index = rowOffset + col * 4;
            let red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
            if (doAdjust) {
              red = adjustLut[red]; green = adjustLut[green]; blue = adjustLut[blue];
              if (saturation !== 1) {
                const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
                red = Math.max(0, Math.min(255, Math.round(gray + saturation * (red - gray))));
                green = Math.max(0, Math.min(255, Math.round(gray + saturation * (green - gray))));
                blue = Math.max(0, Math.min(255, Math.round(gray + saturation * (blue - gray))));
              }
            }
            const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
            let charIndex = Math.round(luminance * lastChar);
            if (invert) charIndex = lastChar - charIndex;

            const rawPenId = yttPenLut ? (yttPenLut[((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3)] || 1) : 1;

            if (runPenId === -1) {
              runPenId = rawPenId;
              spanR = red; spanG = green; spanB = blue;
            } else if (rawPenId !== runPenId) {
              const dr = red - spanR, dg = green - spanG, db = blue - spanB;
              // Visual micro-noise tolerance: keep span if distance from anchor is negligible (< 20 in RGB)
              if (dr * dr + dg * dg + db * db >= 400) {
                runs.push(`<s p="${runPenId}">${runText}</s>`);
                runText = '';
                runPenId = rawPenId;
                spanR = red; spanG = green; spanB = blue;
              }
            }
            runText += safeChars[charIndex] || '&#160;';
          }
        }
        if (runPenId !== -1 && runText.length > 0) {
          runs.push(`<s p="${runPenId}">${runText}</s>`);
        }
        if (runs.length === 0) return '<s p="1">&#160;</s>';
        return '\u200B' + runs.join('');
      }

      if (isYoutube) {
        // Safe YouTube WebVTT path: plain text, non-breaking spaces, zero HTML tags, fits YouTube caption box
        for (let row = 0; row < rows; row++) {
          let lineStr = '';
          const rowOffset = row * cols * 4;
          for (let col = 0; col < cols; col++) {
            const index = rowOffset + col * 4;
            let red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
            if (doAdjust) {
              red = adjustLut[red]; green = adjustLut[green]; blue = adjustLut[blue];
              if (saturation !== 1) {
                const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
                red = gray + saturation * (red - gray);
                green = gray + saturation * (green - gray);
                blue = gray + saturation * (blue - gray);
              }
            }
            const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
            let charIndex = Math.round(luminance * lastChar);
            if (invert) charIndex = lastChar - charIndex;
            lineStr += safeChars[charIndex] || '\u00A0';
          }
          lines[row] = lineStr;
        }
        return lines.join('\n');
      }

      if (isMono) {
        if (isAss) {
          // Fast monochrome ASS: lines joined with \N, style provides monospace 9px glow color
          for (let row = 0; row < rows; row++) {
            let lineStr = '';
            const rowOffset = row * cols * 4;
            for (let col = 0; col < cols; col++) {
              const index = rowOffset + col * 4;
              let red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
              if (doAdjust) {
                red = adjustLut[red]; green = adjustLut[green]; blue = adjustLut[blue];
                if (saturation !== 1) {
                  const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
                  red = gray + saturation * (red - gray);
                  green = gray + saturation * (green - gray);
                  blue = gray + saturation * (blue - gray);
                }
              }
              const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
              let charIndex = Math.round(luminance * lastChar);
              if (invert) charIndex = lastChar - charIndex;
              lineStr += safeChars[charIndex] || ' ';
            }
            lines[row] = lineStr;
          }
          return lines.join('\\N');
        }

        // Fast monochrome SRT / VTT path: 1 tag per row, avoids 100s of tag allocations
        for (let row = 0; row < rows; row++) {
          let lineStr = '';
          const rowOffset = row * cols * 4;
          for (let col = 0; col < cols; col++) {
            const index = rowOffset + col * 4;
            let red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
            if (doAdjust) {
              red = adjustLut[red]; green = adjustLut[green]; blue = adjustLut[blue];
              if (saturation !== 1) {
                const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
                red = gray + saturation * (red - gray);
                green = gray + saturation * (green - gray);
                blue = gray + saturation * (blue - gray);
              }
            }
            const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
            let charIndex = Math.round(luminance * lastChar);
            if (invert) charIndex = lastChar - charIndex;
            lineStr += safeChars[charIndex] || ' ';
          }
          lines[row] = `<font color="${monoLower}">${lineStr}</font>`;
        }
        return lines.join('\n');
      }

      // Grayscale / Truecolor / ANSI path
      for (let row = 0; row < rows; row++) {
        const runs = [];
        let runColor = null;
        let runText = '';
        const rowOffset = row * cols * 4;
        for (let col = 0; col < cols; col++) {
          const index = rowOffset + col * 4;
          let red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
          if (doAdjust) {
            red = adjustLut[red]; green = adjustLut[green]; blue = adjustLut[blue];
            if (saturation !== 1) {
              const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
              red = Math.max(0, Math.min(255, Math.round(gray + saturation * (red - gray))));
              green = Math.max(0, Math.min(255, Math.round(gray + saturation * (green - gray))));
              blue = Math.max(0, Math.min(255, Math.round(gray + saturation * (blue - gray))));
            }
          }
          const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
          let charIndex = Math.round(luminance * lastChar);
          if (invert) charIndex = lastChar - charIndex;
          let color = monoLower;
          if (colorMode === 'grayscale') {
            const gray = Math.round(luminance * 15) * 17;
            color = isAss ? assHex(gray, gray, gray) : rgbHex(gray, gray, gray);
          } else if (colorMode === 'truecolor') {
            const qr = (red >> 3) << 3;
            const qg = (green >> 3) << 3;
            const qb = (blue >> 3) << 3;
            color = isAss ? assHex(qr, qg, qb) : rgbHex(qr, qg, qb);
          } else if (lut) {
            const lutIndex = (((Math.round(red) >> 3) << 10) | ((Math.round(green) >> 3) << 5) | (Math.round(blue) >> 3)) * 3;
            color = isAss
              ? assHex(lut[lutIndex], lut[lutIndex + 1], lut[lutIndex + 2])
              : rgbHex(lut[lutIndex], lut[lutIndex + 1], lut[lutIndex + 2]);
          }

          if (runColor !== null && color !== runColor) {
            runs.push(isAss ? `{\\c${runColor}}${runText}` : `<font color="${runColor}">${runText}</font>`);
            runText = '';
          }
          runColor = color;
          runText += safeChars[charIndex] || ' ';
        }
        if (runColor !== null) runs.push(isAss ? `{\\c${runColor}}${runText}` : `<font color="${runColor}">${runText}</font>`);
        lines[row] = runs.join('');
      }
      return lines.join(isAss ? '\\N' : '\n');
    };

    const flushBatch = () => {
      if (batch.length === 0) return;
      const text = batch.join('');
      batch = [];
      batchBytes = 0;
      outputBytes += text.length;
      if (this._writable) {
        this._writeChain = this._writeChain.then(() => this._writable.write(text)).catch(err => {
          this._outputError = err;
        });
      } else {
        bufferedBytes += text.length * 2;
        parts.push(text);
        this._bufferedBytes = bufferedBytes;
      }
    };

    const queueCue = (text, start, end) => {
      const safeEnd = Math.max(end, start + 0.04);
      const safeText = text.trim().length === 0 ? '&#160;' : text;
      let cue;
      if (isYtt) {
        const startMs = Math.max(1, Math.round(start * 1000));
        const durMs = Math.max(1, Math.round((safeEnd - start) * 1000));
        const bodyContent = colorMode === 'monochrome' ? `<s p="1">${safeText}</s>` : safeText;
        cue = `  <p t="${startMs}" d="${durMs}" wp="1" ws="1">${bodyContent}</p>\n`;
        // Strictly prevent exceeding 20 MB ceiling (reserve 4096 bytes for closing tags)
        if (currentYttBytes + cue.length + 4096 >= YTT_MAX_BYTES) {
          finish();
          return;
        }
        currentYttBytes += cue.length;
      } else if (isAss) {
        cue = `Dialogue: 0,${timestampAss(start)},${timestampAss(safeEnd)},Default,,0,0,0,,${safeText}\n`;
      } else {
        cue = `${++cueNumber}\n${timestamp(start)} --> ${timestamp(safeEnd)}\n${safeText}\n\n`;
      }
      batch.push(cue);
      batchBytes += cue.length * 2;
      if (batchBytes >= 256 * 1024) flushBatch();
    };

    const finish = async () => {
      if (finishing) return;
      finishing = true;
      this._running = false;
      this._ticker?.stop();
      this._ticker = null;
      this._wakeLock?.release().catch(() => {});
      this._wakeLock = null;
      this._cleanup?.();
      try { videoEl.playbackRate = 1.0; } catch {}
      if (this._aborted) {
        try { await this._writeChain; await this._writable?.abort(); } catch {}
        this._writable = null;
        this._chunks = [];
        return;
      }
      try {
        if (pendingText !== null) {
          queueCue(pendingText, pendingStart, duration);
          pendingText = null;
        }
        if (isYtt) {
          const yttFooter = '</body>\n</timedtext>\n';
          batch.push(yttFooter);
          batchBytes += yttFooter.length * 2;
          currentYttBytes += yttFooter.length;
        }
        flushBatch();
        await this._writeChain;
        if (this._outputError) throw this._outputError;
        const resultMime = isYtt ? 'application/xml;charset=utf-8' : isAss ? 'text/x-ssa;charset=utf-8' : isVtt ? 'text/vtt;charset=utf-8' : 'application/x-subrip';
        const formatName = isYtt ? 'ytt' : isYoutube ? 'youtube' : isAss ? 'ass' : isVtt ? 'vtt' : 'srt';
        if (this._writable) {
          await this._writable.close();
          this._writable = null;
          onComplete?.(null, resultMime, { savedToDisk: true, cols, rows, format: formatName, fontSize });
        } else {
          const blob = new Blob(parts, { type: resultMime });
          this._chunks = [];
          onComplete?.(blob, resultMime, { savedToDisk: false, cols, rows, format: formatName, fontSize });
        }
      } catch (error) {
        try { await this._writable?.abort(); } catch {}
        this._writable = null;
        this._chunks = [];
        onError?.(error.message);
      }
    };

    const getDiffRatio = (a, b) => {
      if (a === b) return 0;
      if (!a || !b) return 1;
      const len = Math.min(a.length, b.length);
      if (len === 0) return 1;
      let diff = Math.abs(a.length - b.length);
      const step = len > 2000 ? 2 : 1;
      let checked = 0;
      for (let i = 0; i < len; i += step) {
        if (a.charCodeAt(i) !== b.charCodeAt(i)) diff++;
        checked++;
      }
      return diff / (checked + Math.abs(a.length - b.length));
    };

    const processTick = () => {
      if (!this._running || finishing) return;

      const sourceTime = Math.min(duration, videoEl.currentTime);
      if (sourceTime > lastSourceTime + 0.0001) {
        lastSourceTime = sourceTime;
        lastSourceAdvanceAt = performance.now();
      } else if (sourceTime < duration) {
        const stallMs = performance.now() - lastSourceAdvanceAt;
        if (stallMs > 2000 && videoEl.playbackRate > 1.0) {
          // Relieve hardware decoder backpressure
          try { videoEl.playbackRate = 1.0; } catch {}
        }
        if (stallMs > 15000) {
          if (videoEl.paused && this._running) videoEl.play().catch(() => {});
          else if (stallMs > 20000) {
            this._running = false;
            finish();
            onError?.('Timed out while decoding the source video. Try a browser-supported video format.');
            return;
          }
        }
      }

      // Sample whenever sourceTime has advanced by at least sampleInterval (or on first / last frame)
      if (lastSampleTime < 0 || sourceTime - lastSampleTime >= sampleInterval - 0.002 || sourceTime >= duration - 0.05) {
        const text = renderText();
        if (pendingText === null) {
          pendingText = text;
          pendingStart = Math.max(0, sourceTime);
        } else if (text !== pendingText) {
          let shouldMerge = false;
          if (isYtt && duration > 0) {
            // Adaptive 24 FPS budget control for 20 MB ceiling
            const projectedBudget = (sourceTime / duration) * (YTT_MAX_BYTES - 131072);
            if (currentYttBytes > projectedBudget * 0.8) {
              const diffRatio = getDiffRatio(text, pendingText);
              // Threshold scales smoothly if pacing ahead of budget
              const diffThreshold = currentYttBytes > projectedBudget * 1.15 ? 0.08 : 0.035;
              if (diffRatio < diffThreshold) {
                shouldMerge = true;
              }
            }
          }
          if (!shouldMerge) {
            queueCue(pendingText, pendingStart, sourceTime);
            pendingText = text;
            pendingStart = sourceTime;
          }
        }
        lastSampleTime = sourceTime;
      }

      const elapsed = (performance.now() - this._startWall) / 1000;
      const progress = Math.min(1, sourceTime / duration);
      const estTotalFrames = Math.max(1, Math.ceil(duration * targetFpsVal));
      const currentFrame = Math.min(estTotalFrames, Math.round(sourceTime * targetFpsVal));
      onProgress?.(progress, elapsed, progress > 0.002 ? (elapsed / progress) * (1 - progress) : null, currentFrame, estTotalFrames);

      if (videoEl.ended || sourceTime >= duration - 0.05) {
        finish();
        return;
      }

      scheduleNext();
    };

    const scheduleNext = () => {
      if (!this._running || finishing || isScheduled) return;
      isScheduled = true;
      if (typeof videoEl.requestVideoFrameCallback === 'function') {
        rvfcId = videoEl.requestVideoFrameCallback(() => {
          isScheduled = false;
          processTick();
        });
      } else {
        animId = requestAnimationFrame(() => {
          isScheduled = false;
          processTick();
        });
      }
    };

    const startPlayback = async () => {
      if (!this._running) return;
      try {
        if (videoEl.currentTime > 0.05) {
          await new Promise((resolve) => {
            const finishSeek = () => {
              clearTimeout(timeout);
              videoEl.removeEventListener('seeked', onSeeked);
              cancelSeek = null;
              resolve();
            };
            const timeout = setTimeout(finishSeek, 2000);
            const onSeeked = finishSeek;
            cancelSeek = finishSeek;
            videoEl.addEventListener('seeked', onSeeked, { once: true });
            videoEl.currentTime = 0;
          });
        }
        if (!this._running) return;
        try {
          videoEl.playbackRate = effectiveSpeed;
        } catch {}
        await videoEl.play();
        if (!this._running) return;
        lastSourceTime = -1;
        lastSampleTime = -1;
        lastSourceAdvanceAt = performance.now();
        this._ticker?.start();
        scheduleNext();
      } catch (error) {
        if (!this._running) return;
        this._running = false;
        this._aborted = true;
        await finish();
        onError?.('Subtitle source playback failed: ' + error.message);
      }
    };

    this._cleanup = () => {
      this._ticker?.stop();
      this._ticker = null;
      this._wakeLock?.release().catch(() => {});
      this._wakeLock = null;
      videoEl.removeEventListener('ended', onEnded);
      if (rvfcId !== null && typeof videoEl.cancelVideoFrameCallback === 'function') {
        videoEl.cancelVideoFrameCallback(rvfcId);
        rvfcId = null;
      }
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      isScheduled = false;
      cancelSeek?.();
      this.canvas = null;
      this._cleanup = null;
      try { videoEl.playbackRate = 1.0; } catch {}
      videoEl.pause();
    };

    videoEl.pause();
    startPlayback();
  }

  stop() {
    this._aborted = true;
    this._running = false;
    this._ticker?.stop();
    this._ticker = null;
    this._wakeLock?.release().catch(() => {});
    this._wakeLock = null;
    this._cleanup?.();
    this._writable?.abort().catch(() => {});
    this._writable = null;
    this._chunks = [];
  }
}

export { AsciliSrtExporter as AsciliVttExporter, AsciliSrtExporter as AsciliAssExporter, AsciliSrtExporter as AsciliYttExporter, AsciliSrtExporter as AsciliYoutubeExporter, AsciliSrtExporter as AsciliSubtitleExporter };

// ─── AsciliLiveRecorder ─────────────────────────────────────────────────────
// Records the live ASCII output from any source (webcam, screen, file).
// Paints each rendered frame onto a recording canvas and uses MediaRecorder.

export class AsciliLiveRecorder {
  constructor() {
    this._canvas   = document.createElement('canvas');
    this._recorder = null;
    this._chunks   = [];
    this._running  = false;
    this._startWall = 0;
    this._mimeType  = '';
    this._elapsed   = 0;
    this._writable  = null;
    this._writeChain = Promise.resolve();
    this._pendingWriteBytes = 0;
    this._writePauseBytes = 16 * 1024 * 1024;
    this._writeResumeBytes = 2 * 1024 * 1024;
    this._bufferedBytes = 0;
    this._maxBufferedBytes = Infinity;
    this._stream = null;
    this._outputError = null;
    this._wakeLock = null;
  }

  get canvas() { return this._canvas; }
  get running() { return this._running; }
  get elapsed() {
    if (!this._running) return this._elapsed;
    return (performance.now() - this._startWall) / 1000;
  }

  /**
   * Start recording the live ASCII stream.
   *
   * @param {object} cfg   – current ASCILI config (cols, fontSize, etc.)
   * @param {object} opts
   *   opts.targetFps        – recording FPS (default 60)
   *   opts.resolution       – 'auto', '720p', '1080p', '1440p'
   *   opts.videoWidth       – source video width (for aspect ratio)
   *   opts.videoHeight      – source video height (for aspect ratio)
   *   opts.onComplete(blob, mimeType)
   *   opts.onError(msg)
   */
  startRecording(cfg, opts = {}) {
    const { targetFps = 60, resolution = 'auto', format = 'mp4-h264',
            videoWidth = 640, videoHeight = 480,
            onComplete, onError, writable = null,
            maxBufferedBytes = Infinity } = opts;

    if (this._running) return;
    this._writable = writable;
    this._writeChain = Promise.resolve();
    this._pendingWriteBytes = 0;
    this._bufferedBytes = 0;
    this._maxBufferedBytes = maxBufferedBytes;
    this._outputError = null;

    const targetFpsVal = Math.min(120, Math.max(1, parseFloat(targetFps) || 60));

    // Pick MIME using requested format
    const candidates = getCandidateMimeTypes(format, true);
    const defaultMime = (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/mp4')) ? 'video/mp4' : 'video/webm';
    this._mimeType = candidates.find(t => {
      try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
    }) || defaultMime;

    const resInfo = computeFontForResolution(cfg.cols || 80, videoWidth, videoHeight, resolution);
    this._overrides = resInfo ? { fontSize: resInfo.fontSize } : undefined;

    const asciiCanvas = document.getElementById('asciiCanvas');
    let stream = null;
    this._directStream = false;

    // Direct stream capture only when resolution is 'auto' (native display canvas)
    if (resolution === 'auto' && asciiCanvas && asciiCanvas.width > 0 && asciiCanvas.height > 0) {
      try {
        stream = asciiCanvas.captureStream(targetFpsVal);
        this._directStream = true;
      } catch {
        stream = null;
      }
    }

    if (!stream) {
      this._directStream = false;
      const targetW = makeEven(resInfo?.outputW || (resolution === '4k' ? 3840 : resolution === '1440p' ? 2560 : resolution === '1080p' ? 1920 : 1280));
      const targetH = makeEven(resInfo?.outputH || (resolution === '4k' ? 2160 : resolution === '1440p' ? 1440 : resolution === '1080p' ? 1080 : 720));
      this._canvas.width  = targetW;
      this._canvas.height = targetH;

      try {
        stream = this._canvas.captureStream(targetFpsVal);
      } catch (e) {
        onError?.('captureStream not supported: ' + e.message); return;
      }
    }

    // Try to mix in the original audio track from the current source video if possible
    try {
      const sourceVideo = document.getElementById('sourceVideo');
      if (sourceVideo) {
        if (sourceVideo.srcObject) {
          const audioTracks = sourceVideo.srcObject.getAudioTracks();
          if (audioTracks.length > 0) stream.addTrack(audioTracks[0].clone());
        } else if (sourceVideo.captureStream) {
          const audioTracks = sourceVideo.captureStream().getAudioTracks();
          if (audioTracks.length > 0) stream.addTrack(audioTracks[0].clone());
        } else if (sourceVideo.mozCaptureStream) {
          const audioTracks = sourceVideo.mozCaptureStream().getAudioTracks();
          if (audioTracks.length > 0) stream.addTrack(audioTracks[0].clone());
        }
      }
    } catch {}

    const maxDim = Math.max(this._canvas.width || 0, this._canvas.height || 0, asciiCanvas?.width || 0, asciiCanvas?.height || 0, 1920);
    const bitsPerSecond = maxDim >= 3600 ? 25_000_000
                        : maxDim >= 2400 ? 16_000_000
                        : maxDim >= 1800 ? 12_000_000
                        : maxDim >= 1200 ? 6_000_000
                        : 4_000_000;

    this._chunks = [];
    this._running = true;
    this._stream = stream;
    this._startWall = performance.now();

    // Acquire wake lock to keep screen and recording active limitlessly
    try {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(lock => {
          this._wakeLock = lock;
        }).catch(() => {});
      }
    } catch {}

    let recorder = null;
    const tryCandidates = [this._mimeType, ...candidates];
    for (const cand of tryCandidates) {
      if (!cand) continue;
      try {
        if (MediaRecorder.isTypeSupported(cand)) {
          recorder = new MediaRecorder(stream, {
            mimeType: cand,
            videoBitsPerSecond: bitsPerSecond,
          });
          this._mimeType = cand;
          break;
        }
      } catch {}
    }
    if (!recorder && stream.getAudioTracks().length > 0) {
      // Audio tracks may conflict with codec — remove and retry video-only
      stream.getAudioTracks().forEach(track => stream.removeTrack(track));
      for (const cand of tryCandidates) {
        if (!cand) continue;
        try {
          if (MediaRecorder.isTypeSupported(cand)) {
            recorder = new MediaRecorder(stream, {
              mimeType: cand,
              videoBitsPerSecond: bitsPerSecond,
            });
            this._mimeType = cand;
            break;
          }
        } catch {}
      }
    }
    if (!recorder) {
      try {
        recorder = new MediaRecorder(stream, { videoBitsPerSecond: bitsPerSecond });
        this._mimeType = recorder.mimeType || 'video/webm';
      } catch (e) {
        this._running = false;
        this._wakeLock?.release().catch(() => {});
        this._wakeLock = null;
        this._stream?.getTracks().forEach(track => track.stop());
        this._stream = null;
        this._writable?.abort().catch(() => {});
        this._writable = null;
        onError?.('MediaRecorder error: ' + e.message); return;
      }
    }
    this._recorder = recorder;

    this._recorder.ondataavailable = e => {
      if (!e.data || e.data.size === 0) return;
      if (this._writable) {
        const chunk = e.data;
        this._pendingWriteBytes += chunk.size;
        if (this._pendingWriteBytes > this._writePauseBytes && this._recorder.state === 'recording') {
          this._recorder.pause();
        }
        this._writeChain = this._writeChain.then(() => this._writable.write(chunk)).catch(error => {
          this._outputError = error;
          this._running = false;
          if (this._recorder?.state !== 'inactive') this._recorder.stop();
          onError?.('Could not write video file: ' + error.message);
        }).finally(() => {
          this._pendingWriteBytes -= chunk.size;
          if (this._pendingWriteBytes < this._writeResumeBytes && this._recorder?.state === 'paused' && this._running) {
            this._recorder.resume();
          }
        });
        return;
      }
      this._bufferedBytes += e.data.size;
      this._chunks.push(e.data);
    };

    this._recorder.onstop = async () => {
      this._elapsed = (performance.now() - this._startWall) / 1000;
      this._wakeLock?.release().catch(() => {});
      this._wakeLock = null;
      this._stream?.getTracks().forEach(track => track.stop());
      this._stream = null;
      this._running = false;
      if (this._outputError) {
        this._chunks = [];
        await this._writeChain;
        try { await this._writable?.abort(); } catch {}
        this._writable = null;
        return;
      }
      if (this._writable) {
        try {
          await this._writeChain;
          await this._writable.close();
          this._writable = null;
          onComplete?.(null, this._mimeType, { savedToDisk: true });
        } catch (error) {
          try { await this._writable?.abort(); } catch {}
          this._writable = null;
          onError?.('Could not finish video file: ' + error.message);
        }
        return;
      }
      const blob = new Blob(this._chunks, { type: this._mimeType });
      this._chunks  = [];
      onComplete?.(blob, this._mimeType);
    };

    this._recorder.onerror = e => {
      this._outputError = e.error || new Error('MediaRecorder failed');
      this.stopRecording();
      onError?.('Recorder error: ' + e.error?.message);
    };

    try {
      this._recorder.start(500);
    } catch (e) {
      this._running = false;
      this._wakeLock?.release().catch(() => {});
      this._wakeLock = null;
      this._stream?.getTracks().forEach(track => track.stop());
      this._stream = null;
      this._writable?.abort().catch(() => {});
      this._writable = null;
      onError?.('Could not start live video recorder: ' + e.message); return;
    }
  }

  /**
   * Call this each frame to paint the current video frame as ASCII
   * onto the recording canvas.
   */
  captureFrame(videoEl, cfg) {
    if (!this._running) return;
    if (this._directStream) return; // GPU WebGL canvas is already captured directly
    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;
    const asciiCanvas = document.getElementById('asciiCanvas');
    if (asciiCanvas && asciiCanvas.width > 0 && asciiCanvas.height > 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
      const scale = Math.min(this._canvas.width / asciiCanvas.width, this._canvas.height / asciiCanvas.height);
      const dw = Math.round(asciiCanvas.width * scale);
      const dh = Math.round(asciiCanvas.height * scale);
      ctx.drawImage(asciiCanvas, (this._canvas.width - dw) / 2, (this._canvas.height - dh) / 2, dw, dh);
    } else {
      renderFrameToCanvas(videoEl, this._canvas, cfg, this._overrides);
    }
  }

  /** Stop recording and trigger onComplete. */
  stopRecording() {
    this._running = false;
    this._wakeLock?.release().catch(() => {});
    this._wakeLock = null;
    if (this._recorder && this._recorder.state !== 'inactive') {
      this._recorder.stop();
    }
  }
}

// ─── AsciliGifRecorder ───────────────────────────────────────────────────────
// Records 3-5 second animated looping GIFs directly from the live stream.

export class AsciliGifRecorder {
  constructor() {
    this._encoder = null;
    this._running = false;
    this._frames = 0;
    this._maxFrames = 40;
    this._lastCapture = 0;
    this._intervalMs = 100; // 10 fps
    this._onProgress = null;
  }

  get running() { return this._running; }

  startRecording(width, height, options = {}) {
    this._encoder = new AsciliGifEncoder(width, height, {
      delayMs: options.delayMs || 100,
      repeat: 0,
    });
    this._running = true;
    this._frames = 0;
    this._intervalMs = options.delayMs || 100;
    this._maxFrames = Math.max(5, options.maxFrames || 40);
    this._lastCapture = 0;
    this._onProgress = options.onProgress;
  }

  captureFrame(canvas) {
    if (!this._running || !this._encoder) return null;
    const now = performance.now();
    if (now - this._lastCapture < this._intervalMs - 15) return null;
    this._lastCapture = now;

    this._encoder.addFrame(canvas);
    this._frames++;
    this._onProgress?.(this._frames / this._maxFrames, this._frames, this._maxFrames);

    if (this._frames >= this._maxFrames) {
      return this.finish();
    }
    return null;
  }

  finish() {
    if (!this._running || !this._encoder) return null;
    this._running = false;
    const blob = this._encoder.finish();
    this._encoder = null;
    return blob;
  }

  stop() {
    return this.finish();
  }

  cancel() {
    this._running = false;
    this._encoder = null;
  }
}

// ─── AsciliGifVideoExporter ─────────────────────────────────────────────────
// Converts an uploaded video into an animated GIF (.gif) file with ASCII styling.

export class AsciliGifVideoExporter {
  constructor(engine = null) {
    this._engine = engine || getSharedEngine();
    this._running = false;
    this._encoder = null;
    this._frameCanvas = null;
    this._cleanup = null;
    this._wakeLock = null;
  }

  get running() { return this._running; }

  async start(videoEl, cfg, options = {}) {
    if (this._running) throw new Error('A GIF export is already in progress.');
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
      throw new Error('Video metadata not loaded.');
    }

    const duration = videoEl.duration && isFinite(videoEl.duration) ? videoEl.duration : 10;
    const targetFps = Math.min(20, Math.max(1, options.targetFps || 10));
    const delayMs = Math.round(1000 / targetFps);
    const maxFrames = Math.min(120, Math.max(5, options.maxFrames || Math.ceil(duration * targetFps)));
    const sampleInterval = 1 / targetFps;

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    const crop = computeCropBox(vw, vh, cfg.aspectRatio);
    const cols = Math.min(cfg.cols || 80, 100);
    const fontSize = Math.min(cfg.fontSize || 10, 12);
    const charW = fontSize * CHAR_W_FACTOR;
    const charH = fontSize;
    const canvasW = Math.ceil(cols * charW);
    const rows = Math.max(1, Math.round(cols * (crop.sh / crop.sw) * 0.45));
    const canvasH = rows * charH;

    this._frameCanvas = document.createElement('canvas');
    this._frameCanvas.width = canvasW;
    this._frameCanvas.height = canvasH;

    this._encoder = new AsciliGifEncoder(canvasW, canvasH, {
      delayMs,
      repeat: 0,
    });

    this._running = true;
    let framesCount = 0;
    let lastSampleTime = -1;
    let finishing = false;

    try {
      if ('wakeLock' in navigator) {
        this._wakeLock = await navigator.wakeLock.request('screen').catch(() => null);
      }
    } catch {}

    const finish = () => {
      if (finishing) return;
      finishing = true;
      this._running = false;
      this._wakeLock?.release().catch(() => {});
      this._wakeLock = null;
      try { videoEl.playbackRate = 1.0; } catch {}
      this._cleanup?.();
      const blob = this._encoder ? this._encoder.finish() : null;
      this._encoder = null;
      options.onComplete?.(blob, 'image/gif', { savedToDisk: false, cols, rows, frames: framesCount });
    };

    const processTick = () => {
      if (!this._running || finishing) return;
      const sourceTime = Math.min(duration, videoEl.currentTime);

      if (lastSampleTime < 0 || sourceTime - lastSampleTime >= sampleInterval - 0.002 || sourceTime >= duration - 0.05) {
        renderFrameToCanvas(videoEl, this._frameCanvas, {
          ...cfg,
          cols,
          rows,
          fontSize,
        }, { fontSize }, this._engine);

        this._encoder.addFrame(this._frameCanvas);
        framesCount++;
        lastSampleTime = sourceTime;

        const progress = Math.min(1, framesCount / maxFrames);
        options.onProgress?.(progress, framesCount, maxFrames);

        if (framesCount >= maxFrames || videoEl.ended || sourceTime >= duration - 0.05) {
          finish();
          return;
        }
      }

      if (videoEl.ended || sourceTime >= duration - 0.05) {
        finish();
        return;
      }

      scheduleNext();
    };

    let isScheduled = false;
    let rvfcId = null;
    let animId = null;

    const scheduleNext = () => {
      if (!this._running || finishing || isScheduled) return;
      isScheduled = true;
      if (typeof videoEl.requestVideoFrameCallback === 'function') {
        rvfcId = videoEl.requestVideoFrameCallback(() => {
          isScheduled = false;
          processTick();
        });
      } else {
        animId = requestAnimationFrame(() => {
          isScheduled = false;
          processTick();
        });
      }
    };

    this._cleanup = () => {
      if (rvfcId && typeof videoEl.cancelVideoFrameCallback === 'function') {
        videoEl.cancelVideoFrameCallback(rvfcId);
      }
      if (animId) cancelAnimationFrame(animId);
      videoEl.removeEventListener('ended', finish);
    };

    videoEl.addEventListener('ended', finish);
    videoEl.currentTime = 0;
    try {
      videoEl.playbackRate = 1.0;
      await videoEl.play();
    } catch {}
    scheduleNext();
  }

  stop() {
    this._running = false;
    this._cleanup?.();
    this._wakeLock?.release().catch(() => {});
    this._wakeLock = null;
    const blob = this._encoder ? this._encoder.finish() : null;
    this._encoder = null;
    return blob;
  }
}

// ─── AsciliHtmlExporter ─────────────────────────────────────────────────────
// Exports an interactive standalone HTML player file with playback controls.

export class AsciliHtmlExporter {
  constructor() {
    this._running = false;
    this._aborted = false;
    this._frames = [];
    this._cleanup = null;
    this._wakeLock = null;
  }

  start(videoEl, cfg, opts = {}) {
    const {
      targetFps = 15,
      maxFrames = 1200,
      onProgress,
      onComplete,
      onError
    } = opts;

    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
      onError?.('Source video is not ready yet. Load a valid video before exporting a Video2Chars HTML player.');
      return;
    }

    if (this._running) return;
    this._running = true;
    this._aborted = false;
    this._frames = [];

    const rawDuration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
    if (!rawDuration || rawDuration <= 0) {
      this._running = false;
      onError?.('This video does not expose a valid duration. Please use a supported MP4/WebM source.');
      return;
    }

    const duration = rawDuration;
    const fps = Math.min(30, Math.max(5, targetFps));
    const totalFrames = Math.min(Math.max(1, Number(maxFrames) || 1200), Math.max(1, Math.ceil(duration * fps)));
    const cols = Math.min(120, Math.max(20, Math.round(cfg.cols || 80)));
    const vw = videoEl.videoWidth || 640;
    const vh = videoEl.videoHeight || 480;
    const rows = Math.max(1, Math.round(cols * (vh / vw) * 0.45));

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = cols;
    sampleCanvas.height = rows;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sampleCtx) {
      onError?.('Could not create sampling canvas context');
      return;
    }

    const chars = Array.from(cfg.charSet || CHAR_SETS.standard);
    const numChars = chars.length;
    const invert = Boolean(cfg.invertChars);
    const bgColor = cfg.bgColor || '#0a0a0c';

    try {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(lock => { this._wakeLock = lock; }).catch(() => {});
      }
    } catch {}

    const frameInterval = duration / totalFrames;
    let currentFrame = 0;
    let finishing = false;

    const finish = () => {
      if (finishing) return;
      finishing = true;
      this._running = false;
      this._cleanup?.();
      this._wakeLock?.release().catch(() => {});
      this._wakeLock = null;

      if (this._aborted) {
        this._frames = [];
        return;
      }

      const framesJson = JSON.stringify(this._frames);
      const isPaper = bgColor === '#ffffff' || bgColor === 'white';
      const defaultBg = isPaper ? '#ffffff' : '#0a0a0c';
      const defaultFg = isPaper ? '#111111' : (cfg.monoColor || '#39ff52');

      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Video2Chars ASCII Player (${cols}x${rows})</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 12px;
    background: ${defaultBg};
    color: ${defaultFg};
    font-family: ui-monospace, "Courier New", Courier, monospace;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    transition: background 0.2s, color 0.2s;
  }
  #player {
    font-size: 8px;
    line-height: 1.0;
    letter-spacing: 0;
    white-space: pre;
    user-select: none;
    max-width: 98vw;
    max-height: 80vh;
    overflow: auto;
    border: 1px solid rgba(128,128,128,0.25);
    border-radius: 8px;
    padding: 8px;
    background: inherit;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  }
  .controls {
    margin-top: 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    background: rgba(128,128,128,0.12);
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
  }
  button, select {
    background: #1c2333;
    color: #fff;
    border: 1px solid #3b82f6;
    padding: 6px 12px;
    border-radius: 5px;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover { background: #2563eb; }
  input[type=range] { width: 180px; cursor: pointer; }
  .badge { opacity: 0.8; font-size: 12px; }
</style>
</head>
<body>
<div id="player"></div>
<div class="controls">
  <button id="btnPlay">Pause</button>
  <input type="range" id="seeker" min="0" max="${this._frames.length - 1}" value="0">
  <span class="badge" id="frameMeta">Frame: 1 / ${this._frames.length}</span>
  <label><input type="checkbox" id="chkLoop" checked> Loop</label>
  <select id="selSpeed">
    <option value="0.5">0.5×</option>
    <option value="1.0" selected>1.0×</option>
    <option value="1.5">1.5×</option>
    <option value="2.0">2.0×</option>
  </select>
  <button id="btnTheme" title="Toggle Light/Dark Theme">Paper / Dark</button>
</div>
<script>
  const frames = ${framesJson};
  let current = 0;
  let playing = true;
  let fps = ${fps};
  let speed = 1.0;
  let timer = null;

  const player = document.getElementById('player');
  const seeker = document.getElementById('seeker');
  const btnPlay = document.getElementById('btnPlay');
  const meta = document.getElementById('frameMeta');
  const loop = document.getElementById('chkLoop');
  const selSpeed = document.getElementById('selSpeed');
  const btnTheme = document.getElementById('btnTheme');

  function render(idx) {
    current = Math.max(0, Math.min(frames.length - 1, idx));
    player.textContent = frames[current] || '';
    seeker.value = current;
    meta.textContent = 'Frame: ' + (current + 1) + ' / ' + frames.length;
  }

  function startTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!playing) return;
      current++;
      if (current >= frames.length) {
        if (loop.checked) current = 0;
        else { playing = false; btnPlay.textContent = 'Play'; return; }
      }
      render(current);
    }, 1000 / (fps * speed));
  }

  btnPlay.addEventListener('click', () => {
    playing = !playing;
    btnPlay.textContent = playing ? 'Pause' : 'Play';
  });

  seeker.addEventListener('input', e => {
    render(parseInt(e.target.value, 10));
  });

  selSpeed.addEventListener('change', () => {
    speed = parseFloat(selSpeed.value) || 1.0;
    startTimer();
  });

  let isDark = ${isPaper ? 'false' : 'true'};
  btnTheme.addEventListener('click', () => {
    isDark = !isDark;
    document.body.style.background = isDark ? '#0a0a0c' : '#ffffff';
    document.body.style.color = isDark ? '#39ff52' : '#111111';
  });

  render(0);
  startTimer();
</script>
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      onComplete?.(blob, 'text/html;charset=utf-8', { cols, rows, frames: this._frames.length });
    };

    const processTick = () => {
      if (!this._running || finishing) return;
      if (currentFrame >= totalFrames) {
        finish();
        return;
      }

      sampleCtx.drawImage(videoEl, 0, 0, cols, rows);
      const imgData = sampleCtx.getImageData(0, 0, cols, rows);
      const data = imgData.data;

      let frameText = '';
      for (let r = 0; r < rows; r++) {
        if (r > 0) frameText += '\n';
        const offset = r * cols * 4;
        for (let c = 0; c < cols; c++) {
          const idx = offset + c * 4;
          const lum = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255;
          let chIdx = Math.round(lum * (numChars - 1));
          if (invert) chIdx = (numChars - 1) - chIdx;
          frameText += chars[chIdx] || ' ';
        }
      }

      this._frames.push(frameText);
      currentFrame++;

      const pct = currentFrame / totalFrames;
      onProgress?.(pct, currentFrame, totalFrames);

      if (currentFrame < totalFrames) {
        videoEl.currentTime = currentFrame * frameInterval;
      } else {
        finish();
      }
    };

    const onSeeked = () => {
      if (this._running && !finishing) {
        processTick();
      }
    };

    this._cleanup = () => {
      videoEl.removeEventListener('seeked', onSeeked);
    };

    videoEl.addEventListener('seeked', onSeeked);
    videoEl.currentTime = 0;
  }

  stop() {
    this._aborted = true;
    this._running = false;
    this._cleanup?.();
    this._wakeLock?.release().catch(() => {});
    this._wakeLock = null;
    this._frames = [];
  }
}


