import { AsciliEngine, CHAR_SETS } from './engine.js';
import { AsciliVideoExporter, AsciliSrtExporter, AsciliLiveRecorder, AsciliGifRecorder, AsciliGifVideoExporter, renderFrameToCanvas, computeFontForResolution, CHAR_W_FACTOR } from './exporter.js';
import { AsciliGifEncoder } from './gif-encoder.js';
import { StudioController } from './studio/studio-controller.js';

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
const btnCopyAscii  = $('btnCopyAscii');
const btnMirror     = $('btnMirror');
const btnSettings   = $('btnSettings');
const btnScanlines  = $('btnScanlines');
const btnResetSettings = $('btnResetSettings');
const btnCopy       = $('btnCopy');
const btnDownloadTxt  = $('btnDownloadTxt');
const btnDownloadHtml = $('btnDownloadHtml');
const btnScreenshot = $('btnScreenshot');
const btnOpenExportModal = $('btnOpenExportModal');
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

// Color swatches & custom color picker
const colorSwatchRow = $('colorSwatchRow');
const colorSwatches  = document.querySelectorAll('.color-swatch');
const inputCustomColor = $('inputCustomColor');

// Scanlines toggle in settings
const checkScanlines = $('checkScanlines');

// Topbar download dropdown
const btnDownload   = $('btnDownload');
const dlMenu        = $('dlMenu');
const dlTxt         = $('dlTxt');
const dlHtml        = $('dlHtml');
const dlPng         = $('dlPng');
const dlCopyFrame   = $('dlCopyFrame');
const dlRecordGif   = $('dlRecordGif');
const dlGifLabel    = $('dlGifLabel');
const dlRecordVideo = $('dlRecordVideo');
const dlRecordLabel = $('dlRecordLabel');
const dlVideo       = $('dlVideo');

// Settings inputs
const selectColorMode   = $('selectColorMode');
const selectCharSet     = $('selectCharSet');
const customCharRow     = $('customCharRow');
const rowCustomCharset  = $('rowCustomCharset');
const inputCustomCharset = $('inputCustomCharset');
const valCustomChars    = $('valCustomChars');
const selectDithering   = $('selectDithering');
const selectAspectRatio = $('selectAspectRatio');
const chkMirror         = $('chkMirror');
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
  dithering:   'none',
  aspectRatio: 'auto',
  mirror:      false,
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
  cfg.fps         = Math.min(120, Math.max(1, parseFloat(selectFps?.value) || 60));
  cfg.dithering   = selectDithering?.value || 'none';
  cfg.aspectRatio = selectAspectRatio?.value || 'auto';
  cfg.mirror      = chkMirror?.checked ?? false;

  if (btnMirror) {
    btnMirror.classList.toggle('active', cfg.mirror);
  }

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
    const customText = inputCustomCharset?.value || inputCustomChars?.value || ' .:-=+*#%@';
    CHAR_SETS.custom = customText;
    cfg.charSet = customText;
    if (valCustomChars) valCustomChars.textContent = `${customText.length} chars`;
  } else {
    cfg.charSet = CHAR_SETS[cs] || CHAR_SETS.standard;
  }

  if (rowCustomCharset) rowCustomCharset.style.display = cs === 'custom' ? 'block' : 'none';
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
  if (selectFps) selectFps.value = String(p.fps);
  if (rangeBrightness) rangeBrightness.value = p.brightness + (legacyCenteredSliders ? 100 : 0);
  if (valBrightness) valBrightness.textContent = p.brightness;
  if (rangeContrast) rangeContrast.value = p.contrast + (legacyCenteredSliders ? 100 : 0);
  if (valContrast) valContrast.textContent = p.contrast;
  if (rangeGamma) rangeGamma.value = p.gamma + (legacyCenteredSliders ? 100 : 0);
  if (valGamma) valGamma.textContent = p.gamma;
  if (rangeSaturation) rangeSaturation.value = p.saturation;
  if (valSaturation) valSaturation.textContent = p.saturation;

  if (selectDithering) selectDithering.value = 'none';
  if (selectAspectRatio) selectAspectRatio.value = 'auto';
  if (chkMirror) chkMirror.checked = false;
  if (btnMirror) btnMirror.classList.remove('active');
  if (rowCustomCharset) rowCustomCharset.style.display = 'none';

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
    if (inputCustomColor) inputCustomColor.value = state.monoColor;
    // Update CSS variable for engine use
    document.documentElement.style.setProperty('--green', state.monoColor);
    readConfig();
    showToast('Color: ' + swatch.title);
  });
});

if (inputCustomColor) {
  inputCustomColor.addEventListener('input', e => {
    state.monoColor = e.target.value;
    colorSwatches.forEach(s => s.classList.remove('active'));
    document.documentElement.style.setProperty('--green', state.monoColor);
    readConfig();
  });
}

// ─── Settings Controls Listeners ─────────────────────────────────────────────

