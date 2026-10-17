/**
 * Deterministic Frame-by-Frame Video Exporter for 3D ASCII Typography
 * Produces crisp MP4 (H.264) or WebM video exports at any selected resolution,
 * aspect ratio, and frame rate with accurate frame pacing.
 */

import { renderStudioFrame } from './typography-renderer.js';

export function computeExportDimensions(comp, resolutionKey = '1080p') {
  const resMap = {
    '480p':  480,
    '720p':  720,
    '1080p': 1080,
    '1440p': 1440,
    '4k':    2160,
  };

  // If custom resolution is selected, preserve canvas dimensions directly
  if (resolutionKey === 'custom') {
    return {
      width: (Math.round(comp.width || 1280) + 1) & ~1,
      height: (Math.round(comp.height || 720) + 1) & ~1,
    };
  }

  const baseH = resMap[resolutionKey] || 1080;
  const ratio = (comp.width && comp.height && comp.height > 0)
    ? comp.width / comp.height
    : 16 / 9;

  let targetW, targetH;
  if (ratio >= 1.0) {
    // Landscape or Square
    targetH = baseH;
    targetW = Math.round(targetH * ratio);
  } else {
    // Portrait (e.g. 9:16 vertical)
    targetW = baseH;
    targetH = Math.round(targetW / ratio);
  }

  return {
    width: (targetW + 1) & ~1,
    height: (targetH + 1) & ~1,
  };
}

export class StudioVideoExporter {
  constructor() {
    this._canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    this._recorder = null;
    this._audioSrc = null;
    this._chunks = [];
    this._aborted = false;
    this._isRunning = false;
  }

  get isRunning() {
    return this._isRunning;
  }

  abort() {
    this._aborted = true;
    if (this._audioSrc) {
      try { this._audioSrc.stop(); } catch {}
      this._audioSrc = null;
    }
    if (this._recorder && this._recorder.state !== 'inactive') {
      try { this._recorder.stop(); } catch {}
    }
    this._isRunning = false;
  }

