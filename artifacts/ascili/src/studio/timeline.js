/**
 * Visual Timeline & Transport Controller
 * Interactive time ruler, draggable playhead, multi-track layer blocks,
 * clip trimming handles, keyframe diamonds, and audio track rendering.
 */

import { clamp } from './3d-math.js';

export class StudioTimeline {
  /**
   * @param {HTMLElement} containerEl - Container element in the bottom panel
   * @param {object} comp - Composition model
   * @param {object} callbacks - { onSeek(time), onPlay(), onPause(), onLayerSelect(id), onLayerChange() }
   */
  constructor(containerEl, comp, callbacks = {}) {
    this.container = containerEl;
    this.comp = comp;
    this.callbacks = callbacks;

    this.rulerCanvas = null;
    this.rulerCtx = null;
    this.tracksContainer = null;
    this.playheadEl = null;
    this.waveformCanvas = null;

    this.isDraggingPlayhead = false;
    this.dragTarget = null; // { type: 'move'|'trimStart'|'trimEnd', layerId, startX, initialStart, initialDuration }

    this._setupDOM();
    this._attachEvents();
    this.render();
  }

  _setupDOM() {
    this.container.innerHTML = `
      <div class="stl-toolbar">
        <div class="stl-transport-group">
          <button class="stl-btn" id="stlBtnToStart" title="Jump to Start (Home)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button class="stl-btn" id="stlBtnStepBack" title="Previous Frame (Left Arrow)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
          </button>
          <button class="stl-btn stl-btn-play" id="stlBtnPlay" title="Play / Pause (Space)">
            <svg id="stlPlayIcon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <button class="stl-btn" id="stlBtnStepForward" title="Next Frame (Right Arrow)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
          </button>
          <button class="stl-btn" id="stlBtnToEnd" title="Jump to End (End)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
          <button class="stl-btn" id="stlBtnLoop" title="Toggle Loop (L)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          </button>
        </div>

        <div class="stl-timecode" id="stlTimecode">
          <span class="stl-tc-current" id="stlTcCurrent">00:00.00</span>
          <span class="stl-tc-sep">/</span>
          <span class="stl-tc-total" id="stlTcTotal">00:05.00</span>
          <span class="stl-tc-fps" id="stlTcFps">30 FPS</span>
        </div>

        <div class="stl-actions-group">
          <button class="stl-btn stl-btn-sm" id="stlBtnAddLayer" title="Add Text Layer">+ Add Layer</button>
          <label class="stl-btn stl-btn-sm stl-btn-file" title="Import Audio Track">
            <span>🎵 Audio</span>
            <input type="file" id="stlAudioInput" accept="audio/*" style="display:none;" />
          </label>
        </div>
      </div>

      <div class="stl-timeline-body" id="stlTimelineBody">
        <div class="stl-header-col">
          <div class="stl-ruler-header">TRACKS</div>
          <div class="stl-audio-header" id="stlAudioHeader" style="display:none;">Audio Track</div>
          <div class="stl-track-headers" id="stlTrackHeaders"></div>
        </div>

        <div class="stl-tracks-viewport" id="stlTracksViewport">
          <!-- Time Ruler -->
          <div class="stl-ruler-track" id="stlRulerTrack">
            <canvas class="stl-ruler-canvas" id="stlRulerCanvas"></canvas>
          </div>

          <!-- Optional Waveform Track -->
          <div class="stl-waveform-track" id="stlWaveformTrack" style="display:none;">
            <canvas class="stl-waveform-canvas" id="stlWaveformCanvas"></canvas>
          </div>

          <!-- Layer Tracks Area -->
          <div class="stl-tracks-list" id="stlTracksList"></div>

          <!-- Scrubbing Playhead Line -->
          <div class="stl-playhead" id="stlPlayhead">
            <div class="stl-playhead-head"></div>
            <div class="stl-playhead-line"></div>
          </div>
        </div>
      </div>
    `;

    this.rulerCanvas = this.container.querySelector('#stlRulerCanvas');
    this.rulerCtx = this.rulerCanvas.getContext('2d');
    this.tracksViewport = this.container.querySelector('#stlTracksViewport');
    this.tracksList = this.container.querySelector('#stlTracksList');
    this.trackHeaders = this.container.querySelector('#stlTrackHeaders');
    this.playheadEl = this.container.querySelector('#stlPlayhead');
    this.waveformTrack = this.container.querySelector('#stlWaveformTrack');
    this.waveformCanvas = this.container.querySelector('#stlWaveformCanvas');
    this.audioHeader = this.container.querySelector('#stlAudioHeader');

    this.btnPlay = this.container.querySelector('#stlBtnPlay');
    this.playIcon = this.container.querySelector('#stlPlayIcon');
    this.tcCurrent = this.container.querySelector('#stlTcCurrent');
    this.tcTotal = this.container.querySelector('#stlTcTotal');
    this.tcFps = this.container.querySelector('#stlTcFps');
    this.btnLoop = this.container.querySelector('#stlBtnLoop');
  }

