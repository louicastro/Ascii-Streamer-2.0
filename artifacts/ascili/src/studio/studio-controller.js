/**
 * 3D ASCII Typography Studio — Main UI Controller & Workspace Orchestrator
 */

import {
  ASPECT_RATIOS,
  PRESET_LABELS,
  PRESET_CATEGORIES,
  EASING_OPTIONS,
  FONT_OPTIONS,
  createDefaultComposition,
  createDefaultLayer,
} from './types.js';
import { renderStudioFrame } from './typography-renderer.js';
import { StudioTimeline } from './timeline.js';
import { StudioAudioEngine } from './audio-sync.js';
import { StudioVideoExporter } from './video-exporter.js';
import { StudioProjectStore, TEMPLATES } from './project-store.js';

export class StudioController {
  constructor(rootContainer) {
    this.container = rootContainer;
    this.comp = StudioProjectStore.loadFromLocalStorage() || createDefaultComposition();

    this.audioEngine = new StudioAudioEngine();
    this.videoExporter = new StudioVideoExporter();
    this.timeline = null;

    this.mainCanvas = null;
    this.canvasFrame = null;
    this.aspectSelect = null;

    this._rafId = null;
    this._lastTime = performance.now();
    this._isMounted = false;

    this._initUI();
    this._initAnimationLoop();
  }

  get selectedLayer() {
    return this.comp.layers.find((l) => l.id === this.comp.selectedLayerId) || this.comp.layers[0];
  }

