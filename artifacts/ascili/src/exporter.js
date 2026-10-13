// ─── Canvas Frame Renderer ─────────────────────────────────────────────────
// Renders one video frame as ASCII art directly onto an HTMLCanvasElement.
// Used by AsciliVideoExporter to produce the recording canvas frames.

import { AsciliEngine, CHAR_SETS, getAnsiColorLut, clamp, adjustPixel } from './engine.js';

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
};

/**
 * Compute a fontSize that makes the ASCII grid fill a target resolution.
 * Returns the text-grid dimensions and the requested encoded dimensions.
 */
export function computeFontForResolution(cols, videoW, videoH, resolution) {
  const res = RESOLUTIONS[resolution];
  if (!res) return null; // 'auto' — caller uses its own fontSize

  const rows = Math.max(1, Math.round(cols * (videoH / videoW) * 0.45));
  // Target: cols * fontSize * CHAR_W_FACTOR ≈ res.w
  const fontFromW = res.w / (cols * CHAR_W_FACTOR);
  // Target: rows * fontSize ≈ res.h
  const fontFromH = res.h / rows;
  // Use the smaller to fit both dimensions
  const fontSize = Math.min(120, Math.max(1, Math.floor(Math.min(fontFromW, fontFromH))));

  const canvasW = makeEven(Math.ceil(cols * fontSize * CHAR_W_FACTOR));
  const canvasH = makeEven(rows * fontSize);
  return { fontSize, canvasW, canvasH, outputW: res.w, outputH: res.h, rows };
}

/** Force a dimension to an even number (required by H.264 encoders). */
function makeEven(n) { return (n + 1) & ~1; }

/**
 * Render a single video frame as ASCII art onto `outputCanvas`.
 * Returns { rows, cols } (actual dimensions used).
 *
 * @param {HTMLVideoElement|HTMLCanvasElement} videoEl
 * @param {HTMLCanvasElement} outputCanvas
 * @param {object} cfg
 * @param {object} [overrides]  — optional { fontSize } to override cfg.fontSize
 */