selectColorMode?.addEventListener('change', () => readConfig());
selectCharSet?.addEventListener('change', () => readConfig());
inputCustomCharset?.addEventListener('input', () => {
  if (selectCharSet?.value === 'custom') {
    readConfig();
  }
});
selectDithering?.addEventListener('change', () => {
  readConfig();
  showToast('Dithering: ' + (selectDithering.selectedOptions[0]?.text || selectDithering.value));
});
selectAspectRatio?.addEventListener('change', () => {
  readConfig();
  showToast('Aspect Ratio: ' + (selectAspectRatio.selectedOptions[0]?.text || selectAspectRatio.value));
});
chkMirror?.addEventListener('change', () => {
  readConfig();
  showToast(cfg.mirror ? 'Mirror feed: ON' : 'Mirror feed: OFF');
});
btnMirror?.addEventListener('click', () => {
  if (chkMirror) {
    chkMirror.checked = !chkMirror.checked;
  } else {
    cfg.mirror = !cfg.mirror;
  }
  readConfig();
  showToast(cfg.mirror ? 'Mirror feed: ON' : 'Mirror feed: OFF');
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
let liveTemporaryExport = null;

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
  const recordExtension = dlRecordVideo?.querySelector('.dl-ext');
  if (recordExtension) recordExtension.textContent = `.${extension}`;
  const filename = `ascili-rec-${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.${extension}`;
  let writable = null;
  let temporaryExport = null;

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      writable = await chooseVideoFile(mimeType, filename);
      if (writable === false) return;
    } catch {
      writable = null;
    }
  }

  if (!writable) {
    temporaryExport = await createTemporaryExportFile(filename, mimeType, 0);
    if (temporaryExport) writable = temporaryExport.writable;
  }

  const targetResolution = cvCfgRes?.value || '1440p';
  liveRecorder.startRecording(cfg, {
    targetFps: cfg.fps || 60,
    resolution: targetResolution,
    videoWidth:  sourceVideo.videoWidth  || 640,
    videoHeight: sourceVideo.videoHeight || 480,
    writable,
    onComplete(blob, mimeType, result) {
      if (temporaryExport) {
        temporaryExport.prepareDownload().then(() => {
          liveTemporaryExport = temporaryExport;
          updateRecUI(false);
          showToast('Recording ready; choose Download Recorded Video to save it');
        }).catch(error => {
          temporaryExport.discard();
          showToast('Could not prepare the recording download: ' + error.message);
          updateRecUI(false);
        });
      } else if (result?.savedToDisk) {
        showToast('Recording saved to the selected file');
        updateRecUI(false);
      } else if (blob) {
        download(filename, blob, mimeType);
        showToast('Recording saved — ' + fmtBytes(blob.size));
        updateRecUI(false);
      }
    },
    onError(msg) {
      temporaryExport?.discard();
      if (temporaryExport === liveTemporaryExport) liveTemporaryExport = null;
      showToast('Recording error: ' + msg);
      updateRecUI(false);
    },
  });

  if (!liveRecorder.running) return;
  updateRecUI(true);
  const resLabel = targetResolution.toUpperCase();
  showToast(temporaryExport
    ? `Recording limitless ${resLabel} video; click Stop & Download when done`
    : writable
    ? `Recording limitless ${resLabel} video to selected file`
    : `Recording limitless ${resLabel} video`);
}

function stopLiveRecording() {
  liveRecorder.stopRecording();
}