  _initUI() {
    this.container.innerHTML = `
      <div class="studio-workspace">
        <!-- LEFT PANEL: Text, Typography, Animation Presets -->
        <aside class="studio-panel studio-panel-left" id="studioPanelLeft">
          <!-- Templates Bar -->
          <div class="studio-section">
            <div class="studio-section-title">QUICK TEMPLATES</div>
            <div class="studio-template-row" id="studioTemplateRow"></div>
          </div>

          <!-- Live Text Editor -->
          <div class="studio-section">
            <div class="studio-section-title">
              <span>LIVE TEXT INPUT</span>
              <span class="studio-val-badge">LIVE 3D</span>
            </div>
            <textarea class="studio-textarea" id="studioTextInput" placeholder="Type lyrics, title, or quote..."></textarea>
          </div>

          <!-- Typography Properties -->
          <div class="studio-section">
            <div class="studio-section-title">TYPOGRAPHY</div>
            
            <label class="studio-label">Font Family</label>
            <select class="studio-select" id="studioFontFamily"></select>

            <div class="studio-slider-row">
              <span class="studio-label" style="margin:0; width:70px;">Size</span>
              <input type="range" class="studio-range" id="studioFontSize" min="16" max="180" value="58" />
              <input type="number" class="studio-num-input" id="studioFontSizeNum" value="58" />
            </div>

            <div class="studio-slider-row">
              <span class="studio-label" style="margin:0; width:70px;">Spacing</span>
              <input type="range" class="studio-range" id="studioLetterSpacing" min="-5" max="30" value="3" />
              <input type="number" class="studio-num-input" id="studioLetterSpacingNum" value="3" />
            </div>

            <div class="studio-slider-row">
              <span class="studio-label" style="margin:0; width:70px;">Leading</span>
              <input type="range" class="studio-range" id="studioLineHeight" min="0.8" max="2.5" step="0.05" value="1.25" />
              <input type="number" class="studio-num-input" id="studioLineHeightNum" step="0.05" value="1.25" />
            </div>

            <label class="studio-label">Alignment</label>
            <div class="studio-seg-group" id="studioTextAlignGroup">
              <button class="studio-seg-btn" data-align="left">Left</button>
              <button class="studio-seg-btn active" data-align="center">Center</button>
              <button class="studio-seg-btn" data-align="right">Right</button>
            </div>
          </div>

          <!-- Animation Presets -->
          <div class="studio-section">
            <div class="studio-section-title">
              <span>ANIMATION PRESETS (20)</span>
            </div>

            <div class="studio-preset-grid" id="studioPresetGrid"></div>

            <div style="margin-top:10px;">
              <label class="studio-label">Easing Curve</label>
              <select class="studio-select" id="studioPresetEasing"></select>

              <div class="studio-slider-row">
                <span class="studio-label" style="margin:0; width:70px;">Speed</span>
                <input type="range" class="studio-range" id="studioPresetSpeed" min="0.2" max="3.0" step="0.1" value="1.0" />
                <input type="number" class="studio-num-input" id="studioPresetSpeedNum" step="0.1" value="1.0" />
              </div>
            </div>
          </div>
        </aside>

        <!-- CENTER VIEWPORT: Canvas, Aspect Ratio, Safe Frames -->
        <main class="studio-viewport-area">
          <div class="studio-viewport-bar">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="color:#64748b; font-weight:700;">ASPECT RATIO:</span>
              <select class="studio-aspect-select" id="studioAspectSelect"></select>
            </div>

            <div style="display:flex; align-items:center; gap:12px;">
              <span id="studioDimBadge" class="studio-val-badge">1920 × 1080</span>
              <label class="studio-checkbox-row" style="margin:0;">
                <input type="checkbox" id="studioSyncBeatCheck" />
                <span>Sync to Beat</span>
              </label>
            </div>
          </div>

          <div class="studio-canvas-container" id="studioCanvasContainer">
            <div class="studio-canvas-frame" id="studioCanvasFrame">
              <canvas class="studio-main-canvas" id="studioMainCanvas"></canvas>
            </div>

            <div class="studio-canvas-overlay">
              <button class="studio-icon-btn" id="studioBtnResetCamera" title="Reset Camera">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              </button>
            </div>
          </div>
        </main>

        <!-- RIGHT PANEL: 3D Transform, Depth Extrusion, Lighting, FX & Export -->
        <aside class="studio-panel studio-panel-right" id="studioPanelRight">
          <!-- Export Button Card -->
          <div class="studio-section" style="background:#131922;">
            <button class="studio-btn-export" id="studioBtnExportModal">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              EXPORT VIDEO / GIF
            </button>
          </div>

          <!-- 3D Transform Controls -->
          <div class="studio-section">
            <div class="studio-section-title">3D TRANSFORM</div>

            <div class="studio-slider-row">
              <span class="studio-label" style="margin:0; width:70px;">Pitch (X)</span>
              <input type="range" class="studio-range" id="studioRotX" min="-180" max="180" value="18" />
              <input type="number" class="studio-num-input" id="studioRotXNum" value="18" />
            </div>

            <div class="studio-slider-row">
              <span class="studio-label" style="margin:0; width:70px;">Yaw (Y)</span>
              <input type="range" class="studio-range" id="studioRotY" min="-180" max="180" value="-22" />
              <input type="number" class="studio-num-input" id="studioRotYNum" value="-22" />
            </div>

            <div class="studio-slider-row">
              <span class="studio-label" style="margin:0; width:70px;">Roll (Z)</span>
              <input type="range" class="studio-range" id="studioRotZ" min="-180" max="180" value="0" />
              <input type="number" class="studio-num-input" id="studioRotZNum" value="0" />
            </div>

            <div class="studio-slider-row">
              <span class="studio-label" style="margin:0; width:70px;">Scale</span>
              <input type="range" class="studio-range" id="studioScale" min="0.1" max="3.0" step="0.05" value="1.0" />
              <input type="number" class="studio-num-input" id="studioScaleNum" step="0.05" value="1.0" />
            </div>
          </div>

          <!-- 3D Extrusion & Depth -->
          <div class="studio-section">
            <div class="studio-section-title">3D EXTRUSION & DEPTH</div>

            <div class="studio-slider-row">
              <span class="studio-label" style="margin:0; width:70px;">Depth</span>
              <input type="range" class="studio-range" id="studioDepth" min="0" max="120" value="36" />
              <input type="number" class="studio-num-input" id="studioDepthNum" value="36" />
            </div>

            <div class="studio-slider-row">
              <span class="studio-label" style="margin:0; width:70px;">Slices</span>
              <input type="range" class="studio-range" id="studioSlices" min="2" max="28" value="14" />
              <input type="number" class="studio-num-input" id="studioSlicesNum" value="14" />
            </div>

            <div class="studio-slider-row">
              <span class="studio-label" style="margin:0; width:70px;">Perspective</span>
              <input type="range" class="studio-range" id="studioPerspective" min="200" max="1600" value="750" />
              <input type="number" class="studio-num-input" id="studioPerspectiveNum" value="750" />
            </div>
          </div>

          <!-- Materials & Shading Colors -->
          <div class="studio-section">
            <div class="studio-section-title">MATERIALS & COLORS</div>

            <div class="studio-color-row">
              <span class="studio-label" style="margin:0;">Front Face Color</span>
              <input type="color" class="studio-color-picker" id="studioFrontColor" value="#ffffff" />
            </div>

            <div class="studio-color-row">
              <span class="studio-label" style="margin:0;">Extrusion Bevel Color</span>
              <input type="color" class="studio-color-picker" id="studioExtrudeColor" value="#3a7bd5" />
            </div>

            <div class="studio-color-row">
              <span class="studio-label" style="margin:0;">Highlight Glow Color</span>
              <input type="color" class="studio-color-picker" id="studioHighlightColor" value="#00ffff" />
            </div>
          </div>

          <!-- Retro CRT Scanlines & Bloom FX -->
          <div class="studio-section">
            <div class="studio-section-title">RETRO FX & SHADING</div>

            <label class="studio-checkbox-row">
              <input type="checkbox" id="studioScanlinesCheck" checked />
              <span>CRT Scanlines</span>
            </label>

            <div class="studio-slider-row">
              <span class="studio-label" style="margin:0; width:70px;">Intensity</span>
              <input type="range" class="studio-range" id="studioScanlineIntensity" min="0" max="1" step="0.05" value="0.35" />
              <input type="number" class="studio-num-input" id="studioScanlineIntensityNum" step="0.05" value="0.35" />
            </div>

            <label class="studio-checkbox-row">
              <input type="checkbox" id="studioBloomCheck" checked />
              <span>Neon Bloom / Halation</span>
            </label>

            <div class="studio-slider-row">
              <span class="studio-label" style="margin:0; width:70px;">Bloom</span>
              <input type="range" class="studio-range" id="studioBloomIntensity" min="0" max="1.5" step="0.05" value="0.5" />
              <input type="number" class="studio-num-input" id="studioBloomIntensityNum" step="0.05" value="0.5" />
            </div>

            <label class="studio-checkbox-row">
              <input type="checkbox" id="studioShadowCheck" checked />
              <span>Drop Shadow</span>
            </label>
          </div>

          <!-- Project Actions -->
          <div class="studio-section">
            <div class="studio-section-title">PROJECT</div>
            <div style="display:flex; gap:6px;">
              <button class="stl-btn stl-btn-sm" style="flex:1;" id="studioBtnSaveProj">Save Project</button>
              <label class="stl-btn stl-btn-sm" style="flex:1; text-align:center; cursor:pointer;">
                <span>Load Project</span>
                <input type="file" id="studioFileInput" accept=".json" style="display:none;" />
              </label>
            </div>
          </div>
        </aside>
      </div>

      <!-- BOTTOM PANEL: Interactive Timeline & Audio -->
      <footer class="studio-timeline-panel" id="studioTimelinePanel"></footer>

      <!-- Export Modal Container -->
      <div id="studioExportModalRoot"></div>
    `;

    this.mainCanvas = this.container.querySelector('#studioMainCanvas');
    this.canvasFrame = this.container.querySelector('#studioCanvasFrame');
    this.aspectSelect = this.container.querySelector('#studioAspectSelect');

    this._populateOptions();
    this._bindInputs();
    this._initTimeline();
    this._applyActiveLayerValues();
    this._updateAspectDimensions();
  }

