import { AsciliEngine, CHAR_SETS } from './engine.js';
import { AsciliVideoExporter, AsciliSrtExporter, AsciliLiveRecorder, renderFrameToCanvas, computeFontForResolution } from './exporter.js';

// ─── Presets ────────────────────────────────────────────────────────────────

const PRESETS = {
  classic:    { colorMode:'monochrome', charSet:'standard', invertChars:true,  cols:80,  fontSize:10, fps:60, brightness:0,  contrast:10,  gamma:0,  saturation:0,   enableEdgeDetection:true,  edgeThreshold:0.18, temporalSmoothing:0.35, adaptiveContrast:true },
  matrix:     { colorMode:'monochrome', charSet:'extended', invertChars:false, cols:100, fontSize:8,  fps:60, brightness:5,  contrast:20,  gamma:0,  saturation:0,   enableEdgeDetection:true,  edgeThreshold:0.15, temporalSmoothing:0.40, adaptiveContrast:true },
  truecolor:  { colorMode:'truecolor',  charSet:'standard', invertChars:false, cols:80,  fontSize:10, fps:60, brightness:0,  contrast:0,   gamma:0,  saturation:20,  enableEdgeDetection:true,  edgeThreshold:0.16, temporalSmoothing:0.30, adaptiveContrast:true },
  braille:    { colorMode:'grayscale',  charSet:'braille',  invertChars:false, cols:120, fontSize:10, fps:60, brightness:5,  contrast:15,  gamma:0,  saturation:0,   enableEdgeDetection:false, edgeThreshold:0.20, temporalSmoothing:0.25, adaptiveContrast:true },
  blocks:     { colorMode:'ansi256',    charSet:'block',    invertChars:false, cols:80,  fontSize:12, fps:60, brightness:0,  contrast:5,   gamma:0,  saturation:10,  enableEdgeDetection:false, edgeThreshold:0.20, temporalSmoothing:0.20, adaptiveContrast:true },
};

// ─── DOM Refs ────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const asciiOutput   = $('asciiOutput');
const asciiCanvas   = $('asciiCanvas');
const asciiContainer = $('asciiContainer');
const waitingOverlay = $('waitingOverlay');
const sourceVideo   = $('sourceVideo');
const sourcePreview = $('sourcePreview');
const sourceLabel   = $('sourceLabel');
const settingsPanel = $('settingsPanel');
const toast         = $('toast');
const scanlines     = $('scanlines');
const dropOverlay   = $('dropOverlay');

// AI Vision Refs
const checkAiEdge            = $('checkAiEdge');
const rangeEdgeThreshold     = $('rangeEdgeThreshold') || $('inputEdge');
const valEdgeThreshold       = $('valEdgeThreshold');
const checkTemporal          = $('checkTemporal');
const checkAdaptiveContrast  = $('checkAdaptiveContrast');

// Controls
const btnWebcam     = $('btnWebcam');
const btnScreen     = $('btnScreen');
const btnFile       = $('btnFile');
const fileInput     = $('fileInput');
const btnPause      = $('btnPause');
const iconPause     = $('iconPause');
const iconPlay      = $('iconPlay');
const btnFullscreen = $('btnFullscreen');
const btnSettings   = $('btnSettings');
const btnScanlines  = $('btnScanlines');
const btnResetSettings = $('btnResetSettings');
const btnCopy       = $('btnCopy');
const btnDownloadTxt  = $('btnDownloadTxt');
const btnDownloadHtml = $('btnDownloadHtml');
const btnScreenshot = $('btnScreenshot');
const mobileMenuBtn = $('mobileMenuBtn');
const presetBar     = $('presetBar');

// Record button & indicator
const btnRecord     = $('btnRecord');
const recIndicator  = $('recIndicator');
const recTimer      = $('recTimer');

// Video timeline
const vtBar      = $('vtBar');
const vtTrack    = $('vtTrack');
const vtFill     = $('vtFill');
const vtThumb    = $('vtThumb');
const vtTime     = $('vtTime');
const vtDuration = $('vtDuration');
const vtSpeed    = $('vtSpeed');

// Color swatches
const colorSwatchRow = $('colorSwatchRow');
const colorSwatches  = document.querySelectorAll('.color-swatch');

// Scanlines toggle in settings
const checkScanlines = $('checkScanlines');

// Topbar download dropdown
const btnDownload   = $('btnDownload');
const dlMenu        = $('dlMenu');
const dlTxt         = $('dlTxt');
const dlHtml        = $('dlHtml');
const dlPng         = $('dlPng');
const dlRecordVideo = $('dlRecordVideo');
const dlRecordLabel = $('dlRecordLabel');
const dlVideo       = $('dlVideo');

// Settings inputs
const selectColorMode   = $('selectColorMode');
const selectCharSet     = $('selectCharSet');
const customCharRow     = $('customCharRow');
const inputCustomChars  = $('inputCustomChars');
const checkInvert       = $('checkInvert');
const rangeCols         = $('rangeCols') || $('inputCols');
const valCols           = $('valCols');
const rangeFontSize     = $('rangeFontSize');
const valFontSize       = $('valFontSize');
const selectFps         = $('selectFps') || $('inputFps');
const legacyCenteredSliders = !$('rangeBrightness');
const rangeBrightness   = $('rangeBrightness') || $('inputBrightness');
const valBrightness     = $('valBrightness');
const rangeContrast     = $('rangeContrast') || $('inputContrast');
const valContrast       = $('valContrast');
const rangeGamma        = $('rangeGamma') || $('inputGamma');
const valGamma          = $('valGamma');
const rangeSaturation   = $('rangeSaturation');
const valSaturation     = $('valSaturation');

// Stats
const statFps       = $('statFps');
const statLatency   = $('statLatency');
const statChars     = $('statChars');
const statDims      = $('statDims');
const statMode      = $('statMode');
const statSource    = $('statSource');

// Preset buttons
const presetBtns = document.querySelectorAll('.preset-btn');

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  sourceType:    'none',   // 'webcam' | 'screen' | 'file' | 'none'
  currentFile:   null,     // uploaded File object for seamless export
  currentObjectUrl: null,
  sourceLoadToken: 0,
  running:       false,
  paused:        false,
  stream:        null,     // MediaStream (webcam / screen)
  rafId:         null,
  videoFrameCallbackId: null,
  lastFrameTs:   0,
  frameCount:    0,
  fpsAccum:      0,
  lastFpsTs:     0,
  actualFps:     0,
  renderWarningShown: false,
  monoColor:     '#39ff52',
  scanlinesOn:   false,
  vtSeeking:     false,   // user is scrubbing the timeline
  currentScale:  0,       // auto-fit scale factor
  qualityScale:  1,
  qualityBaseCols: 0,
  slowRenderSamples: 0,
  fastRenderSamples: 0,
};

// Config (mirrors UI controls)
const cfg = {
  colorMode:   'monochrome',
  charSet:     CHAR_SETS.standard,
  invertChars: false,
  cols:        80,
  fontSize:    10,
  fps:         60,
  brightness:  0,
  contrast:    0,
  gamma:       0,
  saturation:  0,
  // AI Vision parameters
  enableEdgeDetection: true,
  edgeThreshold:       0.16,
  temporalSmoothing:   0.35,
  adaptiveContrast:    true,
};

const engine = new AsciliEngine();
if (typeof window !== 'undefined') {
  window.__ascili = { engine, state, cfg, AsciliVideoExporter, AsciliLiveRecorder, get cvExporter() { return cvExporter; } };
}

// ─── Auto-Fit Container Layout (Fixed, Centered, Smooth Scaling) ─────────────

let lastLayoutRows = 0;
let lastLayoutCols = 0;

function updateAsciiLayout(rows, cols, force = false) {
  if (!rows || !cols) return;
  if (!force && rows === lastLayoutRows && cols === lastLayoutCols) return;
  lastLayoutRows = rows;
  lastLayoutCols = cols;

  const cw = asciiContainer.clientWidth;
  const ch = asciiContainer.clientHeight;
  if (!cw || !ch) return;

  const availW = Math.max(40, cw - 16);
  const availH = Math.max(40, ch - 16);

  // Character cell aspect ratio: Courier New character width / height ≈ 0.601
  const gridAspect = (cols * 0.601) / rows;
  const containerAspect = availW / availH;

  let cssW, cssH;
  if (containerAspect > gridAspect) {
    cssH = availH;
    cssW = Math.round(cssH * gridAspect);
  } else {
    cssW = availW;
    cssH = Math.round(cssW / gridAspect);
  }

  cssW = Math.max(32, cssW);
  cssH = Math.max(32, cssH);

  asciiCanvas.style.width  = cssW + 'px';
  asciiCanvas.style.height = cssH + 'px';

  // Physical buffer resolution for retina / high-DPI displays
  const requestedDpr = Math.min(2, window.devicePixelRatio || 1);
  const dpr = Math.min(requestedDpr, Math.sqrt(4_000_000 / Math.max(1, cssW * cssH)));
  const bufW = Math.max(2, Math.round(cssW * dpr));
  const bufH = Math.max(2, Math.round(cssH * dpr));

  if (asciiCanvas.width !== bufW || asciiCanvas.height !== bufH) {
    asciiCanvas.width  = bufW;
    asciiCanvas.height = bufH;
  }
}