  /**
   * Export the composition to a downloadable video file.
   *
   * @param {object} comp - Composition model
   * @param {object} opts
   *   opts.resolution - '480p'|'720p'|'1080p'|'1440p'|'4k'
   *   opts.fps - 24, 25, 30, 50, 60
   *   opts.format - 'mp4'|'webm'
   *   opts.audioEngine - StudioAudioEngine instance
   *   opts.onProgress(pct, currentFrame, totalFrames, elapsedSec, etaSec)
   *   opts.onComplete(blob, downloadUrl, filename, meta)
   *   opts.onNotice(message)
   *   opts.onError(err)
   */
  async exportVideo(comp, opts = {}) {
    if (this._isRunning) {
      opts.onError?.('An export is already in progress.');
      return;
    }

    this._isRunning = true;
    this._aborted = false;
    this._chunks = [];

    const fps = opts.fps || comp.fps || 30;
    const duration = comp.duration || 5;
    const totalFrames = Math.max(1, Math.round(duration * fps));

    // Calculate dimensions from selected resolution preset and aspect ratio
    const { width, height } = computeExportDimensions(comp, opts.resolution);
    this._canvas.width = width;
    this._canvas.height = height;

    // Pick best MIME type prioritizing requested format
    const preferredFormat = opts.format || 'mp4';
    let candidates;
    if (preferredFormat === 'mp4') {
      candidates = [
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4;codecs=avc1',
        'video/mp4;codecs=h264',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
    } else {
      candidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4;codecs=avc1',
        'video/mp4',
      ];
    }

    const mimeType = candidates.find((t) => {
      try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
    }) || 'video/webm';

    const actualIsMp4 = mimeType.includes('mp4');
    if (preferredFormat === 'mp4' && !actualIsMp4) {
      opts.onNotice?.('Note: Your browser does not support native MP4 MediaRecorder recording. Exporting as high-efficiency WebM video.');
    }

    // Create stream from canvas at target FPS
    const stream = this._canvas.captureStream(fps);

    // Setup audio source if present (synchronized with recorder)
    if (opts.audioEngine && opts.audioEngine.audioData && opts.audioEngine.audioData.buffer) {
      try {
        const audioBuffer = opts.audioEngine.audioData.buffer;
        const ctx = opts.audioEngine._getAudioContext();
        const dest = ctx.createMediaStreamDestination();
        const src = ctx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(dest);
        this._audioSrc = src;

        const audioTracks = dest.stream.getAudioTracks();
        if (audioTracks.length > 0) {
          stream.addTrack(audioTracks[0]);
        }
      } catch (err) {
        console.warn('[StudioExporter] Audio muxing fallback:', err);
      }
    }

    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: width >= 2560 ? 32_000_000 : 16_000_000,
      });
    } catch (err) {
      opts.onError?.(`MediaRecorder initialization failed: ${err.message}`);
      this._isRunning = false;
      return;
    }

    this._recorder = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this._chunks.push(e.data);
      }
    };

    const ext = actualIsMp4 ? 'mp4' : 'webm';
    const filename = `${comp.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${width}x${height}_${fps}fps.${ext}`;

    const completionPromise = new Promise((resolve) => {
      recorder.onstop = () => {
        const finalBlob = new Blob(this._chunks, { type: mimeType });
        const url = URL.createObjectURL(finalBlob);
        resolve({
          blob: finalBlob,
          url,
          filename,
          width,
          height,
          fps,
          format: ext,
        });
      };
    });

    recorder.start(100);

    // Synchronize audio playback start precisely with recording
    if (this._audioSrc) {
      try {
        this._audioSrc.start(0);
      } catch (err) {
        console.warn('[StudioExporter] Audio start warning:', err);
      }
    }

    const startTimeWall = performance.now();
    const frameIntervalMs = 1000 / fps;
    const compToRender = { ...comp, width, height };

    // Render frame-by-frame with deterministic pacing synchronized with MediaRecorder
    try {
      for (let frame = 0; frame < totalFrames; frame++) {
        if (this._aborted) break;

        const frameTime = frame / fps;
        const beatPulse = opts.audioEngine ? opts.audioEngine.getBeatPulse(frameTime) : 0;

        // Render to canvas at exact target resolution and enforce clip bounds
        renderStudioFrame(compToRender, frameTime, this._canvas, {
          beatPulse,
          isExport: true,
          forceRenderAll: false,
        });

        // Request deterministic frame capture
        if (stream.getVideoTracks()[0]?.requestFrame) {
          stream.getVideoTracks()[0].requestFrame();
        }

        // Progress computation
        const elapsed = (performance.now() - startTimeWall) / 1000;
        const pct = Math.round(((frame + 1) / totalFrames) * 100);
        const eta = frame > 0 ? (elapsed / (frame + 1)) * (totalFrames - (frame + 1)) : 0;

        opts.onProgress?.(pct, frame + 1, totalFrames, elapsed, eta);

        // Precise wall-clock frame pacing to eliminate audio/video drift
        const nextFrameTargetMs = startTimeWall + (frame + 1) * frameIntervalMs;
        const delay = Math.max(0, Math.round(nextFrameTargetMs - performance.now()));
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      // Cleanly stop audio source
      if (this._audioSrc) {
        try { this._audioSrc.stop(); } catch {}
        this._audioSrc = null;
      }

      // Finish recording
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }

      const result = await completionPromise;
      this._isRunning = false;

      if (!this._aborted) {
        opts.onComplete?.(result.blob, result.url, result.filename, {
          width: result.width,
          height: result.height,
          fps: result.fps,
          format: result.format,
        });
      }
    } catch (err) {
      this._isRunning = false;
      opts.onError?.(`Export error: ${err.message}`);
    }
  }
}