  _populateOptions() {
    // Aspect Ratios
    this.aspectSelect.innerHTML = Object.entries(ASPECT_RATIOS)
      .map(([key, info]) => `<option value="${key}">${info.label}</option>`)
      .join('');
    this.aspectSelect.value = this.comp.aspectRatio || '16:9';

    // Fonts
    const fontSelect = this.container.querySelector('#studioFontFamily');
    fontSelect.innerHTML = FONT_OPTIONS.map((f) => `<option value="${f.value}">${f.label}</option>`).join('');

    // Easings
    const easingSelect = this.container.querySelector('#studioPresetEasing');
    easingSelect.innerHTML = EASING_OPTIONS.map((e) => `<option value="${e}">${e}</option>`).join('');

    // 20 Presets Grid
    const presetGrid = this.container.querySelector('#studioPresetGrid');
    presetGrid.innerHTML = Object.entries(PRESET_LABELS)
      .map(([key, label]) => `<button class="studio-preset-card" data-preset="${key}">${label}</button>`)
      .join('');

    // Templates
    const templateRow = this.container.querySelector('#studioTemplateRow');
    templateRow.innerHTML = TEMPLATES.map(
      (t) => `<button class="studio-template-pill" data-template="${t.id}">${t.name}</button>`
    ).join('');
  }