window.addEventListener('resize', () => {
  if (lastLayoutRows && lastLayoutCols) {
    updateAsciiLayout(lastLayoutRows, lastLayoutCols, true);
  }
});

if (typeof ResizeObserver !== 'undefined') {
  const layoutObserver = new ResizeObserver(() => {
    if (lastLayoutRows && lastLayoutCols) {
      updateAsciiLayout(lastLayoutRows, lastLayoutCols, true);
    }
  });
  layoutObserver.observe(asciiContainer);
}

// ─── Toast ───────────────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

// ─── Read Config From UI ─────────────────────────────────────────────────────

function readConfig() {
  cfg.colorMode   = selectColorMode?.value || cfg.colorMode;
  cfg.invertChars = checkInvert?.checked ?? false;
  cfg.cols        = Math.min(1000, Math.max(20, parseInt(rangeCols?.value, 10) || cfg.cols));
  cfg.fontSize    = Math.min(30, Math.max(1, parseInt(rangeFontSize?.value, 10) || cfg.fontSize));
  cfg.fps         = 60;
  if (rangeBrightness) {
    const value = parseInt(rangeBrightness.value, 10);
    cfg.brightness = legacyCenteredSliders ? value - 100 : value;
  }
  if (rangeContrast) {
    const value = parseInt(rangeContrast.value, 10);
    cfg.contrast = legacyCenteredSliders ? value - 100 : value;
  }
  if (rangeGamma) {
    const value = parseInt(rangeGamma.value, 10);
    cfg.gamma = legacyCenteredSliders ? value - 100 : value;
  }
  if (rangeSaturation) cfg.saturation = parseInt(rangeSaturation.value, 10);

  // AI Vision controls
  if (checkAiEdge) cfg.enableEdgeDetection = checkAiEdge.checked;
  if (rangeEdgeThreshold) {
    cfg.edgeThreshold = parseInt(rangeEdgeThreshold.value, 10) / 100.0;
    if (valEdgeThreshold) valEdgeThreshold.textContent = rangeEdgeThreshold.value;
  }
  if (checkTemporal) cfg.temporalSmoothing = checkTemporal.checked ? 0.35 : 0.0;
  if (checkAdaptiveContrast) cfg.adaptiveContrast = checkAdaptiveContrast.checked;

  const cs = selectCharSet?.value || 'standard';
  if (cs === 'custom') {
    cfg.charSet = inputCustomChars?.value || CHAR_SETS.standard;
  } else {
    cfg.charSet = CHAR_SETS[cs] || CHAR_SETS.standard;
  }

  if (customCharRow) customCharRow.style.display = cs === 'custom' ? 'block' : 'none';

  // Show/hide color swatches based on monochrome mode
  if (colorSwatchRow) colorSwatchRow.style.display = cfg.colorMode === 'monochrome' ? 'block' : 'none';

  // Apply font size to output
  if (asciiOutput) {
    asciiOutput.style.fontSize    = cfg.fontSize + 'px';
    asciiOutput.style.lineHeight  = '1.0';
    asciiOutput.style.letterSpacing = '0';
  }

  // Apply monochrome color or default
  if (asciiOutput && cfg.colorMode === 'monochrome') {
    asciiOutput.style.color      = state.monoColor;
    asciiOutput.style.textShadow = `0 0 6px ${state.monoColor}44`;
  } else if (asciiOutput) {
    asciiOutput.style.color      = '#fff';
    asciiOutput.style.textShadow = 'none';
  }

  state.currentScale = 0;
  engine.reset();
}

// ─── Apply Preset ────────────────────────────────────────────────────────────

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;

  if (selectColorMode) selectColorMode.value = p.colorMode;
  if (selectCharSet) selectCharSet.value = p.charSet in CHAR_SETS ? p.charSet : 'standard';
  if (checkInvert) checkInvert.checked = p.invertChars;
  const presetCols = Math.min(1000, Math.max(20, p.cols));
  const presetFontSize = Math.min(30, Math.max(1, p.fontSize));
  if (rangeCols) rangeCols.value = presetCols;
  if (valCols) valCols.textContent = presetCols;
  if (rangeFontSize) rangeFontSize.value = presetFontSize;
  if (valFontSize) valFontSize.textContent = presetFontSize;
  if (selectFps) selectFps.value = p.fps;
  if (rangeBrightness) rangeBrightness.value = p.brightness + (legacyCenteredSliders ? 100 : 0);
  if (valBrightness) valBrightness.textContent = p.brightness;
  if (rangeContrast) rangeContrast.value = p.contrast + (legacyCenteredSliders ? 100 : 0);
  if (valContrast) valContrast.textContent = p.contrast;
  if (rangeGamma) rangeGamma.value = p.gamma + (legacyCenteredSliders ? 100 : 0);
  if (valGamma) valGamma.textContent = p.gamma;
  if (rangeSaturation) rangeSaturation.value = p.saturation;
  if (valSaturation) valSaturation.textContent = p.saturation;

  // AI Vision Preset values
  if (checkAiEdge) checkAiEdge.checked = p.enableEdgeDetection ?? true;
  if (rangeEdgeThreshold) {
    rangeEdgeThreshold.value = Math.round((p.edgeThreshold ?? 0.16) * 100);
    if (valEdgeThreshold) valEdgeThreshold.textContent = rangeEdgeThreshold.value;
  }
  if (checkTemporal) checkTemporal.checked = (p.temporalSmoothing ?? 0.35) > 0;
  if (checkAdaptiveContrast) checkAdaptiveContrast.checked = p.adaptiveContrast ?? true;

  presetBtns.forEach(b => b.classList.toggle('active', b.dataset.preset === name));
  readConfig();
  showToast('Preset: ' + name.toUpperCase());
}

// ─── Color Swatches ──────────────────────────────────────────────────────────

colorSwatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    state.monoColor = swatch.dataset.color;
    colorSwatches.forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    // Update CSS variable for engine use
    document.documentElement.style.setProperty('--green', state.monoColor);
    readConfig();
    showToast('Color: ' + swatch.title);
  });
});

// ─── Scanlines Toggle ────────────────────────────────────────────────────────

function toggleScanlines() {
  state.scanlinesOn = !state.scanlinesOn;
  scanlines.classList.toggle('active', state.scanlinesOn);
  btnScanlines.classList.toggle('active', state.scanlinesOn);
  if (checkScanlines) checkScanlines.checked = state.scanlinesOn;
}

btnScanlines.addEventListener('click', toggleScanlines);
if (checkScanlines) {
  checkScanlines.addEventListener('change', () => {
    state.scanlinesOn = checkScanlines.checked;
    scanlines.classList.toggle('active', state.scanlinesOn);
    btnScanlines.classList.toggle('active', state.scanlinesOn);
  });
}

// ─── Mobile menu ─────────────────────────────────────────────────────────────

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', () => {
    presetBar.classList.toggle('mobile-visible');
  });
}

// ─── Stats Update ────────────────────────────────────────────────────────────

function updateStats(dims, latency, performanceStats = {}) {
  if (statLatency) statLatency.textContent = String(Math.round(latency)).padStart(3, '0');
  if (performanceStats.gpuTimeMs !== null && performanceStats.gpuTimeMs !== undefined) {
    if (statLatency) statLatency.title = `GPU render time: ${performanceStats.gpuTimeMs.toFixed(2)} ms (asynchronous timer query)`;
  } else if (performanceStats.workerTimeMs !== null && performanceStats.workerTimeMs !== undefined) {
    if (statLatency) statLatency.title = `Canvas worker render time: ${performanceStats.workerTimeMs.toFixed(2)} ms`;
  } else {
    if (statLatency) statLatency.title = `Main thread render submission: ${latency.toFixed(2)} ms`;
  }
  if (statChars) statChars.textContent = dims.chars.toLocaleString();
  if (statDims) statDims.textContent = `${dims.cols}x${dims.rows}`;
  if (statMode) {
    statMode.textContent = cfg.colorMode.toUpperCase();
    statMode.classList.toggle('active', state.running);
  }
  if (statSource) {
    statSource.textContent = state.sourceType.toUpperCase();
    statSource.classList.toggle('active', state.sourceType !== 'none');
  }
}