  _attachEvents() {
    // Transport Buttons
    this.btnPlay.addEventListener('click', () => this.togglePlay());
    this.container.querySelector('#stlBtnToStart').addEventListener('click', () => this.seek(0));
    this.container.querySelector('#stlBtnToEnd').addEventListener('click', () => this.seek(this.comp.duration));
    this.container.querySelector('#stlBtnStepBack').addEventListener('click', () => this.stepFrame(-1));
    this.container.querySelector('#stlBtnStepForward').addEventListener('click', () => this.stepFrame(1));

    this.btnLoop.addEventListener('click', () => {
      this.comp.loop = !this.comp.loop;
      this.btnLoop.classList.toggle('active', this.comp.loop);
    });

    // Add layer
    this.container.querySelector('#stlBtnAddLayer').addEventListener('click', () => {
      this.callbacks.onAddLayer?.();
    });

    // Audio file input
    const audioInput = this.container.querySelector('#stlAudioInput');
    audioInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        this.callbacks.onAudioUpload?.(file);
      }
    });

    // Scrubbing on ruler or timeline viewport
    const handleScrub = (e) => {
      const rect = this.tracksViewport.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const frac = x / rect.width;
      const targetTime = frac * this.comp.duration;
      this.seek(targetTime);
    };

    const rulerTrack = this.container.querySelector('#stlRulerTrack');
    rulerTrack.addEventListener('pointerdown', (e) => {
      this.isDraggingPlayhead = true;
      rulerTrack.setPointerCapture(e.pointerId);
      handleScrub(e);
    });

    rulerTrack.addEventListener('pointermove', (e) => {
      if (this.isDraggingPlayhead) {
        handleScrub(e);
      }
    });

    rulerTrack.addEventListener('pointerup', (e) => {
      if (this.isDraggingPlayhead) {
        this.isDraggingPlayhead = false;
        try { rulerTrack.releasePointerCapture(e.pointerId); } catch {}
      }
    });

    // Resize observer to re-render ruler & waveform smoothly
    const ro = new ResizeObserver(() => {
      this._updateCanvasSizes();
      this.render();
    });
    ro.observe(this.tracksViewport);
  }

  _updateCanvasSizes() {
    const w = this.tracksViewport.clientWidth || 800;
    if (this.rulerCanvas.width !== w) {
      this.rulerCanvas.width = w;
      this.rulerCanvas.height = 24;
    }
    if (this.waveformCanvas && this.waveformCanvas.width !== w) {
      this.waveformCanvas.width = w;
      this.waveformCanvas.height = 36;
    }
  }

  togglePlay() {
    if (this.comp.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    this.comp.isPlaying = true;
    this.playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    this.btnPlay.classList.add('playing');
    this.callbacks.onPlay?.();
  }

  pause() {
    this.comp.isPlaying = false;
    this.playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    this.btnPlay.classList.remove('playing');
    this.callbacks.onPause?.();
  }

  seek(time) {
    this.comp.currentTime = clamp(time, 0, this.comp.duration);
    this.updatePlayheadPosition();
    this.callbacks.onSeek?.(this.comp.currentTime);
  }

  stepFrame(deltaFrames) {
    const frameDuration = 1 / (this.comp.fps || 30);
    this.seek(this.comp.currentTime + deltaFrames * frameDuration);
  }

  updatePlayheadPosition() {
    const total = this.comp.duration || 5;
    const current = this.comp.currentTime || 0;
    const pct = clamp(current / total, 0, 1) * 100;
    this.playheadEl.style.left = `${pct}%`;

    // Update Timecode
    const formatTime = (sec) => {
      const m = Math.floor(sec / 60).toString().padStart(2, '0');
      const s = Math.floor(sec % 60).toString().padStart(2, '0');
      const cs = Math.floor((sec % 1) * 100).toString().padStart(2, '0');
      return `${m}:${s}.${cs}`;
    };

    this.tcCurrent.textContent = formatTime(current);
    this.tcTotal.textContent = formatTime(total);
    this.tcFps.textContent = `${this.comp.fps || 30} FPS`;
  }

  /**
   * Re-render ruler, tracks, and clips.
   */
  render() {
    this._updateCanvasSizes();
    this._drawRuler();
    this._renderTracks();
    this.updatePlayheadPosition();
  }

  _drawRuler() {
    const ctx = this.rulerCtx;
    const w = this.rulerCanvas.width;
    const h = this.rulerCanvas.height;
    const duration = this.comp.duration || 5;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#8e9aaf';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'top';

    const secPixel = w / duration;
    // Step size based on zoom / duration
    let secStep = 1;
    if (secPixel < 30) secStep = 2;
    if (secPixel < 15) secStep = 5;

    for (let sec = 0; sec <= duration; sec += secStep) {
      const x = (sec / duration) * w;
      ctx.fillStyle = '#4a5568';
      ctx.fillRect(x, h - 10, 1, 10);

      const m = Math.floor(sec / 60);
      const s = sec % 60;
      const label = `${m}:${s.toString().padStart(2, '0')}s`;
      ctx.fillStyle = '#a0aec0';
      ctx.fillText(label, x + 3, 2);

      // Sub-ticks
      if (secPixel > 40) {
        for (let sub = 1; sub < 4; sub++) {
          const subSec = sec + (sub * secStep) / 4;
          if (subSec > duration) break;
          const subX = (subSec / duration) * w;
          ctx.fillStyle = '#2d3748';
          ctx.fillRect(subX, h - 5, 1, 5);
        }
      }
    }
  }

  _renderTracks() {
    this.tracksList.innerHTML = '';
    this.trackHeaders.innerHTML = '';

    const duration = this.comp.duration || 5;

    this.comp.layers.forEach((layer) => {
      // 1. Header with safe DOM construction
      const headerItem = document.createElement('div');
      headerItem.className = `stl-track-header-item ${layer.id === this.comp.selectedLayerId ? 'active' : ''}`;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'stl-th-name';
      nameSpan.textContent = String(layer.name || 'Text Layer');
      nameSpan.setAttribute('title', String(layer.name || 'Text Layer'));

      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'stl-th-controls';

      const visBtn = document.createElement('button');
      visBtn.className = 'stl-th-btn stl-btn-vis';
      visBtn.setAttribute('title', 'Toggle Visibility');
      visBtn.textContent = layer.visible ? '👁' : '👁‍🗨';

      const delBtn = document.createElement('button');
      delBtn.className = 'stl-th-btn stl-btn-del';
      delBtn.setAttribute('title', 'Delete Layer');
      delBtn.textContent = '✕';

      controlsDiv.appendChild(visBtn);
      controlsDiv.appendChild(delBtn);
      headerItem.appendChild(nameSpan);
      headerItem.appendChild(controlsDiv);

      nameSpan.addEventListener('click', () => {
        this.comp.selectedLayerId = layer.id;
        this.render();
        this.callbacks.onLayerSelect?.(layer.id);
      });

      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        this.render();
        this.callbacks.onLayerChange?.();
      });

      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onDeleteLayer?.(layer.id);
      });

      this.trackHeaders.appendChild(headerItem);

      // 2. Track Row & Clip with safe DOM construction
      const trackRow = document.createElement('div');
      trackRow.className = 'stl-track-row';

      const clipEl = document.createElement('div');
      clipEl.className = `stl-clip ${layer.id === this.comp.selectedLayerId ? 'active' : ''}`;

      const leftPct = clamp((layer.startTime || 0) / duration, 0, 1) * 100;
      const widthPct = clamp((layer.duration || 5) / duration, 0, 1) * 100;

      clipEl.style.left = `${leftPct}%`;
      clipEl.style.width = `${widthPct}%`;

      const handleL = document.createElement('div');
      handleL.className = 'stl-clip-handle stl-handle-l';

      const contentDiv = document.createElement('div');
      contentDiv.className = 'stl-clip-content';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'stl-clip-title';
      titleSpan.textContent = String(layer.text || layer.name || 'Text');

      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'stl-clip-badge';
      badgeSpan.textContent = String(layer.preset || 'preset');

      contentDiv.appendChild(titleSpan);
      contentDiv.appendChild(badgeSpan);

      const handleR = document.createElement('div');
      handleR.className = 'stl-clip-handle stl-handle-r';

      clipEl.appendChild(handleL);
      clipEl.appendChild(contentDiv);
      clipEl.appendChild(handleR);

      // Select clip on click
      clipEl.addEventListener('click', () => {
        this.comp.selectedLayerId = layer.id;
        this.render();
        this.callbacks.onLayerSelect?.(layer.id);
      });

      // Drag to move clip or trim handles
      this._attachClipDrag(clipEl, layer);

      trackRow.appendChild(clipEl);
      this.tracksList.appendChild(trackRow);
    });
  }

  _attachClipDrag(clipEl, layer) {
    const handleL = clipEl.querySelector('.stl-handle-l');
    const handleR = clipEl.querySelector('.stl-handle-r');
    const content = clipEl.querySelector('.stl-clip-content');

    const startDrag = (e, mode) => {
      e.stopPropagation();
      const startX = e.clientX;
      const initialStart = layer.startTime || 0;
      const initialDuration = layer.duration || 5;
      const totalWidth = this.tracksViewport.clientWidth || 800;

      const onPointerMove = (moveEvt) => {
        const deltaX = moveEvt.clientX - startX;
        const deltaTime = (deltaX / totalWidth) * this.comp.duration;

        if (mode === 'move') {
          layer.startTime = clamp(initialStart + deltaTime, 0, this.comp.duration - 0.2);
        } else if (mode === 'trimStart') {
          const newStart = clamp(initialStart + deltaTime, 0, initialStart + initialDuration - 0.2);
          const newDur = (initialStart + initialDuration) - newStart;
          layer.startTime = newStart;
          layer.duration = newDur;
        } else if (mode === 'trimEnd') {
          layer.duration = clamp(initialDuration + deltaTime, 0.2, this.comp.duration - layer.startTime);
        }

        // Fast update clip styles
        const leftPct = clamp(layer.startTime / this.comp.duration, 0, 1) * 100;
        const widthPct = clamp(layer.duration / this.comp.duration, 0, 1) * 100;
        clipEl.style.left = `${leftPct}%`;
        clipEl.style.width = `${widthPct}%`;

        this.callbacks.onLayerChange?.();
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        this.render();
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    handleL.addEventListener('pointerdown', (e) => startDrag(e, 'trimStart'));
    handleR.addEventListener('pointerdown', (e) => startDrag(e, 'trimEnd'));
    content.addEventListener('pointerdown', (e) => startDrag(e, 'move'));
  }
}
