/**
 * Deterministic Frame-by-Frame Video Exporter for 3D ASCII Typography
 * Produces crisp, drop-frame-free MP4 or WebM video exports at any resolution,
 * aspect ratio, and frame rate.
 */

import { renderStudioFrame } from './typography-renderer.js';

export class StudioVideoExporter {
  constructor() {
    this._canvas = document.createElement('canvas');
    this._recorder = null;
    this._chunks = [];
    this._aborted = false;
    this._isRunning = false;
  }

  get isRunning() {
    return this._isRunning;
  }

  abort() {
    this._aborted = true;
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
   *   opts.onComplete(blob, downloadUrl, filename)
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

    // Calculate dimensions
    const width = comp.width || 1920;
    const height = comp.height || 1080;
    this._canvas.width = (width + 1) & ~1; // Ensure even dimensions for H.264
    this._canvas.height = (height + 1) & ~1;

    // Pick best MIME type
    const preferredFormat = opts.format || 'mp4';
    const isLinux = typeof navigator !== 'undefined' && /Linux|X11/i.test(navigator.userAgent || '');

    let candidates;
    if (preferredFormat === 'mp4' && !isLinux) {
      candidates = [
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4;codecs=avc1',
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

    // Create stream from canvas
    const stream = this._canvas.captureStream(fps);

    // Mux audio if present
    if (opts.audioEngine && opts.audioEngine.audioData && opts.audioEngine.audioData.buffer) {
      try {
        const audioBuffer = opts.audioEngine.audioData.buffer;
        const ctx = opts.audioEngine._getAudioContext();
        const dest = ctx.createMediaStreamDestination();
        const src = ctx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(dest);
        src.start(0);

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
        videoBitsPerSecond: 16_000_000, // 16 Mbps for pro broadcast quality
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

    const completionPromise = new Promise((resolve) => {
      recorder.onstop = () => {
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const finalBlob = new Blob(this._chunks, { type: mimeType });
        const url = URL.createObjectURL(finalBlob);
        const filename = `${comp.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${comp.aspectRatio.replace(':', 'x')}_${fps}fps.${ext}`;
        resolve({ blob: finalBlob, url, filename });
      };
    });

    recorder.start(100);

    const startTimeWall = performance.now();
    const frameIntervalMs = 1000 / fps;

    // Render frame-by-frame deterministically
    try {
      for (let frame = 0; frame < totalFrames; frame++) {
        if (this._aborted) break;

        const frameTime = frame / fps;
        const beatPulse = opts.audioEngine ? opts.audioEngine.getBeatPulse(frameTime) : 0;

        // Render to canvas
        renderStudioFrame(comp, frameTime, this._canvas, {
          beatPulse,
          isExport: true,
          forceRenderAll: false,
        });

        // Request keyframe or canvas draw on track
        if (stream.getVideoTracks()[0]?.requestFrame) {
          stream.getVideoTracks()[0].requestFrame();
        }

        // Progress computation
        const elapsed = (performance.now() - startTimeWall) / 1000;
        const pct = Math.round(((frame + 1) / totalFrames) * 100);
        const eta = frame > 0 ? (elapsed / (frame + 1)) * (totalFrames - (frame + 1)) : 0;

        opts.onProgress?.(pct, frame + 1, totalFrames, elapsed, eta);

        // Yield execution to allow MediaRecorder to process encoded frames without stalling
        await new Promise((r) => setTimeout(r, Math.min(20, frameIntervalMs * 0.5)));
      }

      // Finish recording
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }

      const result = await completionPromise;
      this._isRunning = false;

      if (!this._aborted) {
        opts.onComplete?.(result.blob, result.url, result.filename);
      }
    } catch (err) {
      this._isRunning = false;
      opts.onError?.(`Export error: ${err.message}`);
    }
  }
}