// ─── Video Timeline ──────────────────────────────────────────────────────────

function fmtVtTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function updateTimeline() {
  if (state.sourceType !== 'file' || !sourceVideo.duration) {
    vtBar.classList.remove('visible');
    return;
  }
  vtBar.classList.add('visible');

  const pct = (sourceVideo.currentTime / sourceVideo.duration) * 100;
  vtFill.style.width = pct + '%';
  vtThumb.style.left = pct + '%';
  vtTime.textContent     = fmtVtTime(sourceVideo.currentTime);
  vtDuration.textContent = fmtVtTime(sourceVideo.duration);
}

// Timeline scrubbing
vtTrack.addEventListener('mousedown', e => {
  state.vtSeeking = true;
  seekToPosition(e);
  const onMove = ev => seekToPosition(ev);
  const onUp   = () => {
    state.vtSeeking = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

vtTrack.addEventListener('touchstart', e => {
  state.vtSeeking = true;
  seekToPosition(e.touches[0]);
}, { passive: true });
vtTrack.addEventListener('touchmove', e => {
  seekToPosition(e.touches[0]);
}, { passive: true });
vtTrack.addEventListener('touchend', () => {
  state.vtSeeking = false;
}, { passive: true });

function seekToPosition(e) {
  const rect = vtTrack.getBoundingClientRect();
  const x    = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const pct  = x / rect.width;
  if (sourceVideo.duration) {
    sourceVideo.currentTime = pct * sourceVideo.duration;
    updateTimeline();
  }
}

// ─── Live Recording ──────────────────────────────────────────────────────────

const liveRecorder = new AsciliLiveRecorder();
let recTimerInterval = null;

function fmtRecTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

async function startLiveRecording() {
  if (!state.running) { showToast('Start a video source first'); return; }
  if (liveRecorder.running) { stopLiveRecording(); return; }

  readConfig();
  const mimeType = detectMime();
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const filename = `ascili-rec-${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.${extension}`;
  let writable = null;
  try {
    writable = await chooseVideoFile(mimeType, filename);
    if (writable === false) return;
  } catch (error) {
    showToast('Could not open output file: ' + error.message);
    return;
  }

  liveRecorder.startRecording(cfg, {
    targetFps: cfg.fps,
    resolution: '1080p',
    videoWidth:  sourceVideo.videoWidth  || 640,
    videoHeight: sourceVideo.videoHeight || 480,
    writable,
    onComplete(blob, mimeType, result) {
      if (result?.savedToDisk) {
        showToast('Recording saved to the selected file');
      } else {
        download(filename, blob, mimeType);
        showToast('Recording saved — ' + fmtBytes(blob.size));
      }
      updateRecUI(false);
    },
    onError(msg) {
      showToast('Recording error: ' + msg);
      updateRecUI(false);
    },
  });

  updateRecUI(true);
  showToast('Recording started');
}

function stopLiveRecording() {
  liveRecorder.stopRecording();
  // onComplete callback will handle download and UI
}

function updateRecUI(isRecording) {
  btnRecord.classList.toggle('recording', isRecording);
  recIndicator.classList.toggle('visible', isRecording);

  if (dlRecordVideo) {
    dlRecordVideo.classList.toggle('recording', isRecording);
    if (dlRecordLabel) {
      dlRecordLabel.textContent = isRecording ? 'Stop & Download Video' : 'Record Rendered Video';
    }
  }

  if (isRecording) {
    recTimerInterval = setInterval(() => {
      recTimer.textContent = fmtRecTime(liveRecorder.elapsed);
    }, 500);
  } else {
    clearInterval(recTimerInterval);
    recTimerInterval = null;
    recTimer.textContent = '00:00';
  }
}

btnRecord.addEventListener('click', () => {
  if (liveRecorder.running) {
    stopLiveRecording();
  } else {
    startLiveRecording();
  }
});

// ─── Render Loop ─────────────────────────────────────────────────────────────

function scheduleRender() {
  if (!state.running || state.paused) return;
  if (typeof sourceVideo.requestVideoFrameCallback === 'function') {
    state.videoFrameCallbackId = sourceVideo.requestVideoFrameCallback((now) => {
      state.videoFrameCallbackId = null;
      renderLoop(now);
    });
  } else {
    state.rafId = requestAnimationFrame((now) => {
      state.rafId = null;
      renderLoop(now);
    });
  }
}

function adaptRenderQuality(renderCostMs, frameBudgetMs) {
  if (state.qualityBaseCols !== cfg.cols) {
    state.qualityBaseCols = cfg.cols;
    state.qualityScale = 1;
    state.slowRenderSamples = 0;
    state.fastRenderSamples = 0;
  }

  if (renderCostMs > frameBudgetMs * 0.85) {
    state.slowRenderSamples++;
    state.fastRenderSamples = 0;
    if (state.slowRenderSamples >= 8 && state.qualityScale > 0.4) {
      state.qualityScale = Math.max(0.4, state.qualityScale * 0.85);
      state.slowRenderSamples = 0;
    }
  } else if (renderCostMs < frameBudgetMs * 0.55) {
    state.fastRenderSamples++;
    state.slowRenderSamples = 0;
    if (state.fastRenderSamples >= 45 && state.qualityScale < 1) {
      state.qualityScale = Math.min(1, state.qualityScale + 0.05);
      state.fastRenderSamples = 0;
    }
  } else {
    state.slowRenderSamples = 0;
    state.fastRenderSamples = 0;
  }
}

function renderLoop(ts) {
  if (state.paused || !state.running) return;
  scheduleRender();

  const interval = 1000 / cfg.fps;
  if (ts - state.lastFrameTs < interval) return;

  if (!sourceVideo.videoWidth) return;

  const t0 = performance.now();
  const dims = engine.renderFrame(sourceVideo, asciiCanvas, {
    ...cfg,
    cols: Math.max(20, Math.floor(cfg.cols * state.qualityScale)),
    monoColor: state.monoColor,
    scanlines: state.scanlinesOn,
  });
  if (dims.rendered === false) {
    if (!state.renderWarningShown) {
      showToast('This device could not render this grid size. Reduce columns.');
      state.renderWarningShown = true;
    }
    return;
  }
  updateAsciiLayout(dims.rows, dims.cols);
  const latency = performance.now() - t0;
  const performanceStats = engine.getPerformanceStats();
  const measuredRenderMs = performanceStats.gpuTimeMs ?? performanceStats.workerTimeMs ?? latency;
  adaptRenderQuality(measuredRenderMs, interval);

  // If live recording is active, capture this frame
  if (liveRecorder.running) {
    liveRecorder.captureFrame(sourceVideo, cfg);
  }

  state.lastFrameTs = ts;
  state.frameCount++;

  // Update timeline for file playback
  if (state.sourceType === 'file' && !state.vtSeeking) {
    updateTimeline();
  }

  // FPS counter (update every second)
  if (ts - state.lastFpsTs >= 1000) {
    state.actualFps  = Math.round(state.frameCount * 1000 / (ts - state.lastFpsTs));
    state.frameCount = 0;
    state.lastFpsTs  = ts;
    if (statFps) statFps.textContent = String(state.actualFps).padStart(2, '0');
  }

  updateStats(dims, latency, performanceStats);
}

function startRenderLoop() {
  stopRenderLoop();
  state.lastFpsTs  = performance.now();
  state.frameCount = 0;
  state.running    = true;
  scheduleRender();
}

function stopRenderLoop() {
  if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  if (state.videoFrameCallbackId !== null && typeof sourceVideo.cancelVideoFrameCallback === 'function') {
    sourceVideo.cancelVideoFrameCallback(state.videoFrameCallbackId);
    state.videoFrameCallbackId = null;
  }
  state.running = false;
}

// ─── Source Management ───────────────────────────────────────────────────────

function stopCurrentSource() {
  // Stop live recording if active
  if (liveRecorder.running) {
    stopLiveRecording();
  }

  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  state.sourceLoadToken++;
  sourceVideo.pause();
  sourceVideo.srcObject = null;
  sourceVideo.removeAttribute('src');
  sourceVideo.load();
  if (state.currentObjectUrl) {
    URL.revokeObjectURL(state.currentObjectUrl);
    state.currentObjectUrl = null;
  }
  stopRenderLoop();
  state.sourceType = 'none';
  state.currentFile = null;
  state.paused = false;
  state.renderWarningShown = false;
  iconPause.style.display = '';
  iconPlay.style.display = 'none';
  document.querySelector('.paused-badge')?.classList.remove('visible');
  waitingOverlay.classList.remove('hidden');
  sourcePreview.classList.remove('visible');
  vtBar.classList.remove('visible');
  engine.reset();

  document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
  if (statFps) statFps.textContent = '00';
  if (statLatency) statLatency.textContent = '000';
  if (statChars) statChars.textContent = '0';
  if (statDims) statDims.textContent = '0x0';
}

function attachStream(stream, type) {
  stopCurrentSource();
  state.stream      = stream;
  state.sourceType  = type;
  state.currentFile = null;
  sourceVideo.srcObject = stream;
  sourceVideo.play().then(() => {
    waitingOverlay.classList.add('hidden');
    sourcePreview.classList.add('visible');
    sourceLabel.textContent = type.toUpperCase();
    startRenderLoop();
  }).catch(err => {
    showToast('ERROR: ' + err.message);
  });
}

const VIDEO_FILE_EXTENSIONS = /\.(?:3gp|avi|m4v|mkv|mov|mp4|mpeg|mpg|ogv|ogg|webm)$/i;
function isVideoFile(file) {
  return Boolean(file && (file.type?.startsWith('video/') || VIDEO_FILE_EXTENSIONS.test(file.name || '')));
}

function filePlaybackError() {
  const code = sourceVideo.error?.code;
  if (code === 3 || code === 4) {
    return 'This video format or codec is not supported here. Try an MP4 (H.264) or WebM video.';
  }
  if (code === 2) return 'The browser could not read this video file.';
  return 'Could not play this video. Try an MP4 (H.264) or WebM file.';
}

function attachFile(file) {
  if (!isVideoFile(file)) {
    showToast('Choose a video file such as MP4 or WebM.');
    return;
  }
  stopCurrentSource();
  const loadToken = ++state.sourceLoadToken;
  state.sourceType  = 'file';
  state.currentFile = file;
  const url = URL.createObjectURL(file);
  state.currentObjectUrl = url;
  sourceVideo.loop  = true;
  sourceVideo.muted = true;
  sourceVideo.controls = false;
  sourceVideo.src = url;

  let hasFrame = false;
  let playbackStarted = false;
  const startWhenReady = () => {
    if (loadToken !== state.sourceLoadToken || !hasFrame || !playbackStarted || !sourceVideo.videoWidth) return;
    sourceVideo.controls = false;
    waitingOverlay.classList.add('hidden');
    sourcePreview.classList.add('visible');
    sourceLabel.textContent = 'FILE';
    updateTimeline();
    if (!state.running) startRenderLoop();
  };
  const handleFrame = () => {
    if (loadToken !== state.sourceLoadToken) return;
    hasFrame = true;
    if (sourceVideo.videoWidth) {
      waitingOverlay.classList.add('hidden');
      sourcePreview.classList.add('visible');
      sourceLabel.textContent = 'FILE';
    }
    startWhenReady();
  };
  const handlePlaying = () => {
    if (loadToken !== state.sourceLoadToken) return;
    playbackStarted = true;
    startWhenReady();
  };
  const handleError = () => {
    if (loadToken !== state.sourceLoadToken) return;
    const message = filePlaybackError();
    stopCurrentSource();
    showToast(message);
  };

  sourceVideo.addEventListener('loadeddata', handleFrame, { once: true });
  sourceVideo.addEventListener('playing', handlePlaying, { once: true });
  sourceVideo.addEventListener('error', handleError, { once: true });
  sourceVideo.load();
  sourceVideo.play().then(() => {
    playbackStarted = true;
    startWhenReady();
  }).catch(err => {
    if (loadToken !== state.sourceLoadToken) return;
    if (err.name === 'NotAllowedError') {
      sourceVideo.controls = true;
      if (hasFrame) {
        waitingOverlay.classList.add('hidden');
        sourcePreview.classList.add('visible');
        sourceLabel.textContent = 'FILE';
      }
      showToast('Press Play on the video preview to start rendering.');
    } else {
      handleError();
    }
  });
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────────

let dragCounter = 0;

asciiContainer.addEventListener('dragenter', e => {
  e.preventDefault();
  dragCounter++;
  asciiContainer.classList.add('drop-active');
  dropOverlay.classList.add('visible');
});

asciiContainer.addEventListener('dragover', e => {
  e.preventDefault();
});

asciiContainer.addEventListener('dragleave', e => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    asciiContainer.classList.remove('drop-active');
    dropOverlay.classList.remove('visible');
  }
});

asciiContainer.addEventListener('drop', e => {
  e.preventDefault();
  dragCounter = 0;
  asciiContainer.classList.remove('drop-active');
  dropOverlay.classList.remove('visible');

  const file = e.dataTransfer.files[0];
  if (isVideoFile(file)) {
    attachFile(file);
    btnFile.classList.add('active');
    showToast('Loading video: ' + file.name);
  } else {
    showToast('Please drop a video file');
  }
});

// Also support drop on the whole document as a fallback
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

// ─── Source Buttons ───────────────────────────────────────────────────────────

btnWebcam.addEventListener('click', async () => {
  if (state.sourceType === 'webcam') { stopCurrentSource(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    attachStream(stream, 'webcam');
    btnWebcam.classList.add('active');
  } catch (err) {
    showToast('Webcam denied: ' + err.message);
  }
});

btnScreen.addEventListener('click', async () => {
  if (state.sourceType === 'screen') { stopCurrentSource(); return; }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    attachStream(stream, 'screen');
    btnScreen.classList.add('active');
    stream.getVideoTracks()[0].addEventListener('ended', stopCurrentSource);
  } catch (err) {
    if (err.name !== 'NotAllowedError') showToast('Screen capture error: ' + err.message);
  }
});

btnFile.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (isVideoFile(file)) {
    attachFile(file);
    btnFile.classList.add('active');
    showToast('Loading video: ' + file.name);
  } else if (file) showToast('Choose a supported video file such as MP4 or WebM.');
  fileInput.value = '';
});

