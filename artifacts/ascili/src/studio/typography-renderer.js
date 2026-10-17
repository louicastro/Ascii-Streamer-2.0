/**
 * 3D ASCII Typography Rasterizer & Stream Engine
 * Renders 3D extruded typography with Euler rotations, perspective camera,
 * specular lighting, and passes the 3D frame through the authentic AsciliEngine
 * to generate real-time ASCII character stream animations using CHAR_SETS.
 * Fully optimized to handle 2,000 words smoothly at 60 FPS with word-wrapping,
 * 3D perspective crawling, and viewport frustum culling.
 */

import { AsciliEngine, CHAR_SETS } from '../engine.js';
import {
  degToRad,
  createRotationMatrix,
  transformPoint,
  project3D,
  calculateSurfaceLight,
  hexToRgb,
  lerpColor,
  clamp,
  lerp,
  applyEasing,
} from './3d-math.js';
import { evaluatePreset } from './presets.js';

// Offscreen buffers for 3D rendering and post FX
let _sceneCanvas = null;
let _sceneCtx = null;
let _asciiEngine = null;
let _bloomCanvas = null;
let _bloomCtx = null;
let _glitchCanvas = null;
let _glitchCtx = null;

function getSceneCanvas(w, h) {
  if (!_sceneCanvas && typeof document !== 'undefined') {
    _sceneCanvas = document.createElement('canvas');
    _sceneCtx = _sceneCanvas.getContext('2d', { alpha: false });
  }
  if (_sceneCanvas && (_sceneCanvas.width !== w || _sceneCanvas.height !== h)) {
    _sceneCanvas.width = Math.max(1, w);
    _sceneCanvas.height = Math.max(1, h);
  }
  return { canvas: _sceneCanvas, ctx: _sceneCtx };
}

function getAsciiEngine() {
  if (!_asciiEngine && typeof AsciliEngine === 'function') {
    try {
      _asciiEngine = new AsciliEngine();
    } catch (e) {
      console.warn('[Studio] AsciliEngine initialization error:', e);
    }
  }
  return _asciiEngine;
}

function getBloomCanvas(w, h) {
  if (!_bloomCanvas && typeof document !== 'undefined') {
    _bloomCanvas = document.createElement('canvas');
    _bloomCtx = _bloomCanvas.getContext('2d');
  }
  if (_bloomCanvas && (_bloomCanvas.width !== w || _bloomCanvas.height !== h)) {
    _bloomCanvas.width = Math.max(1, w);
    _bloomCanvas.height = Math.max(1, h);
  }
  return { canvas: _bloomCanvas, ctx: _bloomCtx };
}

function getGlitchCanvas(w, h) {
  if (!_glitchCanvas && typeof document !== 'undefined') {
    _glitchCanvas = document.createElement('canvas');
    _glitchCtx = _glitchCanvas.getContext('2d');
  }
  if (_glitchCanvas && (_glitchCanvas.width !== w || _glitchCanvas.height !== h)) {
    _glitchCanvas.width = Math.max(1, w);
    _glitchCanvas.height = Math.max(1, h);
  }
  return { canvas: _glitchCanvas, ctx: _glitchCtx };
}

// Line wrapping cache for high performance with 2,000 words
const _wrapCache = new Map();