  _bindInputs() {
    const textInput = this.container.querySelector('#studioTextInput');
    textInput.value = this.selectedLayer.text;

    // Live typing updates
    textInput.addEventListener('input', (e) => {
      this.selectedLayer.text = e.target.value;
      this.selectedLayer.name = e.target.value.slice(0, 18) || 'Text Layer';
      this.timeline?.render();
      this._saveAutosave();
    });

    // Typography
    const bindPair = (rangeId, numId, prop, scale = 1) => {
      const range = this.container.querySelector(`#${rangeId}`);
      const num = this.container.querySelector(`#${numId}`);
      const update = (val) => {
        const parsed = parseFloat(val);
        this.selectedLayer[prop] = parsed;
        range.value = parsed;
        num.value = parsed;
        this._saveAutosave();
      };
      range.addEventListener('input', (e) => update(e.target.value));
      num.addEventListener('input', (e) => update(e.target.value));
    };

    bindPair('studioFontSize', 'studioFontSizeNum', 'fontSize');
    bindPair('studioLetterSpacing', 'studioLetterSpacingNum', 'letterSpacing');
    bindPair('studioLineHeight', 'studioLineHeightNum', 'lineHeight');
    bindPair('studioRotX', 'studioRotXNum', 'rotX');
    bindPair('studioRotY', 'studioRotYNum', 'rotY');
    bindPair('studioRotZ', 'studioRotZNum', 'rotZ');
    bindPair('studioScale', 'studioScaleNum', 'scale');
    bindPair('studioDepth', 'studioDepthNum', 'depth');
    bindPair('studioSlices', 'studioSlicesNum', 'slices');
    bindPair('studioPerspective', 'studioPerspectiveNum', 'perspective');
    bindPair('studioScanlineIntensity', 'studioScanlineIntensityNum', 'scanlineIntensity');
    bindPair('studioBloomIntensity', 'studioBloomIntensityNum', 'bloomIntensity');
    bindPair('studioPresetSpeed', 'studioPresetSpeedNum', 'presetSpeed');

    // Font family & Easing
    this.container.querySelector('#studioFontFamily').addEventListener('change', (e) => {
      this.selectedLayer.fontFamily = e.target.value;
      this._saveAutosave();
    });

    this.container.querySelector('#studioPresetEasing').addEventListener('change', (e) => {
      this.selectedLayer.presetEasing = e.target.value;
      this._saveAutosave();
    });

    // Alignment buttons
    const alignBtns = this.container.querySelectorAll('#studioTextAlignGroup .studio-seg-btn');
    alignBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        alignBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedLayer.textAlign = btn.dataset.align;
        this._saveAutosave();
      });
    });

    // Colors
    const bindColor = (id, prop) => {
      const picker = this.container.querySelector(`#${id}`);
      picker.addEventListener('input', (e) => {
        this.selectedLayer[prop] = e.target.value;
        this._saveAutosave();
      });
    };
    bindColor('studioFrontColor', 'frontColor');
    bindColor('studioExtrudeColor', 'extrudeColor');
    bindColor('studioHighlightColor', 'highlightColor');

    // Checkboxes
    const bindCheck = (id, prop) => {
      const chk = this.container.querySelector(`#${id}`);
      chk.addEventListener('change', (e) => {
        this.selectedLayer[prop] = e.target.checked;
        this._saveAutosave();
      });
    };
    bindCheck('studioScanlinesCheck', 'scanlines');
    bindCheck('studioBloomCheck', 'bloom');
    bindCheck('studioShadowCheck', 'shadow');

    // Presets
    const presetGrid = this.container.querySelector('#studioPresetGrid');
    presetGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.studio-preset-card');
      if (!btn) return;
      this.selectedLayer.preset = btn.dataset.preset;
      presetGrid.querySelectorAll('.studio-preset-card').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      this.timeline?.render();
      this._saveAutosave();
    });

    // Templates
    const templateRow = this.container.querySelector('#studioTemplateRow');
    templateRow.addEventListener('click', (e) => {
      const pill = e.target.closest('.studio-template-pill');
      if (!pill) return;
      const t = TEMPLATES.find((tpl) => tpl.id === pill.dataset.template);
      if (t) {
        this.comp = t.create();
        this._applyActiveLayerValues();
        this._updateAspectDimensions();
        this.timeline.comp = this.comp;
        this.timeline.render();
        this._saveAutosave();
      }
    });

    // Aspect Ratio
    this.aspectSelect.addEventListener('change', (e) => {
      this.comp.aspectRatio = e.target.value;
      this._updateAspectDimensions();
      this._saveAutosave();
    });

    // Sync to beat checkbox
    const syncCheck = this.container.querySelector('#studioSyncBeatCheck');
    syncCheck.checked = !!this.comp.syncToBeat;
    syncCheck.addEventListener('change', (e) => {
      this.comp.syncToBeat = e.target.checked;
      this._saveAutosave();
    });

    // Reset Camera
    this.container.querySelector('#studioBtnResetCamera').addEventListener('click', () => {
      this.selectedLayer.rotX = 18;
      this.selectedLayer.rotY = -22;
      this.selectedLayer.rotZ = 0;
      this.selectedLayer.posX = 0;
      this.selectedLayer.posY = 0;
      this.selectedLayer.posZ = 0;
      this.selectedLayer.scale = 1.0;
      this._applyActiveLayerValues();
    });

    // Save & Load Project
    this.container.querySelector('#studioBtnSaveProj').addEventListener('click', () => {
      StudioProjectStore.exportToJson(this.comp);
    });

    const fileInput = this.container.querySelector('#studioFileInput');
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          this.comp = await StudioProjectStore.importFromJson(file);
          this._applyActiveLayerValues();
          this._updateAspectDimensions();
          this.timeline.comp = this.comp;
          this.timeline.render();
          this._saveAutosave();
        } catch (err) {
          alert('Failed to load project: ' + err.message);
        }
      }
    });

    // Export Modal button
    this.container.querySelector('#studioBtnExportModal').addEventListener('click', () => {
      this._openExportModal();
    });
  }

  _initTimeline() {
    const timelineContainer = this.container.querySelector('#studioTimelinePanel');
    this.timeline = new StudioTimeline(timelineContainer, this.comp, {
      onSeek: (time) => {
        if (this.audioEngine.isPlaying) {
          this.audioEngine.play(time);
        }
      },
      onPlay: () => {
        this.audioEngine.play(this.comp.currentTime);
      },
      onPause: () => {
        this.audioEngine.stop();
      },
      onLayerSelect: (id) => {
        this._applyActiveLayerValues();
      },
      onLayerChange: () => {
        this._saveAutosave();
      },
      onAddLayer: () => {
        const newLayer = createDefaultLayer(`layer-${Date.now()}`, 'NEW 3D TEXT', 0, this.comp.duration);
        this.comp.layers.push(newLayer);
        this.comp.selectedLayerId = newLayer.id;
        this.timeline.render();
        this._applyActiveLayerValues();
        this._saveAutosave();
      },
      onDeleteLayer: (id) => {
        if (this.comp.layers.length <= 1) {
          alert('Cannot delete the last layer.');
          return;
        }
        this.comp.layers = this.comp.layers.filter((l) => l.id !== id);
        this.comp.selectedLayerId = this.comp.layers[0].id;
        this.timeline.render();
        this._applyActiveLayerValues();
        this._saveAutosave();
      },
      onAudioUpload: async (file) => {
        try {
          const audioData = await this.audioEngine.loadAudioFile(file);
          this.comp.audio = audioData;
          const audioHeader = timelineContainer.querySelector('#stlAudioHeader');
          const waveformTrack = timelineContainer.querySelector('#stlWaveformTrack');
          const waveformCanvas = timelineContainer.querySelector('#stlWaveformCanvas');

          audioHeader.style.display = 'block';
          audioHeader.textContent = `🎵 ${file.name.slice(0, 16)}`;
          waveformTrack.style.display = 'block';

          this.audioEngine.renderWaveform(waveformCanvas, this.comp.duration, this.comp.currentTime);
          this.timeline.render();
        } catch (err) {
          alert('Could not decode audio: ' + err.message);
        }
      },
    });
  }

  _applyActiveLayerValues() {
    const layer = this.selectedLayer;
    if (!layer) return;

    this.container.querySelector('#studioTextInput').value = layer.text || '';
    this.container.querySelector('#studioFontFamily').value = layer.fontFamily || "'JetBrains Mono', monospace";
    this.container.querySelector('#studioPresetEasing').value = layer.presetEasing || 'easeInOutCubic';

    const setPair = (rangeId, numId, val) => {
      this.container.querySelector(`#${rangeId}`).value = val;
      this.container.querySelector(`#${numId}`).value = val;
    };

    setPair('studioFontSize', 'studioFontSizeNum', layer.fontSize ?? 58);
    setPair('studioLetterSpacing', 'studioLetterSpacingNum', layer.letterSpacing ?? 3);
    setPair('studioLineHeight', 'studioLineHeightNum', layer.lineHeight ?? 1.25);
    setPair('studioRotX', 'studioRotXNum', layer.rotX ?? 18);
    setPair('studioRotY', 'studioRotYNum', layer.rotY ?? -22);
    setPair('studioRotZ', 'studioRotZNum', layer.rotZ ?? 0);
    setPair('studioScale', 'studioScaleNum', layer.scale ?? 1.0);
    setPair('studioDepth', 'studioDepthNum', layer.depth ?? 36);
    setPair('studioSlices', 'studioSlicesNum', layer.slices ?? 14);
    setPair('studioPerspective', 'studioPerspectiveNum', layer.perspective ?? 750);
    setPair('studioScanlineIntensity', 'studioScanlineIntensityNum', layer.scanlineIntensity ?? 0.35);
    setPair('studioBloomIntensity', 'studioBloomIntensityNum', layer.bloomIntensity ?? 0.5);
    setPair('studioPresetSpeed', 'studioPresetSpeedNum', layer.presetSpeed ?? 1.0);

    this.container.querySelector('#studioFrontColor').value = layer.frontColor || '#ffffff';
    this.container.querySelector('#studioExtrudeColor').value = layer.extrudeColor || '#3a7bd5';
    this.container.querySelector('#studioHighlightColor').value = layer.highlightColor || '#00ffff';

    this.container.querySelector('#studioScanlinesCheck').checked = layer.scanlines ?? true;
    this.container.querySelector('#studioBloomCheck').checked = layer.bloom ?? true;
    this.container.querySelector('#studioShadowCheck').checked = layer.shadow ?? true;

    // Presets active class
    const presetGrid = this.container.querySelector('#studioPresetGrid');
    presetGrid.querySelectorAll('.studio-preset-card').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.preset === (layer.preset || 'cinematicReveal'));
    });
  }

  _updateAspectDimensions() {
    const key = this.comp.aspectRatio || '16:9';
    const info = ASPECT_RATIOS[key] || ASPECT_RATIOS['16:9'];
    this.comp.width = info.defaultW;
    this.comp.height = info.defaultH;

    this.mainCanvas.width = this.comp.width;
    this.mainCanvas.height = this.comp.height;

    // Adjust canvas frame aspect-ratio
    this.canvasFrame.style.aspectRatio = `${this.comp.width} / ${this.comp.height}`;
    this.container.querySelector('#studioDimBadge').textContent = `${this.comp.width} × ${this.comp.height}`;
  }

  _saveAutosave() {
    StudioProjectStore.saveToLocalStorage(this.comp);
  }

  _initAnimationLoop() {
    const loop = (timestamp) => {
      const dt = (timestamp - this._lastTime) / 1000;
      this._lastTime = timestamp;

      if (this.comp.isPlaying) {
        this.comp.currentTime += dt;
        if (this.comp.currentTime >= this.comp.duration) {
          if (this.comp.loop) {
            this.comp.currentTime = 0;
            if (this.audioEngine.isPlaying) {
              this.audioEngine.play(0);
            }
          } else {
            this.comp.currentTime = this.comp.duration;
            this.timeline?.pause();
          }
        }
        this.timeline?.updatePlayheadPosition();
      }

      // Calculate beat pulse if active
      let beatPulse = 0;
      if (this.comp.syncToBeat && this.audioEngine) {
        beatPulse = this.audioEngine.getBeatPulse(this.comp.currentTime);
      }

      // Render frame
      renderStudioFrame(this.comp, this.comp.currentTime, this.mainCanvas, { beatPulse });

      this._rafId = requestAnimationFrame(loop);
    };

    this._rafId = requestAnimationFrame(loop);
  }

  _openExportModal() {
    const modalRoot = this.container.querySelector('#studioExportModalRoot');
    modalRoot.innerHTML = `
      <div class="studio-modal-backdrop" id="studioModalBackdrop">
        <div class="studio-modal-card">
          <div class="studio-modal-header">
            <span class="studio-modal-title">EXPORT HIGH-QUALITY VIDEO</span>
            <button class="studio-modal-close" id="studioModalCloseBtn">✕</button>
          </div>

          <div style="margin-bottom:12px;">
            <label class="studio-label">Format</label>
            <select class="studio-select" id="studioExportFormat">
              <option value="mp4">MP4 Video (H.264 High Profile)</option>
              <option value="webm">WebM Video (VP9 / Chrome / Mobile)</option>
            </select>

            <label class="studio-label">Resolution</label>
            <select class="studio-select" id="studioExportResolution">
              <option value="1080p" selected>1080p Full HD (Recommended)</option>
              <option value="720p">720p HD</option>
              <option value="1440p">1440p 2K</option>
              <option value="4k">4K Ultra HD</option>
              <option value="480p">480p Draft</option>
            </select>

            <label class="studio-label">Framerate</label>
            <select class="studio-select" id="studioExportFps">
              <option value="60" selected>60 FPS (Ultra Smooth Motion)</option>
              <option value="30">30 FPS (Standard Video)</option>
              <option value="24">24 FPS (Cinematic Motion)</option>
            </select>
          </div>

          <div class="studio-export-progress-bar" id="studioExportBar" style="display:none;">
            <div class="studio-export-progress-fill" id="studioExportFill"></div>
          </div>

          <div class="studio-export-meta" id="studioExportMeta" style="display:none;">
            <span id="studioExportPct">0%</span>
            <span id="studioExportFrames">Frame 0 / 0</span>
            <span id="studioExportEta">ETA: 0s</span>
          </div>

          <div id="studioExportSuccess" style="display:none; margin-bottom:12px; color:#39ff52; font-size:12px; font-weight:bold;">
            ✓ EXPORT COMPLETE!
          </div>

          <div style="display:flex; gap:8px;">
            <button class="studio-btn-export" style="flex:1;" id="studioBtnStartExport">START EXPORT</button>
            <a class="studio-btn-export" style="flex:1; background:#39ff52; display:none; text-decoration:none; text-align:center;" id="studioBtnDownloadResult" download>
              DOWNLOAD VIDEO
            </a>
            <button class="stl-btn" style="display:none;" id="studioBtnCancelExport">CANCEL</button>
          </div>
        </div>
      </div>
    `;

    const closeBtn = modalRoot.querySelector('#studioModalCloseBtn');
    const startBtn = modalRoot.querySelector('#studioBtnStartExport');
    const cancelBtn = modalRoot.querySelector('#studioBtnCancelExport');
    const downloadBtn = modalRoot.querySelector('#studioBtnDownloadResult');
    const bar = modalRoot.querySelector('#studioExportBar');
    const fill = modalRoot.querySelector('#studioExportFill');
    const meta = modalRoot.querySelector('#studioExportMeta');
    const pctLabel = modalRoot.querySelector('#studioExportPct');
    const framesLabel = modalRoot.querySelector('#studioExportFrames');
    const etaLabel = modalRoot.querySelector('#studioExportEta');
    const successMsg = modalRoot.querySelector('#studioExportSuccess');

    const closeModal = () => {
      this.videoExporter.abort();
      modalRoot.innerHTML = '';
    };

    closeBtn.addEventListener('click', closeModal);

    cancelBtn.addEventListener('click', () => {
      this.videoExporter.abort();
      closeModal();
    });

    startBtn.addEventListener('click', async () => {
      startBtn.style.display = 'none';
      cancelBtn.style.display = 'block';
      bar.style.display = 'block';
      meta.style.display = 'flex';

      const format = modalRoot.querySelector('#studioExportFormat').value;
      const fps = parseInt(modalRoot.querySelector('#studioExportFps').value, 10);

      await this.videoExporter.exportVideo(this.comp, {
        fps,
        format,
        audioEngine: this.audioEngine,
        onProgress: (pct, frame, total, elapsed, eta) => {
          fill.style.width = `${pct}%`;
          pctLabel.textContent = `${pct}%`;
          framesLabel.textContent = `Frame ${frame} / ${total}`;
          etaLabel.textContent = `ETA: ${Math.round(eta)}s`;
        },
        onComplete: (blob, url, filename) => {
          cancelBtn.style.display = 'none';
          successMsg.style.display = 'block';
          downloadBtn.style.display = 'flex';
          downloadBtn.href = url;
          downloadBtn.download = filename;

          // Auto trigger download
          downloadBtn.click();
        },
        onError: (err) => {
          alert('Export failed: ' + err);
          closeModal();
        },
      });
    });
  }

  destroy() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
    }
    this.audioEngine?.stop();
    this.videoExporter?.abort();
  }
}