// ─── Playback Controls ───────────────────────────────────────────────────────

btnPause.addEventListener('click', togglePause);

function togglePause() {
  if (!state.running && !state.paused) return;
  state.paused = !state.paused;
  iconPause.style.display = state.paused ? 'none'  : '';
  iconPlay.style.display  = state.paused ? ''      : 'none';

  // Show/hide paused badge
  let badge = document.querySelector('.paused-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'paused-badge';
    badge.textContent = 'PAUSED';
    asciiContainer.appendChild(badge);
  }
  badge.classList.toggle('visible', state.paused);

  if (state.paused) {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;
    if (state.videoFrameCallbackId !== null && typeof sourceVideo.cancelVideoFrameCallback === 'function') {
      sourceVideo.cancelVideoFrameCallback(state.videoFrameCallbackId);
      state.videoFrameCallbackId = null;
    }
    sourceVideo.pause();
  } else {
    sourceVideo.play().then(scheduleRender).catch(() => scheduleRender());
  }
}

// ─── Fullscreen ───────────────────────────────────────────────────────────────

btnFullscreen.addEventListener('click', toggleFullscreen);

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    asciiContainer.requestFullscreen().catch(() => {
      document.documentElement.requestFullscreen();
    });
  } else {
    document.exitFullscreen();
  }
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

btnSettings.addEventListener('click', toggleSettings);

function toggleSettings() {
  settingsPanel.classList.toggle('collapsed');
}

// ─── Reset Settings ───────────────────────────────────────────────────────────

btnResetSettings.addEventListener('click', () => {
  applyPreset('classic');
  showToast('Settings reset');
});

// ─── Live slider label updates ────────────────────────────────────────────────

function bindRange(rangeEl, labelEl) {
  if (!rangeEl) return;
  rangeEl.addEventListener('input', () => {
    if (labelEl) labelEl.textContent = rangeEl.value;
    readConfig();
  });
}
bindRange(rangeCols,       valCols);
bindRange(rangeFontSize,   valFontSize);
bindRange(rangeBrightness, valBrightness);
bindRange(rangeContrast,   valContrast);
bindRange(rangeGamma,      valGamma);
bindRange(rangeSaturation, valSaturation);

if (rangeEdgeThreshold) bindRange(rangeEdgeThreshold, valEdgeThreshold);
if (checkAiEdge) checkAiEdge.addEventListener('change', () => readConfig());
if (checkTemporal) checkTemporal.addEventListener('change', () => readConfig());
if (checkAdaptiveContrast) checkAdaptiveContrast.addEventListener('change', () => readConfig());