function updateRecUI(isRecording) {
  btnRecord.classList.toggle('recording', isRecording);
  recIndicator.classList.toggle('visible', isRecording);

  if (dlRecordVideo) {
    dlRecordVideo.classList.toggle('recording', isRecording);
    if (dlRecordLabel) {
      dlRecordLabel.textContent = isRecording
        ? 'Stop & Download Video'
        : liveTemporaryExport ? 'Download Recorded Video' : 'Record Rendered Video';
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

async function handleLiveRecordAction() {
  if (liveTemporaryExport) {
    try {
      liveTemporaryExport.download();
      liveTemporaryExport = null;
      updateRecUI(false);
      showToast('Recording download started');
    } catch (error) {
      showToast('Could not download recording: ' + error.message);
    }
    return;
  }
  if (liveRecorder.running) {
    stopLiveRecording();
  } else {
    await startLiveRecording();
  }
}

btnRecord.addEventListener('click', () => {
  handleLiveRecordAction();
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

  if (!sourceVideo.videoWidth || (sourceVideo instanceof HTMLMediaElement && sourceVideo.readyState < 2)) {
    return;
  }

  const targetCols = Math.max(20, Math.floor(cfg.cols * state.qualityScale));
  const expectedRows = Math.max(1, Math.round(targetCols * (sourceVideo.videoHeight / sourceVideo.videoWidth) * 0.45));

  const t0 = performance.now();
  const dims = engine.renderFrame(sourceVideo, asciiCanvas, {
    ...cfg,
    cols: targetCols,
    rows: expectedRows,
    monoColor: state.monoColor,
    scanlines: state.scanlinesOn,
  });
  if (dims.rendered === false) {
    state.consecutiveFailedFrames = (state.consecutiveFailedFrames || 0) + 1;
    if (state.consecutiveFailedFrames > 30 && !state.renderWarningShown) {
      showToast('This device could not render this grid size. Reduce columns.');
      state.renderWarningShown = true;
    }
    return;
  }
  state.consecutiveFailedFrames = 0;
  state.renderWarningShown = false;
  updateAsciiLayout(dims.rows, dims.cols);
  const latency = performance.now() - t0;
  const performanceStats = engine.getPerformanceStats();
  const measuredRenderMs = performanceStats.gpuTimeMs ?? performanceStats.workerTimeMs ?? latency;
  adaptRenderQuality(measuredRenderMs, interval);

  // If live recording is active, capture this frame
  if (liveRecorder.running) {
    liveRecorder.captureFrame(sourceVideo, cfg);
  }
  if (liveGifRecorder.running) {
    const finishedGifBlob = liveGifRecorder.captureFrame(asciiCanvas);
    if (finishedGifBlob) {
      finishGifRecording(finishedGifBlob);
    }
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
selectFps?.addEventListener('change', () => readConfig());
selectFps?.addEventListener('input', () => readConfig());

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

async function copyAsciiFrameToClipboard() {
  if (!state.running && !engine._lastCols) { showToast('Start a video source first'); return; }
  showToast('Preparing ASCII copy...');
  try {
    const text = await engine.exportPlainTextAsync();
    if (!text || !text.trim()) { showToast('Nothing to copy'); return; }
    await navigator.clipboard.writeText(text);
    const count = (engine._lastCols * engine._lastRows).toLocaleString();
    showToast(`Copied ${count} characters!`);
    if (btnCopyAscii) {
      btnCopyAscii.classList.add('copied');
      setTimeout(() => btnCopyAscii.classList.remove('copied'), 1500);
    }
  } catch (err) {
    showToast('Copy failed: ' + (err?.message || 'Clipboard access denied'));
  }
}

btnCopy?.addEventListener('click', copyAsciiFrameToClipboard);
btnCopyAscii?.addEventListener('click', copyAsciiFrameToClipboard);

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

// ─── Live GIF Recording ──────────────────────────────────────────────────────

const liveGifRecorder = new AsciliGifRecorder();

function toggleGifRecording() {
  if (!state.running) {
    showToast('Start a video source first');
    return;
  }
  if (liveGifRecorder.running) {
    showToast('Finishing GIF encoding...');
    const blob = liveGifRecorder.stop();
    finishGifRecording(blob);
    return;
  }

  const targetW = Math.min(480, Math.max(160, asciiCanvas.width || 480));
  const targetH = Math.min(480, Math.max(120, Math.round(targetW * ((asciiCanvas.height || 360) / (asciiCanvas.width || 480)))));

  liveGifRecorder.startRecording(targetW, targetH, {
    delayMs: 100, // 10 fps
    maxFrames: 40,
    onProgress(pct, frames, total) {
      if (dlGifLabel) dlGifLabel.textContent = `Recording GIF (${Math.round(pct * 100)}%)`;
    },
  });

  if (dlRecordGif) dlRecordGif.classList.add('recording');
  if (dlGifLabel) dlGifLabel.textContent = 'Recording GIF (0%)';
  showToast('Recording 4s animated GIF...');
}

function finishGifRecording(blob) {
  if (dlRecordGif) dlRecordGif.classList.remove('recording');
  if (dlGifLabel) dlGifLabel.textContent = 'Record Animated GIF';
  if (!blob) {
    showToast('GIF recording cancelled or empty');
    return;
  }
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  download(`ascili-${ts}.gif`, blob, 'image/gif');
  showToast(`GIF saved — ${fmtBytes(blob.size)}`);
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
dlCopyFrame?.addEventListener('click', () => {
  dlMenu.classList.remove('open');
  btnDownload.classList.remove('open');
  copyAsciiFrameToClipboard();
});
dlRecordGif?.addEventListener('click', () => {
  dlMenu.classList.remove('open');
  btnDownload.classList.remove('open');
  toggleGifRecording();
});
if (dlRecordVideo) {
  dlRecordVideo.addEventListener('click', () => {
    dlMenu.classList.remove('open');
    btnDownload.classList.remove('open');
    handleLiveRecordAction();
  });
}
dlVideo.addEventListener('click', () => { openConverter(); dlMenu.classList.remove('open'); btnDownload.classList.remove('open'); });
btnOpenExportModal?.addEventListener('click', () => { openConverter(); });

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
const cvPreviewSection  = $('cvPreviewSection');
const cvPreviewBadge    = $('cvPreviewBadge');
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
const cvGifExporter = new AsciliGifVideoExporter();
const SRT_MAX_COLS = 40;
const SRT_DEFAULT_FPS = 15;
const SRT_SIZE_BUDGET = 950 * 1024 * 1024;

let cvSourceVideo = null;   // hidden video used by the converter
let cvBlob        = null;   // result blob after encoding
let cvMimeType    = '';
let cvFile        = null;
let cvTemporaryExport = null;
let cvProgressClock = null;
let cvProgressStartedAt = 0;
let cvCurrentProgress = 0;
let lastPreviewDraw = 0;

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
  const bitrate = canvasWidth >= 2400 ? 16_000_000 : canvasWidth >= 1500 ? 8_000_000 : 4_000_000;
  return bitrate * duration / 8;
}

function estimateSrtBytes(duration, cols, videoWidth, videoHeight, fps, format = 'srt') {
  const isYtt = format === 'ytt';
  const isYoutube = format === 'youtube';
  const isAss = format === 'ass';
  const maxLimit = isAss ? 160 : isYtt ? 100 : isYoutube ? 32 : SRT_MAX_COLS;
  const srtCols = Math.min(maxLimit, cols || 80);
  const vw = videoWidth || 640;
  const vh = videoHeight || 480;
  const rows = isYoutube ? 4 : Math.max(1, Math.round(srtCols * (vh / vw) * 0.45));
  const chars = Array.from(cfg.charSet || CHAR_SETS.standard);
  const bytesPerChar = chars.reduce((max, char) => {
    const cp = char.codePointAt(0);
    return Math.max(max, cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4);
  }, 1);
  const cells = srtCols * rows;
  const colorMarkup = (isAss || isYoutube || isYtt)
    ? (cfg.colorMode === 'monochrome' || isYoutube ? 0 : cells * 15)
    : (cfg.colorMode === 'monochrome' ? rows * 40 : cells * 28);
  const cueBytes = cells * bytesPerChar + colorMarkup + (isAss || isYtt ? 50 : 48);
  const totalRaw = cueBytes * Math.ceil(duration * fps);
  if (isYtt) {
    return Math.min(20 * 1024 * 1024, totalRaw);
  }
  return totalRaw;
}

function chooseSrtCols(duration, requestedCols, videoWidth, videoHeight, fps = 15, format = 'srt') {
  const isYtt = format === 'ytt';
  if (isYtt) {
    return requestedCols ? Math.min(100, Math.max(20, Math.round(requestedCols))) : 80;
  }
  const isYoutube = format === 'youtube';
  if (isYoutube) return Math.min(32, Math.max(16, requestedCols && requestedCols < 32 ? requestedCols : 30));
  const isAss = format === 'ass';
  const maxLimit = isAss ? 160 : SRT_MAX_COLS;
  const defaultCols = isAss ? 160 : 80;
  const effectiveRequested = isAss
    ? (requestedCols === 80 || !requestedCols ? 160 : Math.min(160, requestedCols))
    : requestedCols;
  const maxCols = Math.min(maxLimit, Math.max(20, Math.round(effectiveRequested || defaultCols)));
  for (let cols = maxCols; cols >= 20; cols--) {
    if (estimateSrtBytes(duration, cols, videoWidth, videoHeight, fps, format) <= SRT_SIZE_BUDGET) return cols;
  }
  return 20;
}

function updateExportModeUI() {
  const exportType = cvExportType.value;
  const isGif = exportType === 'gif';
  const isSubtitle = exportType === 'srt' || exportType === 'vtt' || exportType === 'ass' || exportType === 'youtube' || exportType === 'ytt';
  const isYtt = exportType === 'ytt';
  const isYoutube = exportType === 'youtube';
  const isAss = exportType === 'ass';
  const isVtt = exportType === 'vtt' || isYoutube;
  const isSrt = exportType === 'srt';
  cvSrtNote.style.display = isSubtitle ? 'flex' : 'none';
  const selectedFps = parseFloat(cvCfgFpsOverride.value) || (isYtt ? 24 : isYoutube ? 2 : isGif ? 10 : isSubtitle ? 15 : 60);
  const colorLabel = cfg.colorMode === 'monochrome'
    ? 'monochrome'
    : (cfg.colorMode === 'grayscale' ? 'grayscale' : cfg.colorMode === 'ansi16' ? '16 colors' : cfg.colorMode === 'ansi256' ? '256 colors' : 'color');
  if (cvSrtNote) {
    const speedMult = selectedFps <= 15 ? 3.0 : selectedFps <= 30 ? 2.5 : 2.0;
    cvSrtNote.textContent = isYtt
      ? `YouTube Timed Text (.ytt) uses native YouTube XML supporting full 80/100 cols, monospace font, ${colorLabel}, 24 FPS animation, and strict 20 MB size ceiling.`
      : isYoutube
      ? `YouTube Captions (.vtt) produces crash-proof 30-col × 4-row plain text at 2 FPS optimized for YouTube Studio limits.`
      : isAss
      ? `Advanced SubStation Alpha (.ass) supports 160 cols with 9px font and ${speedMult.toFixed(1)}× accelerated playback.`
      : isVtt
      ? `WebVTT (.vtt) encodes ASCII frames as web-standard cues with ${speedMult.toFixed(1)}× accelerated playback.`
      : `SRT (.srt) encodes ASCII frames as styled cues for VLC & desktop players with ${speedMult.toFixed(1)}× accelerated playback.`;
  }
  cvCfgRes.closest('.cv-stat-row').style.display = (isSubtitle || isGif) ? 'none' : '';
  const cols = isSubtitle
    ? (cvSourceVideo
      ? chooseSrtCols(cvSourceVideo.duration, cfg.cols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight, selectedFps, exportType)
      : (isYtt ? 80 : isYoutube ? 30 : isAss ? 160 : Math.min(SRT_MAX_COLS, cfg.cols || 40)))
    : isGif
    ? Math.min(cfg.cols || 80, 100)
    : cfg.cols;
  cvCfgCols.textContent = isSubtitle
    ? `${cols} cols · ${selectedFps} FPS${isYtt ? ` · ${colorLabel} · max 20MB · font ${cfg.fontSize || 1}` : isYoutube ? ' · plain text' : isAss ? ' · 9px font' : ''}`
    : isGif
    ? `${cols} cols · ${selectedFps} FPS`
    : `${cfg.cols} cols`;
  cvCfgFmt.textContent = isYtt
    ? 'YouTube Timed Text (.ytt) XML'
    : isYoutube
    ? 'YouTube Captions (.vtt) text'
    : isAss
    ? 'Advanced SubStation Alpha (.ass) text'
    : isVtt
    ? 'WebVTT (.vtt) text'
    : isSrt
    ? 'SRT (.srt) text'
    : isGif
    ? 'Animated GIF (.gif)'
    : (detectMime().includes('mp4') ? 'MP4 (H.264)' : 'WebM (VP9)');
  const saveLabel = $('cvSaveLabel');
  if (saveLabel) saveLabel.textContent = isYtt ? `Download .ytt (${selectedFps} FPS)` : isYoutube ? 'Download YouTube .vtt' : isAss ? 'Download .ass' : isVtt ? 'Download .vtt' : isSrt ? 'Download .srt' : isGif ? 'Download Animated GIF' : 'Download Video';
}

function updateLongVideoWarning() {
  if (!cvSourceVideo || !Number.isFinite(cvSourceVideo.duration) || cvSourceVideo.duration <= 0) {
    cvWarning.style.display = 'none';
    return;
  }
  const duration = cvSourceVideo.duration;
  const exportType = cvExportType.value;
  const isGif = exportType === 'gif';
  const isSubtitle = exportType === 'srt' || exportType === 'vtt' || exportType === 'ass' || exportType === 'youtube' || exportType === 'ytt';
  const isYtt = exportType === 'ytt';
  const isYoutube = exportType === 'youtube';
  const selectedFps = parseFloat(cvCfgFpsOverride.value) || (isYtt ? 24 : isYoutube ? 2 : isGif ? 10 : isSubtitle ? 15 : 60);
  const fps = selectedFps;
  const cols = isSubtitle
    ? chooseSrtCols(duration, cfg.cols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight, fps, exportType)
    : isGif
    ? Math.min(cfg.cols || 80, 100)
    : Math.min(1000, cfg.cols);
  const size = isGif
    ? Math.min(50 * 1024 * 1024, Math.round(duration * Math.min(20, fps) * 45000))
    : isSubtitle
    ? estimateSrtBytes(duration, cols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight, fps, exportType)
    : estimateVideoBytes(duration, cols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight, cvCfgRes.value);
  cvWarning.style.display = 'flex';
  const summary = `${fmtTime(duration)} at ${fps} FPS is about ${Math.ceil(duration * fps).toLocaleString()} frames; estimated output about ${fmtBytes(size)}.`;
  const speedMult = fps <= 15 ? 2.0 : fps <= 30 ? 1.5 : 1.0;
  const estRenderTime = fmtTime(duration / speedMult);
  const speedNote = isSubtitle ? ` ${speedMult.toFixed(1)}× accelerated conversion active (finishes in ~${estRenderTime}).` : '';
  cvWarningText.textContent = `${summary}${speedNote} Keep tab open during conversion.`;
}

function charSetLabel(cs) {
  const entry = Object.entries(CHAR_SETS).find(([,v]) => v === cs);
  return entry ? entry[0].charAt(0).toUpperCase() + entry[0].slice(1) : 'Custom';
}

function detectMime() {
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
  return candidates.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || 'video/webm';
}

async function chooseVideoFile(mimeType, suggestedName) {
  if (typeof window.showSaveFilePicker !== 'function') return null;
  const extension = suggestedName.slice(suggestedName.lastIndexOf('.'));
  const isYtt = extension === '.ytt';
  const isAss = extension === '.ass';
  const isVtt = extension === '.vtt';
  const isSrt = extension === '.srt';
  const desc = isYtt
    ? 'YouTube Timed Text Subtitles (.ytt)'
    : suggestedName.includes('youtube')
    ? 'YouTube Captions (.vtt)'
    : isAss
    ? 'Advanced SubStation Alpha Subtitles (.ass)'
    : isVtt
    ? 'WebVTT Subtitles (.vtt)'
    : isSrt
    ? 'SubRip Subtitles (.srt)'
    : 'Rendered video';
  const acceptMap = isYtt
    ? { 'application/octet-stream': ['.ytt'], 'text/plain': ['.ytt', '.txt'] }
    : isAss
    ? { 'text/plain': ['.ass', '.txt'], 'text/x-ssa': ['.ass', '.ssa'] }
    : isVtt
    ? { 'text/vtt': ['.vtt'], 'text/plain': ['.vtt', '.txt'] }
    : isSrt
    ? { 'text/plain': ['.srt', '.txt'], 'application/x-subrip': ['.srt'] }
    : { [mimeType.split(';')[0]]: [extension] };

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{
        description: desc,
        accept: acceptMap,
      }],
    });
    return await handle.createWritable();
  } catch (error) {
    if (error.name === 'AbortError') return false;
    return null;
  }
}

async function createTemporaryExportFile(suggestedName, mimeType, expectedBytes = 0) {
  if (navigator.storage?.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      const tempName = `.ascili-${Date.now()}-${suggestedName}`;
      const handle = await root.getFileHandle(tempName, { create: true });
      const stream = await handle.createWritable();
      let closed = false;
      let downloadFile = null;
      let downloadStarted = false;
      const cleanup = () => root.removeEntry(tempName).catch(() => {});
      return {
        writable: {
          write: chunk => stream.write(chunk),
          close: async () => { await stream.close(); closed = true; },
          abort: async () => {
            try { if (!closed) await stream.abort(); } finally { await cleanup(); }
          },
        },
        async prepareDownload() {
          if (!closed) throw new Error('Temporary export file is not ready yet.');
          downloadFile = await handle.getFile();
        },
        download() {
          if (!downloadFile) throw new Error('Temporary export file is not ready to download.');
          download(suggestedName, downloadFile, mimeType);
          downloadStarted = true;
          window.setTimeout(cleanup, 60 * 60 * 1000);
        },
        cleanup,
        discard() {
          if (!downloadStarted) return cleanup();
        },
      };
    } catch {
      // Fallback
    }
  }

  // Resilient fallback: streaming chunk store
  const chunks = [];
  let closed = false;
  let finalBlob = null;
  let downloadStarted = false;
  return {
    writable: {
      write: chunk => { chunks.push(chunk); return Promise.resolve(); },
      close: () => {
        closed = true;
        finalBlob = new Blob(chunks, { type: mimeType });
        return Promise.resolve();
      },
      abort: () => { chunks.length = 0; return Promise.resolve(); },
    },
    async prepareDownload() {
      if (!closed) throw new Error('Export is not ready yet.');
      if (!finalBlob) finalBlob = new Blob(chunks, { type: mimeType });
    },
    download() {
      if (!finalBlob) throw new Error('Export is not ready to download.');
      download(suggestedName, finalBlob, mimeType);
      downloadStarted = true;
      chunks.length = 0;
    },
    cleanup() { chunks.length = 0; },
    discard() { chunks.length = 0; },
  };
}

function drawConverterPreview(videoEl, overrideCfg = null) {
  try {
    if (!videoEl || !cvPreviewCanvas) return;
    const vw = videoEl.videoWidth || videoEl.width;
    const vh = videoEl.videoHeight || videoEl.height;
    if (!vw || !vh) return;

    const baseCfg = overrideCfg || cfg;
    const previewCols = Math.min(baseCfg.cols || 80, 240);
    const charWFactor = (typeof CHAR_W_FACTOR === 'number' && CHAR_W_FACTOR > 0) ? CHAR_W_FACTOR : 0.601;
    const previewFontSize = Math.max(6, Math.min(12, Math.round(540 / (previewCols * charWFactor))));
    const previewCfg = { ...baseCfg, cols: previewCols, fontSize: previewFontSize };
    renderFrameToCanvas(videoEl, cvPreviewCanvas, previewCfg, { fontSize: previewFontSize });
  } catch (err) {
    console.warn('drawConverterPreview error:', err);
  }
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
  if (cvCfgFpsOverride && cfg.fps) {
    const fpsVal = String(cfg.fps);
    const hasOption = Array.from(cvCfgFpsOverride.options).some(o => o.value === fpsVal);
    if (hasOption) {
      cvCfgFpsOverride.value = fpsVal;
    }
  }
  updateExportModeUI();
}

cvExportType.addEventListener('change', () => {
  const isSubtitle = cvExportType.value === 'srt' || cvExportType.value === 'vtt' || cvExportType.value === 'ass' || cvExportType.value === 'youtube' || cvExportType.value === 'ytt';
  if (cvExportType.value === 'ytt') {
    cvCfgFpsOverride.value = '24';
  } else if (cvExportType.value === 'youtube') {
    cvCfgFpsOverride.value = '2';
  } else if (cvExportType.value === 'gif') {
    cvCfgFpsOverride.value = '15';
  } else if (isSubtitle && (cvCfgFpsOverride.value === '60' || cvCfgFpsOverride.value === '2')) {
    cvCfgFpsOverride.value = '24';
  }
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
    if (cvPreviewSection) cvPreviewSection.style.display = 'block';
    drawConverterPreview(sourceVideo);
  }

  if (cvSourceVideo) {
    cvSourceVideo.pause();
    URL.revokeObjectURL(cvSourceVideo.src);
    cvSourceVideo.remove();
  }
  cvSourceVideo = document.createElement('video');
  cvSourceVideo.muted   = true;
  cvSourceVideo.defaultMuted = true;
  cvSourceVideo.setAttribute('muted', '');
  cvSourceVideo.setAttribute('playsinline', '');
  cvSourceVideo.preload = 'auto';
  cvSourceVideo.playsInline = true;
  cvSourceVideo.style.position = 'fixed';
  cvSourceVideo.style.bottom   = '0px';
  cvSourceVideo.style.right    = '0px';
  cvSourceVideo.style.width    = '4px';
  cvSourceVideo.style.height   = '4px';
  cvSourceVideo.style.opacity  = '0.99';
  cvSourceVideo.style.pointerEvents = 'none';
  cvSourceVideo.style.zIndex   = '9999';
  cvSourceVideo.style.visibility = 'visible';
  cvSourceVideo.src     = URL.createObjectURL(file);
  document.body.appendChild(cvSourceVideo);

  const onReady = () => {
    const dur   = cvSourceVideo.duration;
    const vw    = cvSourceVideo.videoWidth;
    const vh    = cvSourceVideo.videoHeight;
    if (!vw || !vh) return;
    cvFileInfo.textContent = isPlayerFile ? `${file.name} (Active Video)` : file.name;
    cvFileInfo.classList.add('loaded');
    cvMeta.textContent = `${vw}×${vh}  ·  ${fmtTime(dur)}  ·  ${fmtBytes(file.size)}`;

    updateLongVideoWarning();

    cvStart.disabled = false;
    if (cvPreviewSection) cvPreviewSection.style.display = 'block';
    drawConverterPreview(cvSourceVideo);
  };

  cvSourceVideo.addEventListener('loadedmetadata', () => {
    try { cvSourceVideo.currentTime = 0.001; } catch {}
    onReady();
  });

  cvSourceVideo.addEventListener('seeked', () => {
    onReady();
  });

  cvSourceVideo.addEventListener('loadeddata', () => {
    onReady();
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

[cvCfgRes, cvCfgFpsOverride, cvExportType].forEach(control => {
  control.addEventListener('change', () => {
    updateExportModeUI();
    updateLongVideoWarning();
    const vid = (cvSourceVideo && cvSourceVideo.videoWidth) ? cvSourceVideo : sourceVideo;
    if (vid) {
      if (cvPreviewSection) cvPreviewSection.style.display = 'block';
      drawConverterPreview(vid);
    }
  });
});

function cvResetUI() {
  cvStopProgressClock();
  cvTemporaryExport?.discard();
  cvTemporaryExport = null;
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
  try {
    if (state.currentFile) {
      cvSetFile(state.currentFile);
    } else if (sourceVideo && sourceVideo.videoWidth) {
      if (cvPreviewSection) cvPreviewSection.style.display = 'block';
      drawConverterPreview(sourceVideo);
    } else {
      if (cvPreviewSection) cvPreviewSection.style.display = 'none';
    }
  } catch (err) {
    console.warn('Non-fatal error preparing converter preview:', err);
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

  const exportType = cvExportType.value;
  const isGif = exportType === 'gif';
  const isSubtitle = exportType === 'srt' || exportType === 'vtt' || exportType === 'ass' || exportType === 'youtube' || exportType === 'ytt';
  const isYtt = exportType === 'ytt';
  const isYoutube = exportType === 'youtube';
  const isAss = exportType === 'ass';
  const isVtt = exportType === 'vtt' || isYoutube;
  const isSrt = exportType === 'srt';
  const selectedFps = parseFloat(cvCfgFpsOverride.value) || (isYtt ? 24 : isYoutube ? 2 : isGif ? 10 : isSubtitle ? 15 : 60);
  const resolution = cvCfgRes.value || '1440p';
  const duration = (cvSourceVideo.duration && isFinite(cvSourceVideo.duration) && cvSourceVideo.duration > 0)
    ? cvSourceVideo.duration
    : ((sourceVideo && isFinite(sourceVideo.duration) && sourceVideo.duration > 0) ? sourceVideo.duration : 10);
  const targetFps = isYoutube ? Math.min(5, selectedFps) : selectedFps;
  const exportCols = isSubtitle
    ? chooseSrtCols(duration, cfg.cols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight, targetFps, exportType)
    : isGif
    ? Math.min(cfg.cols || 80, 100)
    : cfg.cols;
  const exportCfg = isSubtitle
    ? { ...cfg, cols: exportCols, fontSize: isAss ? 9 : (cfg.fontSize || 10) }
    : cfg;
  const totalFrames = Math.max(1, Math.ceil(duration * targetFps));
  const estimatedOutputBytes = isGif
    ? Math.min(50 * 1024 * 1024, Math.round(duration * Math.min(20, targetFps) * 45000))
    : isSubtitle
    ? estimateSrtBytes(duration, exportCols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight, targetFps, exportType)
    : estimateVideoBytes(duration, exportCols, cvSourceVideo.videoWidth, cvSourceVideo.videoHeight, resolution);
  const memoryExportLimit = (isSubtitle ? 96 : 192) * 1024 * 1024;
  const mimeType = isYtt ? 'application/xml;charset=utf-8' : isAss ? 'text/x-ssa;charset=utf-8' : isVtt ? 'text/vtt;charset=utf-8' : isSrt ? 'text/plain;charset=utf-8' : isGif ? 'image/gif' : detectMime();
  const extension = isYtt ? 'ytt' : isAss ? 'ass' : isVtt ? 'vtt' : isSrt ? 'srt' : isGif ? 'gif' : (mimeType.includes('mp4') ? 'mp4' : 'webm');
  const filename = isYtt
    ? `youtube-timedtext-${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.ytt`
    : isYoutube
    ? `youtube-ascii-captions-${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.vtt`
    : isGif
    ? `ascili-animated-${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.gif`
    : `ascili-converted-${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.${extension}`;

  cvProgressSection.style.display = 'block';
  if (cvPreviewSection) cvPreviewSection.style.display = 'block';
  if (cvPreviewBadge) cvPreviewBadge.textContent = 'ENCODING PREVIEW';
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
  lastPreviewDraw = 0;
  cvStartProgressClock();
  if (cvPreviewCanvas && cvSourceVideo) {
    drawConverterPreview(cvSourceVideo, exportCfg);
  }

  if (isSubtitle) {
    const labelPrefix = isYtt ? 'YOUTUBE YTT' : isYoutube ? 'YOUTUBE VTT' : isAss ? 'ASS' : isVtt ? 'WEBVTT' : 'SRT';
    cvProgressSection.querySelector('.cv-section-label').textContent = `${labelPrefix} EXPORT PROGRESS`;
    try {
    const subtitleSpeed = targetFps <= 15 ? 2.0 : targetFps <= 30 ? 1.5 : 1.0;
    cvSrtExporter.start(cvSourceVideo, { ...exportCfg, monoColor: state.monoColor }, {
      targetFps,
      format: isYtt ? 'ytt' : isYoutube ? 'youtube' : isAss ? 'ass' : isVtt ? 'vtt' : 'srt',
      speed: subtitleSpeed,
      onProgress(pct, _elapsed, _eta, frameNum, frameTotal) {
        cvCurrentProgress = pct;
        cvProgressFrames.textContent = `${frameNum.toLocaleString()} / ${frameTotal.toLocaleString()} frames`;
        cvProgressFill.style.width = (pct * 100).toFixed(1) + '%';
        cvProgressPct.textContent = (pct * 100).toFixed(0) + '%';
        cvUpdateProgressClock();

        const now = performance.now();
        if (!lastPreviewDraw || now - lastPreviewDraw >= 50 || frameNum === frameTotal) {
          lastPreviewDraw = now;
          if (cvPreviewCanvas && cvSourceVideo && cvSourceVideo.videoWidth) {
            drawConverterPreview(cvSourceVideo, exportCfg);
          }
        }
      },
      async onComplete(blob, resultMime, result) {
        cvStopProgressClock();
        if (cvPreviewBadge) cvPreviewBadge.textContent = 'EXPORT COMPLETE ✓';
        cvBlob = blob;
        cvMimeType = resultMime;
        cvStop.style.display = 'none';
        cvSave.style.display = '';
        if (saveLabel) {
          saveLabel.textContent = isYtt ? 'Download .ytt' : isAss ? 'Download ASS' : 'Download Subtitles';
        }
        cvConvertAnother.style.display = '';
        cvProgressFill.style.width = '100%';
        cvProgressPct.textContent = '100%';
        cvProgressEta.textContent = '';
        cvProgressTime.textContent = 'Done';
        cvProgressFrames.textContent = `${totalFrames.toLocaleString()} / ${totalFrames.toLocaleString()} frames`;
        cvProgressSection.querySelector('.cv-section-label').textContent = `${labelPrefix} EXPORT COMPLETE`;
        cvDoneSection.style.display = 'flex';
        const formatName = isYtt ? 'YouTube Timed Text (.ytt)' : isYoutube ? 'YouTube Captions' : isAss ? 'ASS' : isVtt ? 'WebVTT' : 'SRT';
        const colsDisplay = result?.cols || exportCols;
        const fontNote = isYtt ? `  ·  font ${cfg.fontSize || 1}` : isYoutube ? '  ·  plain text' : isAss ? '  ·  9px font' : '';
        cvDoneMeta.textContent = `${fmtBytes(blob?.size || 0)}  ·  ${formatName}  ·  ${targetFps} FPS  ·  ${colsDisplay} cols${fontNote}`;
        showToast(isYtt ? 'YouTube Timed Text (.ytt) ready to download' : `${formatName} ready to download`);
        try {
          if (blob) download(filename, blob, resultMime);
        } catch {}
      },
      onError(message) {
        if (cvPreviewBadge) cvPreviewBadge.textContent = 'ASCII PREVIEW';
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

  if (isGif) {
    cvProgressSection.querySelector('.cv-section-label').textContent = 'GIF EXPORT PROGRESS';
    try {
      const gifFps = Math.min(20, Math.max(5, targetFps || 10));
      cvGifExporter.start(cvSourceVideo, cfg, {
        targetFps: gifFps,
        maxFrames: Math.min(120, Math.ceil(duration * gifFps)),
        onProgress(pct, frameNum, frameTotal) {
          cvCurrentProgress = pct;
          cvProgressFrames.textContent = `${frameNum} / ${frameTotal} frames`;
          cvProgressFill.style.width = (pct * 100).toFixed(1) + '%';
          cvProgressPct.textContent = (pct * 100).toFixed(0) + '%';
          cvUpdateProgressClock();

          const now = performance.now();
          if (!lastPreviewDraw || now - lastPreviewDraw >= 50 || frameNum === frameTotal) {
            lastPreviewDraw = now;
            if (cvPreviewCanvas && cvGifExporter._frameCanvas) {
              const src = cvGifExporter._frameCanvas;
              if (cvPreviewCanvas.width !== src.width || cvPreviewCanvas.height !== src.height) {
                cvPreviewCanvas.width = src.width;
                cvPreviewCanvas.height = src.height;
              }
              const pCtx = cvPreviewCanvas.getContext('2d');
              pCtx?.drawImage(src, 0, 0);
            }
          }
        },
        async onComplete(blob, resultMime, result) {
          cvStopProgressClock();
          if (cvPreviewBadge) cvPreviewBadge.textContent = 'EXPORT COMPLETE ✓';
          cvBlob = blob;
          cvMimeType = 'image/gif';
          cvStop.style.display = 'none';
          cvSave.style.display = '';
          cvConvertAnother.style.display = '';
          cvProgressFill.style.width = '100%';
          cvProgressPct.textContent = '100%';
          cvProgressEta.textContent = '';
          cvProgressTime.textContent = 'Done';
          cvProgressFrames.textContent = `${result?.frames || totalFrames} / ${result?.frames || totalFrames} frames`;
          cvProgressSection.querySelector('.cv-section-label').textContent = 'GIF EXPORT COMPLETE';
          cvDoneSection.style.display = 'flex';
          cvDoneMeta.textContent = `${fmtBytes(blob?.size || 0)}  ·  Animated GIF  ·  ${gifFps} FPS  ·  ${result?.cols || cfg.cols} cols`;
          showToast('Animated GIF ready to download');
        },
        onError(message) {
          if (cvPreviewBadge) cvPreviewBadge.textContent = 'ASCII PREVIEW';
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
    maxBufferedBytes: Infinity,
    onProgress(pct) {
      cvCurrentProgress = pct;
      const frameNum = Math.round(pct * totalFrames);
      cvProgressFrames.textContent = `${frameNum.toLocaleString()} / ${totalFrames.toLocaleString()} frames`;
      cvProgressFill.style.width  = (pct * 100).toFixed(1) + '%';
      cvProgressPct.textContent   = (pct * 100).toFixed(0) + '%';
      cvUpdateProgressClock();

      const now = performance.now();
      if (!lastPreviewDraw || now - lastPreviewDraw >= 50 || frameNum === totalFrames) {
        lastPreviewDraw = now;
        const src = cvExporter.canvas;
        if (src && src.width > 0 && src.height > 0) {
          if (cvPreviewCanvas.width !== src.width || cvPreviewCanvas.height !== src.height) {
            cvPreviewCanvas.width = src.width;
            cvPreviewCanvas.height = src.height;
          }
          const pCtx = cvPreviewCanvas.getContext('2d');
          pCtx?.drawImage(src, 0, 0);
        }
      }
    },
    async onComplete(blob, mimeType, result) {
      cvStopProgressClock();
      if (cvPreviewBadge) cvPreviewBadge.textContent = 'EXPORT COMPLETE ✓';
      cvBlob     = blob;
      cvMimeType = mimeType;

      cvStop.style.display           = 'none';
      cvSave.style.display           = '';
      if (saveLabel) {
        saveLabel.textContent = 'Download Video';
      }
      cvConvertAnother.style.display = '';
      cvProgressFill.style.width     = '100%';
      cvProgressPct.textContent      = '100%';
      cvProgressEta.textContent      = '';
      cvProgressTime.textContent     = 'Done';
      cvProgressFrames.textContent   = `${totalFrames.toLocaleString()} / ${totalFrames.toLocaleString()} frames`;

      cvDoneSection.style.display = 'flex';
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      cvDoneMeta.textContent = `${fmtBytes(blob?.size || 0)}  ·  ${ext.toUpperCase()}  ·  ${resolution.toUpperCase()}  ·  ${targetFps} FPS  ·  ${cfg.cols} cols`;
      showToast('Video conversion ready! Click Download Video.');
      try {
        if (blob) download(filename, blob, mimeType);
      } catch {}
    },
    onError(msg) {
      if (cvPreviewBadge) cvPreviewBadge.textContent = 'ASCII PREVIEW';
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
  if (cvExporter._running) cvExporter.stop();
  else if (cvSrtExporter._running) cvSrtExporter.stop();
  else if (cvGifExporter._running) cvGifExporter.stop();
  cvStopProgressClock();
  cvStop.style.display  = 'none';
  cvStart.style.display = '';
  cvStart.disabled      = false;
  cvProgressEta.textContent = 'Stopped';
  showToast('Conversion stopped');
});

cvSave.addEventListener('click', () => {
  if (cvTemporaryExport) {
    try {
      cvTemporaryExport.download();
      showToast('Download started');
      return;
    } catch (error) {
      cvShowExportError(error?.message || error);
    }
  }
  if (!cvBlob) {
    showToast('Export file is not available to download. Please retry export.');
    return;
  }
  const isGif = cvExportType?.value === 'gif' || cvMimeType.includes('gif');
  const ext = (cvMimeType.includes('xml') || cvExportType?.value === 'ytt') ? 'ytt' : isGif ? 'gif' : (cvMimeType.includes('ssa') || cvMimeType.includes('ass')) ? 'ass' : cvMimeType.includes('vtt') ? 'vtt' : (cvMimeType.includes('subrip') || cvMimeType.includes('srt')) ? 'srt' : (cvMimeType.includes('mp4') ? 'mp4' : 'webm');
  const ts  = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
  const filename = cvExportType?.value === 'ytt' ? `youtube-timedtext-${ts}.ytt` : cvExportType?.value === 'youtube' ? `youtube-ascii-captions-${ts}.vtt` : isGif ? `ascili-animated-${ts}.gif` : `ascili-${ts}.${ext}`;
  try {
    download(filename, cvBlob, cvMimeType);
    showToast(ext === 'ytt' ? 'YouTube Timed Text (.ytt) saved' : cvExportType?.value === 'youtube' ? 'YouTube captions saved' : isGif ? 'Animated GIF saved' : ext === 'ass' ? 'ASS subtitles saved' : ext === 'vtt' ? 'WebVTT saved' : ext === 'srt' ? 'SRT saved' : 'Video saved');
  } catch (error) {
    cvShowExportError(error?.message || error);
  }
});

cvConvertAnother.addEventListener('click', () => {
  cvResetUI();
  if (cvPreviewSection) cvPreviewSection.style.display = 'none';
  if (cvSourceVideo) {
    cvSourceVideo.pause();
    URL.revokeObjectURL(cvSourceVideo.src);
    cvSourceVideo.remove();
  }
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
    if (cvExporter._running || cvSrtExporter._running || cvGifExporter._running) {
      if (!confirm('Stop the current conversion?')) return;
      if (cvExporter._running) cvExporter.stop();
      else if (cvSrtExporter._running) cvSrtExporter.stop();
      else if (cvGifExporter._running) cvGifExporter.stop();
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

  if (currentAppMode === 'studio') {
    if (e.key === ' ' && studioInstance) {
      e.preventDefault();
      studioInstance.timeline?.togglePlay();
    }
    return;
  }

  // Escape closes the converter modal
  if (e.key === 'Escape') {
    if (cvOverlay.classList.contains('open')) {
      if (cvExporter._running || cvSrtExporter._running || cvGifExporter._running) {
        if (!confirm('Stop the current conversion?')) return;
        if (cvExporter._running) cvExporter.stop();
        else if (cvSrtExporter._running) cvSrtExporter.stop();
        else if (cvGifExporter._running) cvGifExporter.stop();
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
    case 'e': case 'E':
      e.preventDefault(); openConverter(); break;
    case 'm': case 'M':
      e.preventDefault();
      if (btnMirror) btnMirror.click();
      else if (chkMirror) { chkMirror.checked = !chkMirror.checked; readConfig(); }
      break;
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

// ─── Dual-Mode Architecture: Live Streamer vs 3D ASCII Typography Studio ────

let studioInstance = null;
let currentAppMode = 'streamer';

const modeBtnStreamer = $('modeBtnStreamer');
const modeBtnStudio = $('modeBtnStudio');
const mainLayoutEl = $('mainLayout');
const studioRootEl = $('studioRoot');
const sourceBarEl = document.querySelector('.source-bar');
const btnSwitchToStudio = $('btnSwitchToStudio');

function setAppMode(mode) {
  try {
    currentAppMode = mode;
    if (mode === 'studio') {
      // If streamer video is running, pause to conserve system CPU
      if (typeof state !== 'undefined' && state.running && !state.paused) {
        try { togglePause(); } catch {}
      }
      if (mainLayoutEl) mainLayoutEl.style.display = 'none';
      if (presetBar) presetBar.style.display = 'none';
      if (sourceBarEl) sourceBarEl.style.display = 'none';

      if (studioRootEl) {
        studioRootEl.style.display = 'flex';
        if (!studioInstance) {
          studioInstance = new StudioController(studioRootEl);
        }
      }

      modeBtnStreamer?.classList.remove('active');
      modeBtnStudio?.classList.add('active');
      window.location.hash = '#studio';
    } else {
      if (studioRootEl) {
        studioRootEl.style.display = 'none';
        if (studioInstance && studioInstance.comp.isPlaying) {
          studioInstance.timeline?.pause();
        }
      }
      if (mainLayoutEl) mainLayoutEl.style.display = 'flex';
      if (presetBar) presetBar.style.display = '';
      if (sourceBarEl) sourceBarEl.style.display = '';

      modeBtnStudio?.classList.remove('active');
      modeBtnStreamer?.classList.add('active');
      if (window.location.hash === '#studio') {
        window.location.hash = '#streamer';
      }
    }
  } catch (err) {
    console.error('[ASCILI] setAppMode error:', err);
  }
}

// Make setAppMode accessible globally
if (typeof window !== 'undefined') {
  window.setAppMode = setAppMode;
}

modeBtnStreamer?.addEventListener('click', () => setAppMode('streamer'));
modeBtnStudio?.addEventListener('click', () => setAppMode('studio'));
btnSwitchToStudio?.addEventListener('click', () => setAppMode('studio'));

// Auto-switch on hash change or initial load (#studio)
window.addEventListener('hashchange', () => {
  if (window.location.hash === '#studio') {
    setAppMode('studio');
  } else if (window.location.hash === '#streamer') {
    setAppMode('streamer');
  }
});

if (window.location.hash === '#studio') {
  setAppMode('studio');
}

// ─── PWA Service Worker Registration ──────────────────────────────────────────

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('[ASCILI] Service worker active, scope:', reg.scope);
      })
      .catch(err => {
        console.warn('[ASCILI] Service worker registration failed:', err);
      });
  });
}