export function getWrappedLines(ctx, text, maxWidth, fontKey) {
  const cacheKey = `${text.length}:${maxWidth}:${fontKey}:${text.slice(0, 30)}`;
  if (_wrapCache.has(cacheKey)) {
    return _wrapCache.get(cacheKey);
  }
  if (_wrapCache.size > 150) _wrapCache.clear();

  const paragraphs = text.split('\n');
  const lines = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let curLine = '';
    for (const word of words) {
      const candidate = curLine ? `${curLine} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && curLine) {
        lines.push(curLine);
        curLine = word;
      } else {
        curLine = candidate;
      }
    }
    if (curLine) {
      lines.push(curLine);
    }
  }

  _wrapCache.set(cacheKey, lines);
  return lines;
}

/**
 * Render a single frame of the 3D ASCII Studio composition.
 *
 * @param {object} comp - Composition model
 * @param {number} time - Current playback time in seconds
 * @param {HTMLCanvasElement} canvas - Target output canvas
 * @param {object} [opts] - Additional rendering options (e.g. beatPulse, isExport, forceRenderAll)
 */
export function renderStudioFrame(comp, time, canvas, opts = {}) {
  const width = comp.width || 1920;
  const height = comp.height || 1080;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  // Determine whether to use the authentic ASCII Stream Engine
  const useAsciiEngine = comp.asciiEngineMode !== false;
  let targetCanvas = canvas;
  let targetCtx = null;

  if (useAsciiEngine) {
    const sc = getSceneCanvas(width, height);
    targetCanvas = sc.canvas;
    targetCtx = sc.ctx;
  } else {
    targetCtx = canvas.getContext('2d', { alpha: true });
  }

  if (!targetCtx || !targetCanvas) return;

  // Background clear
  targetCtx.save();
  const bgMode = comp.bgMode || 'black';
  if (bgMode === 'transparent') {
    targetCtx.clearRect(0, 0, width, height);
  } else if (bgMode === 'custom') {
    targetCtx.fillStyle = comp.bgColor || '#060608';
    targetCtx.fillRect(0, 0, width, height);
  } else {
    // Deep black CRT background
    targetCtx.fillStyle = '#060608';
    targetCtx.fillRect(0, 0, width, height);
  }
  targetCtx.restore();

  const originX = width / 2;
  const originY = height / 2;
  const beatPulse = opts.beatPulse || 0;

  // Render each visible layer onto 3D targetCanvas
  for (const layer of comp.layers) {
    if (!layer.visible) continue;

    // Time window calculation
    const startTime = layer.startTime || 0;
    const duration = layer.duration || 5;
    const endTime = startTime + duration;

    // Strict time interval enforcement during export or live playback
    if (time < startTime || time > endTime) {
      if (opts.isExport || comp.isPlaying) {
        continue;
      }
      if (comp.layers.length > 1 && !opts.forceRenderAll) {
        continue;
      }
    }

    const layerTime = clamp(time - startTime, 0, duration);
    const normT = duration > 0 ? clamp(layerTime / duration, 0, 1) : 0;

    renderTextLayer(targetCanvas, targetCtx, width, height, layer, normT, layerTime, duration, originX, originY, beatPulse, opts);
  }

  // Convert 3D scene canvas into authentic ASCII stream using AsciliEngine
  if (useAsciiEngine && targetCanvas) {
    const engine = getAsciiEngine();
    const primaryLayer = comp.layers.find((l) => l.id === comp.selectedLayerId) || comp.layers[0] || {};
    const charSetKey = primaryLayer.charSet || comp.charSet || 'standard';
    const customChars = primaryLayer.customChars || comp.customChars || '';
    const charSet = (charSetKey === 'custom' && customChars.trim().length > 0) ? customChars : charSetKey;

    let rendered = false;
    if (engine) {
      try {
        const renderRes = engine.renderFrame(targetCanvas, canvas, {
          charSet,
          cols: primaryLayer.asciiCols || comp.asciiCols || 120,
          colorMode: primaryLayer.colorMode || comp.colorMode || 'truecolor',
          monoColor: primaryLayer.highlightColor || primaryLayer.frontColor || comp.monoColor || '#39ff52',
          scanlines: Boolean(primaryLayer.scanlines ?? comp.scanlines),
          dithering: primaryLayer.dithering || comp.dithering || 'none',
          enableEdgeDetection: primaryLayer.enableEdgeDetection ?? (comp.enableEdgeDetection ?? true),
          edgeThreshold: 0.16,
          brightness: comp.brightness || 0,
          contrast: comp.contrast || 15,
          gamma: comp.gamma || 0,
          saturation: comp.saturation || 10,
          invertChars: Boolean(primaryLayer.invertChars ?? comp.invertChars),
          aspectRatio: comp.aspectRatio || '16:9',
        });
        rendered = renderRes && renderRes.rendered !== false;
      } catch (err) {
        rendered = false;
      }
    }

    if (!rendered) {
      // Fallback: direct draw if WebGL context not ready
      const displayCtx = canvas.getContext('2d');
      if (displayCtx && targetCanvas !== canvas) {
        displayCtx.drawImage(targetCanvas, 0, 0);
      }
    }
  }
}

/**
 * Render an individual 3D ASCII text layer.
 */
function renderTextLayer(canvas, ctx, width, height, layer, t, layerTime, duration, originX, originY, beatPulse, opts) {
  // Preset evaluation (speed is factored into t and layerTime)
  const presetRes = evaluatePreset(layer.preset || 'cinematicReveal', layer, t, layerTime, duration);

  const opacity = clamp((layer.opacity ?? 1.0) * (presetRes.opacity ?? 1.0), 0, 1);
  if (opacity <= 0.001) return;

  // Layer & Preset Transform
  const baseScale = (layer.scale || 1.0) * (presetRes.transform.scale || 1.0) * (1.0 + beatPulse * 0.1);
  const posX = (layer.posX || 0) + (presetRes.transform.posX || 0);
  const posY = (layer.posY || 0) + (presetRes.transform.posY || 0);
  const posZ = (layer.posZ || 0) + (presetRes.transform.posZ || 0);

  const rotX = degToRad((layer.rotX || 0) + (presetRes.transform.rotX || 0));
  const rotY = degToRad((layer.rotY || 0) + (presetRes.transform.rotY || 0));
  const rotZ = degToRad((layer.rotZ || 0) + (presetRes.transform.rotZ || 0));

  const rotMatrix = createRotationMatrix(rotX, rotY, rotZ);

  // Lighting
  const lightX = presetRes.lighting.lightDirX ?? layer.lightDirX ?? 0.5;
  const lightY = presetRes.lighting.lightDirY ?? layer.lightDirY ?? -0.8;
  const lightZ = presetRes.lighting.lightDirZ ?? layer.lightDirZ ?? 0.9;
  const ambient = layer.ambientLight ?? 0.35;

  // Extrusion parameters
  const depth = Math.max(0, layer.depth ?? 36);
  const slices = Math.max(2, Math.min(32, Math.round(layer.slices ?? 14)));
  const fov = Math.max(200, layer.perspective ?? 750);
  const cameraZ = (layer.cameraZ || 0);

  // Typography parameters
  const text = layer.text || '';
  if (!text.trim()) return;

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const isLongText = wordCount > 25 || text.length > 200;

  const rawFontSize = layer.fontSize || (isLongText ? 28 : 58);
  const fontSize = Math.max(10, Math.round(rawFontSize * baseScale));
  const fontFamily = layer.fontFamily || "'JetBrains Mono', monospace";
  const fontWeight = layer.fontWeight || 'bold';
  const lineHeight = (layer.lineHeight || 1.35) * fontSize;
  const textAlign = layer.textAlign || 'center';

  const frontColor = layer.frontColor || '#ffffff';
  const extrudeColor = layer.extrudeColor || '#3a7bd5';
  const highlightColor = layer.highlightColor || '#00ffff';

  ctx.save();
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'middle';

  // Word-wrapping
  const maxLineWidth = Math.max(300, width * 0.85);
  const fontKey = `${fontWeight}_${fontSize}_${fontFamily}`;
  const lines = getWrappedLines(ctx, text, maxLineWidth, fontKey);

  const totalContentHeight = lines.length * lineHeight;

  // Vertical layout & 3D crawl motion
  let scrollY = posY;
  if (isLongText && lines.length > 3) {
    const startY = height * 0.55;
    const endY = -totalContentHeight - height * 0.2;
    scrollY = lerp(startY, endY, t) + posY;
  } else {
    scrollY = posY - (totalContentHeight / 2) + (lineHeight / 2);
  }

  // Surface lighting normal
  const frontNormal = transformPoint(rotMatrix, 0, 0, 1);
  const frontLight = calculateSurfaceLight(frontNormal.x, frontNormal.y, frontNormal.z, lightX, lightY, lightZ, ambient);
  const litFrontColor = lerpColor(frontColor, highlightColor, Math.max(0, frontLight - 0.5) * 1.5);

  const hasCharReveal = presetRes.visibleCharCount !== undefined;
  let charCounter = 0;

  // Slices: for long text, 3 depth slices; for short text, full slices
  const effectiveSlices = isLongText ? 3 : Math.min(slices, 16);

  // ─── 1. Extrusion Slices (Back to Front) ──────────────────────────────────
  if (depth > 0) {
    for (let s = 0; s < effectiveSlices; s++) {
      const sliceFrac = s / effectiveSlices;
      const sliceDepth = -depth * (1.0 - sliceFrac);
      const sliceColor = lerpColor('#040810', extrudeColor, sliceFrac * 0.9);
      const sliceOpacity = opacity * (0.35 + 0.65 * sliceFrac);

      ctx.save();
      ctx.fillStyle = sliceColor;
      ctx.globalAlpha = sliceOpacity;

      if (layer.shadow && s === 0) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 8;
        ctx.shadowOffsetY = 12;
      }

      for (let li = 0; li < lines.length; li++) {
        const lineText = lines[li];
        if (!lineText) continue;

        const lineY = scrollY + li * lineHeight;
        const ptCenter = transformPoint(rotMatrix, posX, lineY, posZ + sliceDepth);
        if (ptCenter.z <= -cameraZ + 1) continue;

        const proj = project3D(ptCenter.x, ptCenter.y, ptCenter.z, originX, originY, fov, cameraZ);
        if (proj.scale <= 0) continue;

        // Viewport frustum culling
        if (proj.y < -200 || proj.y > height + 200) continue;

        const renderedSize = Math.max(1, fontSize * proj.scale);
        ctx.font = `${fontWeight} ${renderedSize}px ${fontFamily}`;

        let currentX = proj.x;
        const lineMetrics = ctx.measureText(lineText).width;
        if (textAlign === 'center') currentX -= lineMetrics / 2;
        else if (textAlign === 'right') currentX -= lineMetrics;

        ctx.fillText(lineText, currentX, proj.y);
      }

      ctx.restore();
    }
  }

  // ─── 2. Front Face with Specular Lighting ────────────────────────────────
  ctx.save();
  ctx.fillStyle = litFrontColor;
  ctx.globalAlpha = opacity;

  for (let li = 0; li < lines.length; li++) {
    let lineText = lines[li];
    if (!lineText) continue;

    const lineY = scrollY + li * lineHeight;
    const ptCenter = transformPoint(rotMatrix, posX, lineY, posZ);
    if (ptCenter.z <= -cameraZ + 1) continue;

    const proj = project3D(ptCenter.x, ptCenter.y, ptCenter.z, originX, originY, fov, cameraZ);
    if (proj.scale <= 0) continue;

    // Viewport frustum culling
    if (proj.y < -200 || proj.y > height + 200) {
      charCounter += lineText.length;
      continue;
    }

    // Typewriter or Reveal handling
    if (hasCharReveal) {
      const lineStart = charCounter;
      const lineEnd = charCounter + lineText.length;
      charCounter = lineEnd;

      if (presetRes.visibleCharCount < lineStart) {
        continue;
      } else if (presetRes.visibleCharCount < lineEnd) {
        const charsInLine = presetRes.visibleCharCount - lineStart;
        lineText = lineText.slice(0, charsInLine) + (presetRes.cursor || '');
      }
    }

    const renderedSize = Math.max(1, fontSize * proj.scale);
    ctx.font = `${fontWeight} ${renderedSize}px ${fontFamily}`;

    if (frontLight > 0.7) {
      ctx.shadowColor = highlightColor;
      ctx.shadowBlur = Math.round(8 * proj.scale);
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    let currentX = proj.x;
    const lineMetrics = ctx.measureText(lineText).width;
    if (textAlign === 'center') currentX -= lineMetrics / 2;
    else if (textAlign === 'right') currentX -= lineMetrics;

    ctx.fillText(lineText, currentX, proj.y);
  }
  ctx.restore();

  // ─── 3. CRT Scanlines Pass ───────────────────────────────────────────────
  if (layer.scanlines && (presetRes.lighting.scanlineIntensity || layer.scanlineIntensity)) {
    applyScanlines(ctx, originX, originY, width, height, layer, presetRes);
  }

  // ─── 4. Bloom Pass ───────────────────────────────────────────────────────
  const bloomIntensity = (presetRes.lighting.bloomIntensity ?? layer.bloomIntensity ?? 0.5) + beatPulse * 0.35;
  if (layer.bloom && bloomIntensity > 0.05) {
    applyBloom(ctx, canvas, width, height, bloomIntensity, layer.bloomRadius || 10, highlightColor);
  }

  // ─── 5. Chromatic Glitch Pass ────────────────────────────────────────────
  const glitch = presetRes.glitchIntensity || layer.glitchIntensity || 0;
  if (glitch > 0.05) {
    applyChromaticGlitch(ctx, canvas, width, height, glitch);
  }

  ctx.restore();
}

/**
 * Applies horizontal CRT scanlines across the canvas.
 */
function applyScanlines(ctx, originX, originY, width, height, layer, presetRes) {
  const intensity = clamp(presetRes.lighting.scanlineIntensity ?? layer.scanlineIntensity ?? 0.35, 0, 1);
  if (intensity <= 0.01) return;

  const w = width || ctx.canvas.width || 1920;
  const h = height || ctx.canvas.height || 1080;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(0, 0, 0, ${intensity * 0.6})`;

  const step = 4; // Scanline spacing in pixels
  for (let y = 0; y < h; y += step) {
    ctx.fillRect(0, y, w, 1.5);
  }

  // Subtle phosphor glow line
  ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.08})`;
  for (let y = 1; y < h; y += step) {
    ctx.fillRect(0, y, w, 0.5);
  }

  ctx.restore();
}

/**
 * Fast two-pass Bloom & Glow Filter.
 */
function applyBloom(ctx, canvas, width, height, intensity, radius, glowColor) {
  if (!canvas) return;
  const w = width || canvas.width || 1920;
  const h = height || canvas.height || 1080;

  const { canvas: bCanvas, ctx: bCtx } = getBloomCanvas(Math.round(w / 2), Math.round(h / 2));
  bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);

  // Downsample
  bCtx.drawImage(canvas, 0, 0, bCanvas.width, bCanvas.height);

  // Composite glow with additive blend mode
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clamp(intensity * 0.8, 0, 1);
  ctx.filter = `blur(${Math.round(radius)}px)`;
  ctx.drawImage(bCanvas, 0, 0, w, h);

  // Second soft specular pass
  ctx.globalAlpha = clamp(intensity * 0.4, 0, 0.6);
  ctx.filter = `blur(${Math.round(radius * 2.2)}px)`;
  ctx.drawImage(bCanvas, 0, 0, w, h);

  ctx.filter = 'none';
  ctx.restore();
}

/**
 * Chromatic aberration glitch pass: splits R and G/B channels horizontally.
 */
function applyChromaticGlitch(ctx, canvas, width, height, glitchIntensity) {
  if (!canvas) return;
  const w = width || canvas.width || 1920;
  const h = height || canvas.height || 1080;

  const { canvas: gCanvas, ctx: gCtx } = getGlitchCanvas(w, h);
  gCtx.clearRect(0, 0, w, h);
  gCtx.drawImage(canvas, 0, 0);

  const shift = Math.round(glitchIntensity * 16);
  if (shift <= 0) return;

  ctx.save();
  // Cyan channel shift right
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.65;
  ctx.drawImage(gCanvas, shift, 0);

  // Red channel shift left
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.65;
  ctx.drawImage(gCanvas, -shift, 0);

  ctx.restore();
}