selectColorMode.addEventListener('change', () => readConfig());
selectCharSet.addEventListener('change', () => {
  if (customCharRow) customCharRow.style.display = selectCharSet.value === 'custom' ? 'block' : 'none';
  readConfig();
});
inputCustomChars?.addEventListener('input', () => readConfig());
checkInvert?.addEventListener('change', () => readConfig());
selectFps.addEventListener('change', () => readConfig());

// ─── Preset buttons ───────────────────────────────────────────────────────────

presetBtns.forEach(btn => {
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
});

// ─── Screenshot Helper (shared) ──────────────────────────────────────────────

function captureAsciiToCanvas() {
  return asciiCanvas;
}

// ─── Export ───────────────────────────────────────────────────────────────────

function getPlainText() {
  return engine.getPlainText();
}

function getStyledHtml() {
  return engine.getStyledHtml({
    colorMode: cfg.colorMode,
    monoColor: state.monoColor,
    fontSize: cfg.fontSize,
  });
}

function fmtBytes(b) {
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  if (b >= 1024*1024*1024) return (b/(1024*1024*1024)).toFixed(1) + ' GB';
  return (b/(1024*1024)).toFixed(1) + ' MB';
}

btnCopy?.addEventListener('click', async () => {
  if (!state.running && !engine._lastCols) { showToast('Start a video source first'); return; }
  showToast('Preparing ASCII copy...');
  try {
    const text = await engine.exportPlainTextAsync();
    if (!text.trim()) { showToast('Nothing to copy'); return; }
    await navigator.clipboard.writeText(text);
    const count = (engine._lastCols * engine._lastRows).toLocaleString();
    showToast(`Copied ${count} characters!`);
  } catch {
    showToast('Copy failed');
  }
});

btnDownloadTxt?.addEventListener('click', async () => {
  if (!state.running && !engine._lastCols) { showToast('Start a video source first'); return; }
  showToast('Exporting text...');
  try {
    const text = await engine.exportPlainTextAsync();
    if (!text.trim()) { showToast('Nothing to export'); return; }
    download('ascili-export.txt', text, 'text/plain;charset=utf-8');
    const count = (engine._lastCols * engine._lastRows).toLocaleString();
    showToast(`Saved ${count} chars as .txt`);
  } catch (error) {
    showToast('Text export failed: ' + error.message);
  }
});

btnDownloadHtml?.addEventListener('click', async () => {
  if (!state.running && !engine._lastCols) { showToast('Start a video source first'); return; }
  showToast('Exporting HTML...');
  try {
    const html = await engine.exportStyledHtmlAsync({
      monoColor: state.monoColor,
      fontSize: cfg.fontSize,
    });
    if (!html.trim()) { showToast('Nothing to export'); return; }
    download('ascili-export.html', html, 'text/html;charset=utf-8');
    showToast('Saved .html');
  } catch (error) {
    showToast('HTML export failed: ' + error.message);
  }
});

btnScreenshot?.addEventListener('click', () => {
  if (!state.running || !asciiCanvas.width || !asciiCanvas.height) { showToast('Nothing to capture'); return; }
  asciiCanvas.toBlob(blob => {
    if (blob) {
      download('ascili-screenshot.png', blob, 'image/png');
      showToast('Screenshot saved');
    } else showToast('Could not create the screenshot. Try again.');
  });
});

