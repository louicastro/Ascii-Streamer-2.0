/**
 * Audio Synchronization & Beat Detection Engine
 * Decodes audio, extracts waveform amplitude for the timeline,
 * performs transient beat detection, and handles synchronized playback.
 */

export class StudioAudioEngine {
  constructor() {
    this._ctx = null;
    this._buffer = null;
    this._sourceNode = null;
    this._audioData = null; // { name, url, duration, peaks, beatTimes }
    this._isPlaying = false;
    this._startAudioContextTime = 0;
    this._startCompositionTime = 0;
    this._gainNode = null;
  }

  get isPlaying() {
    return this._isPlaying;
  }

  get audioData() {
    return this._audioData;
  }

  _getAudioContext() {
    if (!this._ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this._ctx = new AudioCtx();
      this._gainNode = this._ctx.createGain();
      this._gainNode.connect(this._ctx.destination);
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    return this._ctx;
  }

  /**
   * Load and decode an audio File or Blob.
   * @param {File|Blob} file
   * @returns {Promise<object>} audioData
   */
  async loadAudioFile(file) {
    const ctx = this._getAudioContext();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    this._buffer = audioBuffer;
    const duration = audioBuffer.duration;
    const peaks = this._extractPeaks(audioBuffer, 800);
    const beatTimes = this._detectBeats(audioBuffer);

    this._audioData = {
      name: file.name,
      duration,
      peaks,
      beatTimes,
      buffer: audioBuffer,
    };

    return this._audioData;
  }

  /**
   * Extract normalized RMS/peak amplitudes for waveform drawing.
   */
  _extractPeaks(buffer, numPeaks = 800) {
    const channelData = buffer.getChannelData(0);
    const step = Math.floor(channelData.length / numPeaks);
    const peaks = new Float32Array(numPeaks);

    for (let i = 0; i < numPeaks; i++) {
      const start = i * step;
      const end = Math.min(start + step, channelData.length);
      let maxVal = 0;
      for (let j = start; j < end; j++) {
        const absVal = Math.abs(channelData[j]);
        if (absVal > maxVal) maxVal = absVal;
      }
      peaks[i] = maxVal;
    }
    return peaks;
  }

  /**
   * Detect musical downbeats using local energy variance analysis.
   */
  _detectBeats(buffer) {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const windowSize = Math.floor(sampleRate * 0.04); // 40ms window
    const hopSize = Math.floor(sampleRate * 0.02);    // 20ms hop
    const numWindows = Math.floor((channelData.length - windowSize) / hopSize);

    const energies = new Float32Array(numWindows);
    for (let w = 0; w < numWindows; w++) {
      const start = w * hopSize;
      let sum = 0;
      for (let i = 0; i < windowSize; i++) {
        const s = channelData[start + i];
        sum += s * s;
      }
      energies[w] = sum / windowSize;
    }

    // Sliding threshold comparison
    const beatTimes = [];
    const localRadius = 15; // ~300ms window
    const cFactor = 1.45;   // energy peak multiplier

    for (let i = localRadius; i < numWindows - localRadius; i++) {
      let localSum = 0;
      for (let j = i - localRadius; j <= i + localRadius; j++) {
        localSum += energies[j];
      }
      const localAvg = localSum / (2 * localRadius + 1);

      if (energies[i] > localAvg * cFactor && energies[i] > 0.005) {
        // Ensure local maximum
        if (energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
          const beatTime = (i * hopSize) / sampleRate;
          // Debounce beats by at least 180ms
          const prevBeat = beatTimes[beatTimes.length - 1];
          if (prevBeat === undefined || beatTime - prevBeat > 0.18) {
            beatTimes.push(beatTime);
          }
        }
      }
    }

    return beatTimes;
  }

  /**
   * Calculate a beat pulse decay value [0, 1] for current playback time.
   */
  getBeatPulse(time) {
    if (!this._audioData || !this._audioData.beatTimes.length) return 0;
    const beats = this._audioData.beatTimes;

    // Binary search closest prior beat
    let low = 0, high = beats.length - 1;
    let closestIdx = -1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (beats[mid] <= time) {
        closestIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (closestIdx === -1) return 0;
    const elapsed = time - beats[closestIdx];
    const decayDuration = 0.18; // pulse decays in 180ms
    if (elapsed >= 0 && elapsed <= decayDuration) {
      return 1.0 - elapsed / decayDuration;
    }
    return 0;
  }

  /**
   * Start synchronized audio playback from a specified composition timestamp.
   */
  play(fromTime = 0) {
    if (!this._buffer) return;
    this.stop();

    const ctx = this._getAudioContext();
    if (fromTime >= this._buffer.duration) return;

    this._sourceNode = ctx.createBufferSource();
    this._sourceNode.buffer = this._buffer;
    this._sourceNode.connect(this._gainNode);

    this._startAudioContextTime = ctx.currentTime;
    this._startCompositionTime = fromTime;

    this._sourceNode.start(0, fromTime);
    this._isPlaying = true;

    this._sourceNode.onended = () => {
      this._isPlaying = false;
    };
  }

  /**
   * Stop audio playback.
   */
  stop() {
    if (this._sourceNode) {
      try {
        this._sourceNode.stop();
        this._sourceNode.disconnect();
      } catch {
        // Ignore already stopped nodes
      }
      this._sourceNode = null;
    }
    this._isPlaying = false;
  }

  /**
   * Render the waveform amplitude and detected beat markers onto a 2D canvas.
   */
  renderWaveform(canvas, compDuration, currentTime) {
    if (!this._audioData || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const peaks = this._audioData.peaks;
    if (!peaks || !peaks.length) return;

    const midY = h / 2;
    const numPeaks = peaks.length;

    // Draw waveform bars
    ctx.fillStyle = '#1e3a5f';
    for (let i = 0; i < numPeaks; i++) {
      const x = (i / numPeaks) * w;
      const barH = Math.max(2, peaks[i] * (h * 0.8));
      ctx.fillRect(x, midY - barH / 2, Math.max(1, w / numPeaks - 0.5), barH);
    }

    // Highlight played portion
    const playX = (currentTime / compDuration) * w;
    ctx.fillStyle = '#3a86ff';
    for (let i = 0; i < numPeaks; i++) {
      const x = (i / numPeaks) * w;
      if (x > playX) break;
      const barH = Math.max(2, peaks[i] * (h * 0.8));
      ctx.fillRect(x, midY - barH / 2, Math.max(1, w / numPeaks - 0.5), barH);
    }

    // Draw beat markers (small cyan dots/lines)
    ctx.fillStyle = '#00f0ff';
    for (const bt of this._audioData.beatTimes) {
      if (bt > compDuration) break;
      const bx = (bt / compDuration) * w;
      ctx.fillRect(bx - 1, 0, 2, 4);
      ctx.fillRect(bx - 1, h - 4, 2, 4);
    }
  }
}