export function renderFrameToCanvas(videoEl, outputCanvas, cfg, overrides) {
  const { colorMode='monochrome',
          charSet=CHAR_SETS.standard, invertChars=false,
          brightness=0, contrast=0, gamma=0, saturation=0 } = cfg;
  const ansiLut = getAnsiColorLut(colorMode);
  const cols = Math.min(1000, Math.max(20, Math.round(cfg.cols || 80)));

  const fontSize = overrides?.fontSize ?? cfg.fontSize ?? 10;

  const vw  = videoEl.videoWidth  || videoEl.width || 640;
  const vh  = videoEl.videoHeight || videoEl.height || 480;
  const rows = Math.max(1, Math.round(cols * (vh/vw) * 0.45));

  const charW  = fontSize * CHAR_W_FACTOR;
  const charH  = fontSize;
  // Ensure even dimensions for H.264 compatibility
  const canvasW = makeEven(Math.ceil(cols * charW));
  const canvasH = makeEven(rows * charH);

  if (outputCanvas.width !== canvasW || outputCanvas.height !== canvasH) {
    outputCanvas.width  = canvasW;
    outputCanvas.height = canvasH;
  }

  // Sample video into offscreen pixel grid
  const { canvas: off, ctx: octx } = getOffscreen(cols, rows);
  octx.drawImage(videoEl, 0, 0, cols, rows);
  let data;
  try { data = octx.getImageData(0, 0, cols, rows).data; }
  catch { return { rows, cols }; }

  const ctx    = outputCanvas.getContext('2d');
  if (!ctx) return { rows, cols };
  const chars  = charSet.split('');
  const nChars = chars.length;
  const doAdj  = brightness || contrast || gamma || saturation;
  const isMono = colorMode === 'monochrome';
  const enableEdgeDetection = cfg.enableEdgeDetection ?? true;
  const edgeThreshold = cfg.edgeThreshold ?? 0.16;
  const adaptiveContrast = cfg.adaptiveContrast ?? true;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.font         = `${fontSize}px 'Courier New',monospace`;
  ctx.textBaseline = 'top';

  // 1. Calculate luminance grid & adjust colors
  const lumGrid = new Float32Array(rows * cols);
  const rgbAdj  = new Uint8Array(rows * cols * 3);
  let minLum = 1.0, maxLum = 0.0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const p4  = idx * 4;
      let red   = data[p4];
      let green = data[p4 + 1];
      let blue  = data[p4 + 2];

      if (doAdj) [red, green, blue] = adjustPixel(red, green, blue, brightness, contrast, gamma, saturation);

      const p3 = idx * 3;
      rgbAdj[p3]     = red;
      rgbAdj[p3 + 1] = green;
      rgbAdj[p3 + 2] = blue;

      let lum = (0.299 * red + 0.587 * green + 0.114 * blue) / 255.0;
      lumGrid[idx] = lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }
  }

  // Adaptive dynamic range
  if (adaptiveContrast && maxLum - minLum > 0.08) {
    const range = maxLum - minLum;
    for (let i = 0; i < lumGrid.length; i++) {
      lumGrid[i] = Math.min(1.0, Math.max(0.0, (lumGrid[i] - minLum) / range));
    }
  }

  const edgeThresholdSq = edgeThreshold * edgeThreshold;
  const allowEdgeGlyphs = enableEdgeDetection && nChars >= 5 && rows > 2 && cols > 2;

  if (isMono) {
    // Fastest path: build line string per row
    ctx.fillStyle = cfg.monoColor || '#39ff52';
    for (let r = 0; r < rows; r++) {
      let line = '';
      const rOffset = r * cols;
      for (let c = 0; c < cols; c++) {
        const idx = rOffset + c;
        let charToUse = null;

        if (allowEdgeGlyphs && r > 0 && r < rows - 1 && c > 0 && c < cols - 1) {
          const gx = (lumGrid[rOffset + (c + 1)] - lumGrid[rOffset + (c - 1)]) * 0.5;
          const gy = (lumGrid[(r + 1) * cols + c] - lumGrid[(r - 1) * cols + c]) * 0.5;
          const magSq = gx * gx + gy * gy;

          if (magSq >= edgeThresholdSq) {
            const absGx = Math.abs(gx);
            const absGy = Math.abs(gy);
            if (absGy > 1.8 * absGx) charToUse = '-';
            else if (absGx > 1.8 * absGy) charToUse = '|';
            else charToUse = (gx * gy > 0) ? '\\' : '/';
          }
        }

        if (!charToUse) {
          const lum = lumGrid[idx];
          let ci = 0;
          if (nChars > 1) {
            ci = Math.round(lum * (nChars - 1));
            if (ci >= nChars) ci = nChars - 1;
            if (ci < 0) ci = 0;
            if (invertChars) ci = (nChars - 1) - ci;
          }
          charToUse = chars[ci] ?? ' ';
        }

        line += charToUse;
      }
      ctx.fillText(line, 0, r * charH);
    }
  } else {
    // Color path
    for (let r = 0; r < rows; r++) {
      const rOffset = r * cols;
      for (let c = 0; c < cols; c++) {
        const idx = rOffset + c;
        let charToUse = null;

        if (allowEdgeGlyphs && r > 0 && r < rows - 1 && c > 0 && c < cols - 1) {
          const gx = (lumGrid[rOffset + (c + 1)] - lumGrid[rOffset + (c - 1)]) * 0.5;
          const gy = (lumGrid[(r + 1) * cols + c] - lumGrid[(r - 1) * cols + c]) * 0.5;
          const magSq = gx * gx + gy * gy;

          if (magSq >= edgeThresholdSq) {
            const absGx = Math.abs(gx);
            const absGy = Math.abs(gy);
            if (absGy > 1.8 * absGx) charToUse = '-';
            else if (absGx > 1.8 * absGy) charToUse = '|';
            else charToUse = (gx * gy > 0) ? '\\' : '/';
          }
        }

        if (!charToUse) {
          const lum = lumGrid[idx];
          let ci = 0;
          if (nChars > 1) {
            ci = Math.round(lum * (nChars - 1));
            if (ci >= nChars) ci = nChars - 1;
            if (ci < 0) ci = 0;
            if (invertChars) ci = (nChars - 1) - ci;
          }
          charToUse = chars[ci] ?? ' ';
        }

        const p3 = idx * 3;
        const red = rgbAdj[p3], green = rgbAdj[p3 + 1], blue = rgbAdj[p3 + 2];

        if (colorMode === 'grayscale') {
          const v = Math.round(lumGrid[idx] * 255);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
        } else if (colorMode === 'truecolor') {
          ctx.fillStyle = `rgb(${red},${green},${blue})`;
        } else if (colorMode === 'ansi16') {
          const lIdx = (((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3)) * 3;
          ctx.fillStyle = `rgb(${ansiLut[lIdx]},${ansiLut[lIdx+1]},${ansiLut[lIdx+2]})`;
        } else if (colorMode === 'ansi256') {
          const lIdx = (((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3)) * 3;
          ctx.fillStyle = `rgb(${ansiLut[lIdx]},${ansiLut[lIdx+1]},${ansiLut[lIdx+2]})`;
        } else {
          ctx.fillStyle = '#39ff52';
        }
        ctx.fillText(charToUse, c * charW, r * charH);
      }
    }
  }

  return { rows, cols };
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
  constructor() {
    this._canvas   = document.createElement('canvas');
    this._frameCanvas = document.createElement('canvas');
    this._engine   = new AsciliEngine();
    this._recorder = null;
    this._chunks   = [];
    this._running  = false;
    this._startWall = 0;
    this._mimeType  = '';
    this._aborted   = false;
    this._writable  = null;
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
   */
  start(videoEl, cfg, opts = {}) {
    const {
      onProgress, onComplete, onError, targetFps = 60, resolution = 'auto',
      writable = null, maxBufferedBytes = Infinity,
    } = opts;

    if (this._running) {
      onError?.('A video export is already running. Stop it before starting another.');
      return;
    }
    this._writable = writable;
    this._writeChain = Promise.resolve();
    this._pendingWriteBytes = 0;
    this._bufferedBytes = 0;
    this._outputError = null;
    this._maxBufferedBytes = maxBufferedBytes;

    const targetFpsVal = Math.min(120, Math.max(1, parseFloat(targetFps) || 60));

    // Pick best supported MIME type
    const isLinux = typeof navigator !== 'undefined' && /Linux|X11/i.test(navigator.userAgent || '');
    const candidates = isLinux ? [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
    ] : [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    this._mimeType = candidates.find(t => {
      try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
    }) || 'video/webm';

    // Compute fontSize override for target resolution
    const vw = videoEl.videoWidth || 640;
    const vh = videoEl.videoHeight || 480;
    const resInfo = computeFontForResolution(cfg.cols || 80, vw, vh, resolution);
    const overrides = resInfo ? { fontSize: resInfo.fontSize } : undefined;
    const fontSize = overrides?.fontSize ?? cfg.fontSize ?? 10;
    const cols = Math.min(1000, Math.max(20, Math.round(cfg.cols || 80)));
    const rows = Math.max(1, Math.round(cols * (vh / vw) * 0.45));
    const charW = fontSize * CHAR_W_FACTOR;
    const frameW = makeEven(Math.ceil(cols * charW));
    const frameH = makeEven(rows * fontSize);
    const canvasW = resInfo?.outputW || frameW;
    const canvasH = resInfo?.outputH || frameH;

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
    if (this._frameCanvas.width !== frameW || this._frameCanvas.height !== frameH) {
      this._frameCanvas.width = frameW;
      this._frameCanvas.height = frameH;
    }

    const renderCfg = { ...cfg, ...(overrides || {}), cols, rows, syncOnly: true };
    let useGpuEngine = true;
    let consecutiveGpuFailures = 0;

    const drawFrame = () => {
      let frameRendered = false;
      if (useGpuEngine) {
        try {
          const res = this._engine.renderFrame(videoEl, this._frameCanvas, renderCfg);
          frameRendered = Boolean(res?.rendered);
          if (frameRendered) {
            consecutiveGpuFailures = 0;
          } else {
            consecutiveGpuFailures++;
            if (consecutiveGpuFailures > 20) useGpuEngine = false;
          }
        } catch {
          consecutiveGpuFailures++;
          if (consecutiveGpuFailures > 20) useGpuEngine = false;
        }
      }
      if (!frameRendered) {
        renderFrameToCanvas(videoEl, this._frameCanvas, renderCfg, overrides);
      }

      const outputCtx = this._canvas.getContext('2d');
      if (!outputCtx) throw new Error('Could not create the video output canvas.');
      outputCtx.fillStyle = '#000';
      outputCtx.fillRect(0, 0, canvasW, canvasH);
      const scale = Math.min(canvasW / this._frameCanvas.width, canvasH / this._frameCanvas.height);
      const drawW = Math.round(this._frameCanvas.width * scale);
      const drawH = Math.round(this._frameCanvas.height * scale);
      outputCtx.drawImage(this._frameCanvas, (canvasW - drawW) / 2, (canvasH - drawH) / 2, drawW, drawH);
    };

    // Pre-render the first frame to initialize the canvas
    try {
      drawFrame();
    } catch (error) {
      this._writable?.abort().catch(() => {});
      this._writable = null;
      onError?.(error.message);
      return;
    }

    // Detect if requestFrame is available (Chromium) — fallback for Firefox/Safari
    let stream;
    try {
      stream = this._canvas.captureStream(0);
    } catch (e) {
      this._writable?.abort().catch(() => {});
      this._writable = null;
      onError?.('captureStream not supported: ' + e.message); return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    const hasRequestFrame = typeof videoTrack?.requestFrame === 'function';

    // If requestFrame is not available, use fps-based captureStream instead
    if (!hasRequestFrame) {
      try {
        stream?.getTracks().forEach(track => track.stop());
        stream = this._canvas.captureStream(targetFpsVal);
      } catch (e) {
        this._writable?.abort().catch(() => {});
        this._writable = null;
        onError?.('captureStream not supported: ' + e.message); return;
      }
    }

    // Capture audio tracks from source video (cloned so export never terminates source playback)
    try {
      if (videoEl.captureStream) {
        const audioTracks = videoEl.captureStream().getAudioTracks();
        if (audioTracks.length > 0) stream.addTrack(audioTracks[0].clone());
      } else if (videoEl.mozCaptureStream) {
        const audioTracks = videoEl.mozCaptureStream().getAudioTracks();
        if (audioTracks.length > 0) stream.addTrack(audioTracks[0].clone());
      }
    } catch {}

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

    // Use higher bitrate for higher resolutions
    const effectiveW = this._canvas.width;
    const bitsPerSecond = effectiveW >= 2400 ? 16_000_000
                        : effectiveW >= 1500 ? 8_000_000
                        : 4_000_000;

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
          this.stop();
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
          this._running = false;
          onComplete?.(null, this._mimeType, { savedToDisk: true });
        } catch (error) {
          this._running = false;
          try { await this._writable?.abort(); } catch {}
          this._writable = null;
          onError?.('Could not finish video file: ' + error.message);
        }
        return;
      }
      const blob = new Blob(this._chunks, { type: this._mimeType });
      this._running = false;
      this._chunks  = [];
      onComplete?.(blob, this._mimeType);
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
        if (Math.abs(videoEl.currentTime) >= 0.001) {
          await new Promise((resolve, reject) => {
            const finishSeek = () => {
              clearTimeout(timeout);
              videoEl.removeEventListener('seeked', onSeeked);
              cancelSeek = null;
              resolve();
            };
            const timeout = setTimeout(() => {
              videoEl.removeEventListener('seeked', onSeeked);
              cancelSeek = null;
              reject(new Error('Timed out while returning to the start of the source video.'));
            }, 10000);
            const onSeeked = finishSeek;
            cancelSeek = finishSeek;
            videoEl.addEventListener('seeked', onSeeked, { once: true });
            videoEl.currentTime = 0;
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

    this._cleanup = () => {
      this._ticker?.stop();
      this._ticker = null;
      cancelSeek?.();
      videoEl.pause();
    };

    startPlayback();
  }

  /** Internal: finalize the recording gracefully. */
  _finishRecording() {
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

    const isVtt = format === 'vtt';
    const videoWidth = videoEl.videoWidth || 640;
    const videoHeight = videoEl.videoHeight || 480;
    // Bound pixel count for fast, readable ASCII subtitles
    const cols = Math.min(40, Math.max(20, Math.round(cfg.cols || 80)));
    const rows = Math.max(1, Math.round(cols * (videoHeight / videoWidth) * 0.45));
    const duration = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;
    if (!duration || !videoEl.videoWidth) {
      onError?.('The source video is not ready for subtitle export.');
      return;
    }

    const targetFpsVal = Math.min(60, Math.max(1, parseFloat(targetFps) || 15));
    const effectiveSpeed = Math.min(4.0, Math.max(1.0, parseFloat(speed) || (targetFpsVal <= 15 ? 3.0 : targetFpsVal <= 30 ? 2.5 : 2.0)));
    const sampleInterval = 1 / targetFpsVal;
    const charset = Array.from(cfg.charSet || CHAR_SETS.standard);
    const lastChar = charset.length - 1;
    const invert = Boolean(cfg.invertChars);
    const colorMode = cfg.colorMode || 'monochrome';
    const monoColor = cfg.monoColor || '#39ff52';
    const sample = getOffscreen(cols, rows);
    this.canvas = sample.canvas;
    const parts = [];
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

    if (isVtt) {
      batch.push('WEBVTT\n\n');
      batchBytes += 16;
    }

    const escapeText = character => character.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeChars = charset.map(escapeText);
    const hexBytes = Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0'));
    const rgbHex = (red, green, blue) => `#${hexBytes[red]}${hexBytes[green]}${hexBytes[blue]}`;

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
      sample.ctx.drawImage(videoEl, 0, 0, cols, rows);
      const pixels = sample.ctx.getImageData(0, 0, cols, rows).data;
      const lines = new Array(rows);

      if (isMono) {
        // Fast monochrome path: 1 tag per row, avoids 100s of tag allocations
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
            color = rgbHex(gray, gray, gray);
          } else if (colorMode === 'truecolor') {
            const qr = (red >> 3) << 3;
            const qg = (green >> 3) << 3;
            const qb = (blue >> 3) << 3;
            color = rgbHex(qr, qg, qb);
          } else if (lut) {
            const lutIndex = (((Math.round(red) >> 3) << 10) | ((Math.round(green) >> 3) << 5) | (Math.round(blue) >> 3)) * 3;
            color = rgbHex(lut[lutIndex], lut[lutIndex + 1], lut[lutIndex + 2]);
          }

          if (runColor !== null && color !== runColor) {
            runs.push(`<font color="${runColor}">${runText}</font>`);
            runText = '';
          }
          runColor = color;
          runText += safeChars[charIndex] || ' ';
        }
        if (runColor !== null) runs.push(`<font color="${runColor}">${runText}</font>`);
        lines[row] = runs.join('');
      }
      return lines.join('\n');
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
      const cue = `${++cueNumber}\n${timestamp(start)} --> ${timestamp(end)}\n${text}\n\n`;
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
        flushBatch();
        await this._writeChain;
        if (this._outputError) throw this._outputError;
        const resultMime = isVtt ? 'text/vtt;charset=utf-8' : 'application/x-subrip';
        if (this._writable) {
          await this._writable.close();
          this._writable = null;
          onComplete?.(null, resultMime, { savedToDisk: true, cols, rows, format: isVtt ? 'vtt' : 'srt' });
        } else {
          const blob = new Blob(parts, { type: isVtt ? 'text/vtt;charset=utf-8' : 'text/plain;charset=utf-8' });
          this._chunks = [];
          onComplete?.(blob, resultMime, { savedToDisk: false, cols, rows, format: isVtt ? 'vtt' : 'srt' });
        }
      } catch (error) {
        try { await this._writable?.abort(); } catch {}
        this._writable = null;
        this._chunks = [];
        onError?.(error.message);
      }
    };

    const processTick = () => {
      if (!this._running || finishing) return;

      const sourceTime = Math.min(duration, videoEl.currentTime);
      if (sourceTime > lastSourceTime + 0.0001) {
        lastSourceTime = sourceTime;
        lastSourceAdvanceAt = performance.now();
      } else if (performance.now() - lastSourceAdvanceAt > 15000 && sourceTime < duration) {
        if (videoEl.paused && this._running) videoEl.play().catch(() => {});
        else if (performance.now() - lastSourceAdvanceAt > 20000) {
          this._running = false;
          finish();
          onError?.('Timed out while decoding the source video. Try a browser-supported video format.');
          return;
        }
      }

      // Sample whenever sourceTime has advanced by at least sampleInterval (or on first / last frame)
      if (lastSampleTime < 0 || sourceTime - lastSampleTime >= sampleInterval - 0.002 || sourceTime >= duration - 0.05) {
        const text = renderText();
        if (pendingText === null) {
          pendingText = text;
          pendingStart = Math.max(0, sourceTime);
        } else if (text !== pendingText) {
          queueCue(pendingText, pendingStart, sourceTime);
          pendingText = text;
          pendingStart = sourceTime;
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
        if (Math.abs(videoEl.currentTime) >= 0.001) {
          await new Promise((resolve, reject) => {
            const onSeeked = () => {
              clearTimeout(timeout);
              videoEl.removeEventListener('seeked', onSeeked);
              cancelSeek = null;
              resolve();
            };
            const timeout = setTimeout(() => {
              videoEl.removeEventListener('seeked', onSeeked);
              cancelSeek = null;
              reject(new Error('Timed out while returning to the start of the source video.'));
            }, 10000);
            cancelSeek = () => {
              clearTimeout(timeout);
              videoEl.removeEventListener('seeked', onSeeked);
              cancelSeek = null;
              resolve();
            };
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

export { AsciliSrtExporter as AsciliVttExporter, AsciliSrtExporter as AsciliSubtitleExporter };

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
    const { targetFps = 60, resolution = 'auto',
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

    // Pick MIME
    const isLinux = typeof navigator !== 'undefined' && /Linux|X11/i.test(navigator.userAgent || '');
    const candidates = isLinux ? [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
    ] : [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    this._mimeType = candidates.find(t => {
      try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
    }) || 'video/webm';

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
      const targetW = resInfo?.outputW || (resolution === '1440p' ? 2560 : resolution === '1080p' ? 1920 : 1280);
      const targetH = resInfo?.outputH || (resolution === '1440p' ? 1440 : resolution === '1080p' ? 1080 : 720);
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

    const effectiveW = this._canvas.width || asciiCanvas?.width || 2560;
    const bitsPerSecond = effectiveW >= 2400 ? 16_000_000
                        : effectiveW >= 1500 ? 8_000_000
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