function download(filename, content, type) {
  const a    = document.createElement('a');
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const objectUrl = URL.createObjectURL(blob);
  a.href     = objectUrl;
  a.download = filename;
  a.rel      = 'noopener';
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    // Give browsers enough time to start reading larger generated files.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

// ─── Topbar Download Dropdown ─────────────────────────────────────────────────

async function doDownloadTxt() {
  if (!state.running && !engine._lastCols) { showToast('No ASCII to download — start a source first'); return; }
  showToast('Exporting text...');
  try {
    const text = await engine.exportPlainTextAsync();
    if (!text.trim()) { showToast('No ASCII to download'); return; }
    const ts   = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
    download(`ascili-${ts}.txt`, text, 'text/plain;charset=utf-8');
    const count = (engine._lastCols * engine._lastRows).toLocaleString();
    showToast(`Saved ${count} chars as .txt`);
  } catch (error) {
    showToast('Text download failed: ' + error.message);
  }
}

async function doDownloadHtml() {
  if (!state.running && !engine._lastCols) { showToast('No ASCII to download — start a source first'); return; }
  showToast('Exporting HTML...');
  try {
    const html = await engine.exportStyledHtmlAsync({
      monoColor: state.monoColor,
      fontSize: cfg.fontSize,
    });
    if (!html.trim()) { showToast('No ASCII to download'); return; }
    const ts   = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
    download(`ascili-${ts}.html`, html, 'text/html;charset=utf-8');
    showToast('Saved .html');
  } catch (error) {
    showToast('HTML download failed: ' + error.message);
  }
}

function doScreenshot() {
  if (!state.running || !asciiCanvas.width || !asciiCanvas.height) { showToast('No ASCII to capture — start a source first'); return; }
  asciiCanvas.toBlob(blob => {
    if (blob) {
      const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
      download(`ascili-${ts}.png`, blob, 'image/png');
      showToast('Screenshot saved');
    }
  });
}

// Toggle dropdown open/close
btnDownload.addEventListener('click', e => {
  e.stopPropagation();
  const open = dlMenu.classList.toggle('open');
  btnDownload.classList.toggle('open', open);
});

// Prevent menu clicks from bubbling to document click listener
dlMenu.addEventListener('click', e => {
  e.stopPropagation();
});

// Close on outside click
document.addEventListener('click', () => {
  dlMenu.classList.remove('open');
  btnDownload.classList.remove('open');
});

dlTxt.addEventListener('click', () => { doDownloadTxt(); dlMenu.classList.remove('open'); btnDownload.classList.remove('open'); });
dlHtml.addEventListener('click', () => { doDownloadHtml(); dlMenu.classList.remove('open'); btnDownload.classList.remove('open'); });
dlPng.addEventListener('click',  () => { doScreenshot();   dlMenu.classList.remove('open'); btnDownload.classList.remove('open'); });
if (dlRecordVideo) {
  dlRecordVideo.addEventListener('click', () => {
    dlMenu.classList.remove('open');
    btnDownload.classList.remove('open');
    if (liveRecorder.running) {
      stopLiveRecording();
    } else {
      startLiveRecording();
    }
  });
}
dlVideo.addEventListener('click', () => { openConverter(); dlMenu.classList.remove('open'); btnDownload.classList.remove('open'); });

// ─── Video Converter ─────────────────────────────────────────────────────────

const cvOverlay        = $('cvOverlay');
const cvClose          = $('cvClose');
const cvPickFile       = $('cvPickFile');
const cvFileInput      = $('cvFileInput');
const cvFileInfo       = $('cvFileInfo');
const cvMeta           = $('cvMeta');
const cvWarning        = $('cvWarning');
const cvWarningText    = $('cvWarningText');
const cvCfgColor       = $('cvCfgColor');
const cvCfgChars       = $('cvCfgChars');
const cvCfgCols        = $('cvCfgCols');
const cvCfgFont        = $('cvCfgFont');
const cvCfgFmt         = $('cvCfgFmt');
const cvCfgRes         = $('cvCfgRes');
const cvCfgFpsOverride = $('cvCfgFpsOverride');
const cvExportType     = $('cvExportType');
const cvSrtNote        = $('cvSrtNote');
const cvProgressSection = $('cvProgressSection');
const cvError           = $('cvError');
const cvProgressFill   = $('cvProgressFill');
const cvProgressPct    = $('cvProgressPct');
const cvProgressFrames = $('cvProgressFrames');
const cvSpeedBadge     = $('cvSpeedBadge');
const cvProgressTime   = $('cvProgressTime');
const cvProgressEta    = $('cvProgressEta');
const cvPreviewCanvas  = $('cvPreviewCanvas');
const cvDoneSection    = $('cvDoneSection');
const cvDoneMeta       = $('cvDoneMeta');
const cvStart          = $('cvStart');
const cvStop           = $('cvStop');
const cvSave           = $('cvSave');
const cvConvertAnother = $('cvConvertAnother');
const cvDropZone       = $('cvDropZone');

const cvExporter = new AsciliVideoExporter();
const cvSrtExporter = new AsciliSrtExporter();
const SRT_MAX_COLS = 40;
const SRT_TARGET_FPS = 60;
const SRT_SIZE_BUDGET = 950 * 1024 * 1024;

let cvSourceVideo = null;   // hidden video used by the converter
let cvBlob        = null;   // result blob after encoding
let cvMimeType    = '';
let cvFile        = null;
let cvProgressClock = null;
let cvProgressStartedAt = 0;
let cvCurrentProgress = 0;

function fmtTime(s) {
  if (!isFinite(s) || s == null) return '--:--';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function cvUpdateProgressClock() {
  if (!cvProgressStartedAt) return;
  const elapsed = (performance.now() - cvProgressStartedAt) / 1000;
  cvProgressTime.textContent = 'Elapsed: ' + fmtTime(elapsed);
  if (cvCurrentProgress >= 1) {
    cvProgressEta.textContent = 'Finalizing file…';
  } else if (cvCurrentProgress > 0.002) {
    cvProgressEta.textContent = 'ETA: ' + fmtTime(elapsed / cvCurrentProgress * (1 - cvCurrentProgress));
  } else {
    cvProgressEta.textContent = 'ETA: calculating…';
  }
  if (elapsed > 1 && cvCurrentProgress > 0.01 && Number.isFinite(cvSourceVideo?.duration)) {
    const speedMultiplier = cvCurrentProgress * cvSourceVideo.duration / elapsed;
    cvSpeedBadge.textContent = `${speedMultiplier.toFixed(1)}× speed`;
  }
}

function cvStartProgressClock() {
  cvStopProgressClock();
  cvProgressStartedAt = performance.now();
  cvCurrentProgress = 0;
  cvUpdateProgressClock();
  cvProgressClock = window.setInterval(cvUpdateProgressClock, 500);
}

function cvStopProgressClock() {
  if (cvProgressClock !== null) {
    cvUpdateProgressClock();
    window.clearInterval(cvProgressClock);
    cvProgressClock = null;
  }
  cvProgressStartedAt = 0;
}

function estimateVideoBytes(duration, cols, videoWidth, videoHeight, resolution) {
  const res = computeFontForResolution(cols, videoWidth, videoHeight, resolution);
  const fontSize = res?.fontSize ?? cfg.fontSize ?? 10;
  const canvasWidth = res?.outputW ?? Math.ceil(cols * fontSize * 0.601);
  const bitrate = canvasWidth >= 3000 ? 16_000_000 : canvasWidth >= 1500 ? 8_000_000 : 4_000_000;
  return bitrate * duration / 8;
}

function estimateSrtBytes(duration, cols, videoWidth, videoHeight, fps) {
  const srtCols = Math.min(SRT_MAX_COLS, cols);
  const rows = Math.max(1, Math.round(srtCols * (videoHeight / videoWidth) * 0.45));
  const chars = Array.from(cfg.charSet || CHAR_SETS.standard);
  const bytesPerChar = chars.reduce((max, char) => {
    const cp = char.codePointAt(0);
    return Math.max(max, cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4);
  }, 1);
  const cells = srtCols * rows;
  const colorMarkup = cfg.colorMode === 'monochrome' ? rows * 40 : cells * 28;
  const cueBytes = cells * bytesPerChar + colorMarkup + 48;
  return cueBytes * Math.ceil(duration * fps);
}

function chooseSrtCols(duration, requestedCols, videoWidth, videoHeight) {
  const maxCols = Math.min(SRT_MAX_COLS, Math.max(20, Math.round(requestedCols || 80)));
  for (let cols = maxCols; cols >= 20; cols--) {
    if (estimateSrtBytes(duration, cols, videoWidth, videoHeight, SRT_TARGET_FPS) <= SRT_SIZE_BUDGET) return cols;
  }
  return 20;
}

function updateExportModeUI() {
  const useSrt = cvExportType.value === 'srt';
  cvSrtNote.style.display = useSrt ? 'flex' : 'none';
  cvCfgRes.closest('.cv-stat-row').style.display = useSrt ? 'none' : '';
  cvCfgCols.textContent = useSrt
    ? (cvSourceVideo ? `${chooseSrtCols(cvSourceVideo.duration, cfg.cols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight)} cols · 26 FPS` : `up to ${SRT_MAX_COLS} cols · 26 FPS`)
    : `${cfg.cols} cols`;
  cvCfgFmt.textContent = useSrt ? 'SRT text (player-dependent color)' : (detectMime().includes('mp4') ? 'MP4 (H.264)' : 'WebM (VP9)');
  const saveLabel = $('cvSaveLabel');
  if (saveLabel) saveLabel.textContent = useSrt ? 'Download .srt' : 'Download Video';
}

function updateLongVideoWarning() {
  if (!cvSourceVideo || !Number.isFinite(cvSourceVideo.duration) || cvSourceVideo.duration <= 0) {
    cvWarning.style.display = 'none';
    return;
  }
  const duration = cvSourceVideo.duration;
  const srt = cvExportType.value === 'srt';
  const selectedFps = parseInt(cvCfgFpsOverride.value, 10) || 60;
  const fps = srt ? SRT_TARGET_FPS : selectedFps;
  const cols = srt
    ? chooseSrtCols(duration, cfg.cols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight)
    : Math.min(1000, cfg.cols);
  const size = srt
    ? estimateSrtBytes(duration, cols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight, fps)
    : estimateVideoBytes(duration, cols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight, cvCfgRes.value);
  const memoryLimit = (srt ? 96 : 192) * 1024 * 1024;
  const needsDirectFile = size > memoryLimit;
  if (duration <= 300 && !needsDirectFile) {
    cvWarning.style.display = 'none';
    return;
  }
  cvWarning.style.display = 'flex';
  const summary = `${fmtTime(duration)} at ${fps} FPS is about ${Math.ceil(duration * fps).toLocaleString()} frames; estimated output about ${fmtBytes(size)}.`;
  if (needsDirectFile && typeof window.showSaveFilePicker !== 'function') {
    cvWarningText.textContent = `${summary} This export needs direct-to-disk saving. In Brave, open brave://flags/#file-system-access-api, enable “File System Access API”, and relaunch Brave; or use desktop Chrome or Edge.`;
  } else if (needsDirectFile) {
    cvWarningText.textContent = `${summary} It will stream straight to the file you choose, so keep the tab open until export completes.`;
  } else {
    cvWarningText.textContent = `${summary} Choose a file location when export starts and keep the tab open until it completes.`;
  }
}

function charSetLabel(cs) {
  const entry = Object.entries(CHAR_SETS).find(([,v]) => v === cs);
  return entry ? entry[0].charAt(0).toUpperCase() + entry[0].slice(1) : 'Custom';
}

function detectMime() {
  const candidates = [
    'video/mp4;codecs=avc1', 'video/mp4',
    'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm',
  ];
  return candidates.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || 'video/webm';
}

async function chooseVideoFile(mimeType, suggestedName) {
  if (typeof window.showSaveFilePicker !== 'function') return null;
  const extension = suggestedName.slice(suggestedName.lastIndexOf('.'));
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{
        description: 'Rendered video',
        accept: { [mimeType.split(';')[0]]: [extension] },
      }],
    });
    return await handle.createWritable();
  } catch (error) {
    if (error.name === 'AbortError') return false;
    throw error;
  }
}

function drawConverterPreview(videoEl) {
  if (!videoEl?.videoWidth || !cvPreviewCanvas) return;
  const previewCols = Math.min(cfg.cols || 80, 240);
  const previewCfg = { ...cfg, cols: previewCols, fontSize: 4 };
  renderFrameToCanvas(videoEl, cvPreviewCanvas, previewCfg, { fontSize: 4 });
}

function cvRefreshSettings() {
  readConfig();
  cvCfgColor.textContent = cfg.colorMode.toUpperCase();
  cvCfgChars.textContent = charSetLabel(cfg.charSet);
  cvCfgCols.textContent  = cfg.cols + ' cols';
  cvCfgFont.textContent  = cfg.fontSize + 'px';
  const mime = detectMime();
  cvCfgFmt.textContent   = mime.includes('mp4') ? 'MP4 (H.264)' : 'WebM (VP9)';
  cvMimeType = mime;
  updateExportModeUI();
}

cvExportType.addEventListener('change', () => {
  updateExportModeUI();
  updateLongVideoWarning();
});

function cvSetFile(file) {
  cvFile = file;
  const isPlayerFile = Boolean(state.currentFile && state.currentFile === file);

  // If this is the active video already loaded in the main player, populate metadata immediately
  if (isPlayerFile && sourceVideo && sourceVideo.videoWidth && sourceVideo.duration) {
    cvFileInfo.textContent = `${file.name} (Active Video)`;
    cvFileInfo.classList.add('loaded');
    cvMeta.textContent = `${sourceVideo.videoWidth}×${sourceVideo.videoHeight}  ·  ${fmtTime(sourceVideo.duration)}  ·  ${fmtBytes(file.size)}`;
    cvStart.disabled = false;
    drawConverterPreview(sourceVideo);
  }

  if (cvSourceVideo) {
    cvSourceVideo.pause();
    URL.revokeObjectURL(cvSourceVideo.src);
    cvSourceVideo.remove();
  }
  cvSourceVideo = document.createElement('video');
  cvSourceVideo.muted   = true;
  cvSourceVideo.preload = 'auto';
  cvSourceVideo.playsInline = true;
  cvSourceVideo.style.position = 'fixed';
  cvSourceVideo.style.left     = '-9999px';
  cvSourceVideo.style.top      = '-9999px';
  cvSourceVideo.style.width    = '16px';
  cvSourceVideo.style.height   = '16px';
  cvSourceVideo.src     = URL.createObjectURL(file);
  document.body.appendChild(cvSourceVideo);

  cvSourceVideo.addEventListener('loadedmetadata', () => {
    const dur   = cvSourceVideo.duration;
    const vw    = cvSourceVideo.videoWidth;
    const vh    = cvSourceVideo.videoHeight;
    cvFileInfo.textContent = isPlayerFile ? `${file.name} (Active Video)` : file.name;
    cvFileInfo.classList.add('loaded');
    cvMeta.textContent = `${vw}×${vh}  ·  ${fmtTime(dur)}  ·  ${fmtBytes(file.size)}`;

    updateLongVideoWarning();

    cvStart.disabled = cvSourceVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
    if (!cvStart.disabled) drawConverterPreview(cvSourceVideo);
  });

  cvSourceVideo.addEventListener('loadeddata', () => {
    if (cvSourceVideo.videoWidth && cvSourceVideo.videoHeight) {
      cvStart.disabled = false;
      drawConverterPreview(cvSourceVideo);
      updateLongVideoWarning();
    }
  });

  cvSourceVideo.addEventListener('error', () => {
    if (!isPlayerFile) {
      cvFileInfo.textContent = 'Error loading file';
      cvFileInfo.classList.remove('loaded');
      cvMeta.textContent = '';
      cvStart.disabled = true;
    }
  });
  cvSourceVideo.load();
}

[cvCfgRes, cvCfgFpsOverride].forEach(control => {
  control.addEventListener('change', () => {
    updateLongVideoWarning();
  });
});

function cvResetUI() {
  cvStopProgressClock();
  cvProgressSection.style.display = 'none';
  cvDoneSection.style.display     = 'none';
  cvStart.style.display           = '';
  cvStop.style.display            = 'none';
  cvSave.style.display            = 'none';
  cvConvertAnother.style.display  = 'none';
  cvProgressFill.style.width      = '0%';
  cvError.hidden = true;
  cvError.textContent = '';
  cvProgressPct.textContent       = '0%';
  cvProgressTime.textContent      = '';
  cvProgressEta.textContent       = '';
  cvProgressFrames.textContent    = '';
  cvSpeedBadge.textContent        = '';
  cvBlob = null;
}

function cvShowExportError(message) {
  cvStopProgressClock();
  cvProgressSection.style.display = 'block';
  cvError.textContent = `Export failed: ${message || 'The browser could not export this video.'}`;
  cvError.hidden = false;
  cvStop.style.display = 'none';
  cvStart.style.display = '';
  cvStart.disabled = !cvSourceVideo?.videoWidth;
  cvProgressEta.textContent = 'Error';
  showToast('Export failed: ' + (message || 'The browser could not export this video.'));
}

function openConverter() {
  cvResetUI();
  cvRefreshSettings();
  if (state.currentFile) {
    cvSetFile(state.currentFile);
  }
  cvOverlay.classList.add('open');
  cvOverlay.setAttribute('aria-hidden', 'false');
}

cvClose.addEventListener('click', () => {
  if (cvExporter._running || cvSrtExporter._running) {
    if (!confirm('Stop the current conversion?')) return;
    cvExporter._running ? cvExporter.stop() : cvSrtExporter.stop();
  }
  cvStopProgressClock();
  cvOverlay.classList.remove('open');
  cvOverlay.setAttribute('aria-hidden', 'true');
});

cvPickFile.addEventListener('click', () => cvFileInput.click());

cvFileInput.addEventListener('change', () => {
  const f = cvFileInput.files[0];
  if (f) {
    cvResetUI();
    cvRefreshSettings();
    cvSetFile(f);
  }
  cvFileInput.value = '';
});

// Converter drag & drop
cvDropZone.addEventListener('dragover', e => {
  e.preventDefault();
  cvDropZone.classList.add('drag-over');
});
cvDropZone.addEventListener('dragleave', () => {
  cvDropZone.classList.remove('drag-over');
});
cvDropZone.addEventListener('drop', e => {
  e.preventDefault();
  e.stopPropagation();
  cvDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (isVideoFile(file)) {
    cvResetUI();
    cvRefreshSettings();
    cvSetFile(file);
    showToast('Loading video: ' + file.name);
  } else {
    showToast('Please drop a video file');
  }
});

cvStart.addEventListener('click', async () => {
  if (!cvSourceVideo || !cvFile) { showToast('Load a video file first'); return; }
  readConfig();
  updateExportModeUI();
  updateLongVideoWarning();

  const selectedFps = parseInt(cvCfgFpsOverride.value, 10) || 60;
  const resolution = cvCfgRes.value || '1080p';
  const exportType = cvExportType.value;
  const isSrt = exportType === 'srt';
  const duration = (cvSourceVideo.duration && isFinite(cvSourceVideo.duration) && cvSourceVideo.duration > 0)
    ? cvSourceVideo.duration
    : ((sourceVideo && isFinite(sourceVideo.duration) && sourceVideo.duration > 0) ? sourceVideo.duration : 10);
  const targetFps = isSrt ? SRT_TARGET_FPS : selectedFps;
  const exportCols = isSrt
    ? chooseSrtCols(duration, cfg.cols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight)
    : cfg.cols;
  const exportCfg = isSrt ? { ...cfg, cols: exportCols } : cfg;
  const totalFrames = Math.max(1, Math.ceil(duration * targetFps));
  const estimatedOutputBytes = isSrt
    ? estimateSrtBytes(duration, exportCols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight, targetFps)
    : estimateVideoBytes(duration, exportCols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight, resolution);
  const memoryExportLimit = (isSrt ? 96 : 192) * 1024 * 1024;
  if (estimatedOutputBytes > memoryExportLimit && typeof window.showSaveFilePicker !== 'function') {
    cvProgressSection.style.display = 'none';
    cvDoneSection.style.display = 'none';
    cvStart.style.display = '';
    cvStop.style.display = 'none';
    cvWarning.style.display = 'flex';
    cvWarningText.textContent =
      `${fmtBytes(estimatedOutputBytes)} is too large to keep safely in browser memory. In Brave, open brave://flags/#file-system-access-api, enable “File System Access API”, and relaunch Brave. Then retry and choose where to save the file. Alternatively, use desktop Chrome or Edge.`;
    showToast('Enable direct-to-file saving for long video exports');
    return;
  }
  const mimeType = isSrt ? 'text/plain' : detectMime();
  const extension = isSrt ? 'srt' : (mimeType.includes('mp4') ? 'mp4' : 'webm');
  const filename = `ascili-converted-${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.${extension}`;
  let writable = null;
  try {
    writable = await chooseVideoFile(mimeType, filename);
    if (writable === false) return;
  } catch (error) {
    const message = error?.message || String(error);
    const fileWriteDenied = error?.name === 'SecurityError'
      || error?.name === 'NotAllowedError'
      || /createWritable|not allowed by the user agent|current context/i.test(message);
    if (fileWriteDenied && estimatedOutputBytes > memoryExportLimit) {
      cvShowExportError(
        `This browser context blocks direct-to-disk saving. The ${fmtBytes(estimatedOutputBytes)} export was not started because it is too large to safely buffer in memory. Open this page in desktop Chrome or Edge, then retry.`
      );
    } else {
      cvShowExportError('Could not open output file: ' + message);
    }
    return;
  }
  cvProgressSection.style.display = 'block';
  cvError.hidden = true;
  cvError.textContent = '';
  cvDoneSection.style.display     = 'none';
  cvProgressFill.style.width     = '0%';
  cvProgressPct.textContent       = '0%';
  cvProgressFrames.textContent    = `0 / ${totalFrames.toLocaleString()} frames`;
  cvProgressTime.textContent      = 'Elapsed: 00:00';
  cvProgressEta.textContent       = 'ETA: calculating…';
  cvSpeedBadge.textContent        = '';
  cvStart.style.display           = 'none';
  cvStop.style.display            = '';
  cvSave.style.display            = 'none';
  cvConvertAnother.style.display  = 'none';
  cvBlob = null;
  cvStartProgressClock();

  if (isSrt) {
    cvProgressSection.querySelector('.cv-section-label').textContent = 'SRT EXPORT PROGRESS';
    try {
    cvSrtExporter.start(cvSourceVideo, { ...exportCfg, monoColor: state.monoColor }, {
      targetFps,
      writable,
      onProgress(pct, _elapsed, _eta, frameNum, frameTotal) {
        cvCurrentProgress = pct;
        if (frameNum !== frameTotal && frameNum % Math.max(1, Math.floor(targetFps / 2)) !== 0) return;
        cvProgressFrames.textContent = `${frameNum.toLocaleString()} / ${frameTotal.toLocaleString()} frames`;
        cvProgressFill.style.width = (pct * 100).toFixed(1) + '%';
        cvProgressPct.textContent = (pct * 100).toFixed(0) + '%';
        cvUpdateProgressClock();
      },
      onComplete(blob, resultMime, result) {
        cvStopProgressClock();
        cvBlob = blob;
        cvMimeType = resultMime;
        cvStop.style.display = 'none';
        cvSave.style.display = result.savedToDisk ? 'none' : '';
        cvConvertAnother.style.display = '';
        cvProgressFill.style.width = '100%';
        cvProgressPct.textContent = '100%';
        cvProgressEta.textContent = '';
        cvProgressTime.textContent = 'Done';
        cvProgressFrames.textContent = `${totalFrames.toLocaleString()} / ${totalFrames.toLocaleString()} frames`;
        cvProgressSection.querySelector('.cv-section-label').textContent = 'SRT EXPORT COMPLETE';
        cvDoneSection.style.display = 'flex';
        cvDoneMeta.textContent = result.savedToDisk
          ? `Saved to selected file  ·  SRT  ·  ${targetFps} FPS  ·  ${result.cols} cols`
          : `${fmtBytes(blob.size)}  ·  SRT  ·  ${targetFps} FPS  ·  ${result.cols} cols`;
        showToast(result.savedToDisk ? 'SRT saved to file' : 'SRT ready to download');
      },
      onError(message) {
        cvStop.style.display = 'none';
        cvStart.style.display = '';
        cvStart.disabled = false;
        cvProgressEta.textContent = 'Error';
        cvShowExportError(message);
      },
    });
    } catch (error) {
      cvShowExportError(error?.message || error);
    }
    return;
  }

  cvProgressSection.querySelector('.cv-section-label').textContent = 'ENCODING PROGRESS';
  try {
  cvExporter.start(cvSourceVideo, cfg, {
    targetFps,
    resolution,
    writable,
    onProgress(pct) {
      cvCurrentProgress = pct;
      const frameNum = Math.round(pct * totalFrames);
      if (frameNum !== totalFrames && frameNum % Math.max(1, Math.floor(targetFps / 2)) !== 0) return;
      cvProgressFrames.textContent = `${frameNum.toLocaleString()} / ${totalFrames.toLocaleString()} frames`;
      cvProgressFill.style.width  = (pct * 100).toFixed(1) + '%';
      cvProgressPct.textContent   = (pct * 100).toFixed(0) + '%';
      cvUpdateProgressClock();

      // Mirror exporter canvas → visible preview
      const src = cvExporter.canvas;
      if (src.width && src.height && (frameNum % Math.max(1, Math.floor(targetFps / 4)) === 0 || frameNum === totalFrames)) {
        const pCtx = cvPreviewCanvas.getContext('2d');
        pCtx?.drawImage(src, 0, 0, cvPreviewCanvas.width, cvPreviewCanvas.height);
      }
    },
    onComplete(blob, mimeType, result) {
      cvStopProgressClock();
      cvBlob     = blob;
      cvMimeType = mimeType;

      cvStop.style.display           = 'none';
      cvSave.style.display           = result?.savedToDisk ? 'none' : '';
      cvConvertAnother.style.display = '';
      cvProgressFill.style.width     = '100%';
      cvProgressPct.textContent      = '100%';
      cvProgressEta.textContent      = '';
      cvProgressTime.textContent     = 'Done';
      cvProgressFrames.textContent   = `${totalFrames.toLocaleString()} / ${totalFrames.toLocaleString()} frames`;

      cvDoneSection.style.display = 'flex';
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      cvDoneMeta.textContent = result?.savedToDisk
        ? `Saved to selected file  ·  ${ext.toUpperCase()}  ·  ${resolution.toUpperCase()}  ·  ${targetFps} FPS  ·  ${cfg.cols} cols`
        : `${fmtBytes(blob.size)}  ·  ${ext.toUpperCase()}  ·  ${resolution.toUpperCase()}  ·  ${targetFps} FPS  ·  ${cfg.cols} cols`;
      showToast(result?.savedToDisk ? 'Conversion saved to file' : 'Conversion ready to download');
    },
    onError(msg) {
      cvStop.style.display  = 'none';
      cvStart.style.display = '';
      cvStart.disabled = false;
      cvProgressEta.textContent = 'Error';
      cvShowExportError(msg);
    },
  });
  } catch (error) {
    cvShowExportError(error?.message || error);
  }
});

cvStop.addEventListener('click', () => {
  cvExporter._running ? cvExporter.stop() : cvSrtExporter.stop();
  cvStopProgressClock();
  cvStop.style.display  = 'none';
  cvStart.style.display = '';
  cvProgressEta.textContent = 'Stopped';
  showToast('Conversion stopped');
});

cvSave.addEventListener('click', () => {
  if (!cvBlob) return;
  const ext = cvMimeType.includes('subrip') ? 'srt' : (cvMimeType.includes('mp4') ? 'mp4' : 'webm');
  const ts  = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
  try {
    download(`ascili-${ts}.${ext}`, cvBlob, cvMimeType);
    showToast(ext === 'srt' ? 'SRT saved' : 'Video saved');
  } catch (error) {
    cvShowExportError(error?.message || error);
  }
});

cvConvertAnother.addEventListener('click', () => {
  cvResetUI();
  cvFile = null;
  cvSourceVideo = null;
  cvFileInfo.textContent = 'No file loaded';
  cvFileInfo.classList.remove('loaded');
  cvMeta.textContent = '';
  cvWarning.style.display = 'none';
  cvStart.disabled = true;
});

// Close on backdrop click
cvOverlay.addEventListener('click', e => {
  if (e.target === cvOverlay) {
    if (cvExporter._running || cvSrtExporter._running) {
      if (!confirm('Stop the current conversion?')) return;
      cvExporter._running ? cvExporter.stop() : cvSrtExporter.stop();
    }
    cvStopProgressClock();
    cvOverlay.classList.remove('open');
    cvOverlay.setAttribute('aria-hidden', 'true');
  }
});

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  // Ignore when focus is inside a text input or select
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  // Escape closes the converter modal
  if (e.key === 'Escape') {
    if (cvOverlay.classList.contains('open')) {
      if (cvExporter._running || cvSrtExporter._running) {
        if (!confirm('Stop the current conversion?')) return;
        cvExporter._running ? cvExporter.stop() : cvSrtExporter.stop();
      }
      cvStopProgressClock();
      cvOverlay.classList.remove('open');
      cvOverlay.setAttribute('aria-hidden', 'true');
    }
    return;
  }

  // Block background shortcuts when modal is open
  if (cvOverlay.classList.contains('open')) return;

  switch (e.key) {
    case 'f': case 'F':
      e.preventDefault(); toggleFullscreen(); break;
    case ' ':
      e.preventDefault(); togglePause(); break;
    case 's': case 'S':
      e.preventDefault(); toggleSettings(); break;
    case 'c': case 'C':
      e.preventDefault(); btnCopy?.click(); break;
    case 'r': case 'R':
      e.preventDefault(); applyPreset('classic'); showToast('Settings reset'); break;
    case 'v': case 'V':
      e.preventDefault();
      if (liveRecorder.running) stopLiveRecording();
      else startLiveRecording();
      break;
    case 'g': case 'G':
      e.preventDefault(); toggleScanlines(); break;
    case '1': applyPreset('classic');   break;
    case '2': applyPreset('matrix');    break;
    case '3': applyPreset('truecolor'); break;
    case '4': applyPreset('braille');   break;
    case '5': applyPreset('blocks');    break;
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

applyPreset('classic');
readConfig();
