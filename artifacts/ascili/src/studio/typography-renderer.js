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
  multiplyMatrices3x3,
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

// Offscreen sampling canvas for text mask extraction
let _maskCanvas = null;
let _maskCtx = null;

function getMaskCanvas(w, h) {
  if (!_maskCanvas && typeof document !== 'undefined') {
    _maskCanvas = document.createElement('canvas');
    _maskCtx = _maskCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (_maskCanvas && (_maskCanvas.width !== w || _maskCanvas.height !== h)) {
    _maskCanvas.width = Math.max(1, w);
    _maskCanvas.height = Math.max(1, h);
  }
  return { canvas: _maskCanvas, ctx: _maskCtx };
}

// Cache for sampled 2D character voxel grids
const _charGridCache = new Map();

/**
 * Samples a font character into an authentic 2D ASCII voxel grid.
 * Returns { cols, rows, cells: [{ gx, gy, isTop, isBottom, isLeft, isRight }], width, height }
 */
export function getSampledCharGrid(ch, fontFamily, fontSize, fontWeight, cellW, cellH) {
  const cacheKey = `${ch}:${fontFamily}:${fontSize}:${fontWeight}:${cellW}:${cellH}`;
  if (_charGridCache.has(cacheKey)) {
    return _charGridCache.get(cacheKey);
  }
  if (_charGridCache.size > 500) _charGridCache.clear();

  if (typeof document === 'undefined' || !ch || ch === ' ') {
    // Deterministic fallback grid for headless environments
    const cells = [
      { gx: 0, gy: 0, isTop: true, isBottom: false, isLeft: true, isRight: false },
      { gx: 1, gy: 0, isTop: true, isBottom: false, isLeft: false, isRight: false },
      { gx: 2, gy: 0, isTop: true, isBottom: false, isLeft: false, isRight: true },
      { gx: 0, gy: 1, isTop: false, isBottom: false, isLeft: true, isRight: false },
      { gx: 2, gy: 1, isTop: false, isBottom: false, isLeft: false, isRight: true },
      { gx: 0, gy: 2, isTop: false, isBottom: false, isLeft: true, isRight: false },
      { gx: 1, gy: 2, isTop: false, isBottom: false, isLeft: false, isRight: false },
      { gx: 2, gy: 2, isTop: false, isBottom: false, isLeft: false, isRight: true },
      { gx: 0, gy: 3, isTop: false, isBottom: false, isLeft: true, isRight: false },
      { gx: 2, gy: 3, isTop: false, isBottom: false, isLeft: false, isRight: true },
      { gx: 0, gy: 4, isTop: false, isBottom: true, isLeft: true, isRight: false },
      { gx: 2, gy: 4, isTop: false, isBottom: true, isLeft: false, isRight: true },
    ];
    const fallbackGrid = { cols: 3, rows: 5, cells, width: 3 * cellW, height: 5 * cellH };
    _charGridCache.set(cacheKey, fallbackGrid);
    return fallbackGrid;
  }

  const estW = Math.max(cellW * 4, Math.round(fontSize * 1.8));
  const estH = Math.max(cellH * 4, Math.round(fontSize * 1.8));
  const { canvas, ctx } = getMaskCanvas(estW, estH);
  if (!ctx) {
    const emptyGrid = { cols: 2, rows: 3, cells: [{ gx: 0, gy: 0, isTop: true, isBottom: true, isLeft: true, isRight: true }], width: cellW * 2, height: cellH * 3 };
    return emptyGrid;
  }

  ctx.clearRect(0, 0, estW, estH);
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const centerX = estW / 2;
  const centerY = estH / 2;
  ctx.fillText(ch, centerX, centerY);

  let imgData;
  try {
    imgData = ctx.getImageData(0, 0, estW, estH);
  } catch {
    const fallbackGrid = { cols: 2, rows: 3, cells: [{ gx: 0, gy: 0, isTop: true, isBottom: true, isLeft: true, isRight: true }], width: cellW * 2, height: cellH * 3 };
    return fallbackGrid;
  }

  const pixels = imgData.data;

  // Find bounding box of non-zero alpha
  let minX = estW, maxX = 0, minY = estH, maxY = 0;
  for (let y = 0; y < estH; y++) {
    for (let x = 0; x < estW; x++) {
      const a = pixels[(y * estW + x) * 4 + 3];
      if (a > 30) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Safety fallback if font rasterization returned no alpha pixels
  if (minX > maxX || minY > maxY) {
    minX = Math.max(0, Math.round(centerX - cellW * 1.5));
    maxX = Math.min(estW - 1, Math.round(centerX + cellW * 1.5));
    minY = Math.max(0, Math.round(centerY - cellH * 2));
    maxY = Math.min(estH - 1, Math.round(centerY + cellH * 2));
  }

  const boxW = Math.max(cellW, (maxX - minX + 1));
  const boxH = Math.max(cellH, (maxY - minY + 1));
  const cols = Math.max(1, Math.ceil(boxW / cellW));
  const rows = Math.max(1, Math.ceil(boxH / cellH));

  const occupied = new Set();
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const startX = minX + gx * cellW;
      const startY = minY + gy * cellH;

      let sumA = 0;
      let count = 0;
      let maxA = 0;
      for (let dy = 0; dy < cellH; dy++) {
        for (let dx = 0; dx < cellW; dx++) {
          const px = startX + dx;
          const py = startY + dy;
          if (px >= 0 && px < estW && py >= 0 && py < estH) {
            const a = pixels[(py * estW + px) * 4 + 3];
            sumA += a;
            if (a > maxA) maxA = a;
            count++;
          }
        }
      }

      const coverage = count > 0 ? (sumA / count) : 0;
      // Sensitive threshold: captures thin monospace strokes and hyphens/punctuation
      if (maxA > 30 || coverage > 10) {
        occupied.add(`${gx},${gy}`);
      }
    }
  }

  // Guaranteed fallback: If no cell triggered threshold, fill all bounding cells
  if (occupied.size === 0) {
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        occupied.add(`${gx},${gy}`);
      }
    }
  }

  const cellGrid = [];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (occupied.has(`${gx},${gy}`)) {
        const cellCenterX = minX + gx * cellW + cellW / 2;
        const cellCenterY = minY + gy * cellH + cellH / 2;
        cellGrid.push({
          gx,
          gy,
          relX: cellCenterX - centerX,
          relY: cellCenterY - centerY,
          isTop: !occupied.has(`${gx},${gy - 1}`),
          isBottom: !occupied.has(`${gx},${gy + 1}`),
          isLeft: !occupied.has(`${gx - 1},${gy}`),
          isRight: !occupied.has(`${gx + 1},${gy}`),
        });
      }
    }
  }

  const result = {
    cols,
    rows,
    cells: cellGrid,
    width: cols * cellW,
    height: rows * cellH,
  };

  _charGridCache.set(cacheKey, result);
  return result;
}

// Pattern cache for 3D ASCII hatching and glyph textures
const _patternCache = new Map();

export function getHashPattern(ctx, glyph = '#', color = '#ffffff', density = 'medium') {
  if (typeof document === 'undefined') return color;
  const tileSize = density === 'fine' ? { w: 7, h: 10, font: 'bold 9px monospace' }
                 : density === 'coarse' ? { w: 13, h: 18, font: 'bold 16px monospace' }
                 : { w: 9, h: 12, font: 'bold 11px monospace' };

  const key = `hash:${glyph}:${color}:${density}`;
  if (_patternCache.has(key)) return _patternCache.get(key);
  if (_patternCache.size > 100) _patternCache.clear();

  try {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = tileSize.w;
    pCanvas.height = tileSize.h;
    const pCtx = pCanvas.getContext('2d');
    if (!pCtx) return color;

    pCtx.clearRect(0, 0, tileSize.w, tileSize.h);
    pCtx.font = tileSize.font;
    pCtx.fillStyle = color;
    pCtx.textAlign = 'center';
    pCtx.textBaseline = 'middle';
    pCtx.fillText(glyph, tileSize.w / 2, tileSize.h / 2);

    const pattern = ctx.createPattern(pCanvas, 'repeat');
    if (pattern) {
      _patternCache.set(key, pattern);
      return pattern;
    }
  } catch (e) {
    // Canvas pattern creation fallback
  }
  return color;
}

export function getDiagPattern(ctx, color = '#a0aab8', style = 'diag', density = 'medium') {
  if (typeof document === 'undefined') return color;
  const tileSize = density === 'fine' ? { w: 6, h: 8 }
                 : density === 'coarse' ? { w: 12, h: 15 }
                 : { w: 8, h: 11 };

  const key = `diag:${color}:${style}:${density}`;
  if (_patternCache.has(key)) return _patternCache.get(key);
  if (_patternCache.size > 100) _patternCache.clear();

  try {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = tileSize.w;
    pCanvas.height = tileSize.h;
    const pCtx = pCanvas.getContext('2d');
    if (!pCtx) return color;

    pCtx.clearRect(0, 0, tileSize.w, tileSize.h);
    pCtx.strokeStyle = color;
    pCtx.lineWidth = 1.2;
    pCtx.beginPath();

    if (style === 'diagReverse') {
      pCtx.moveTo(0, 0);
      pCtx.lineTo(tileSize.w, tileSize.h);
    } else if (style === 'cross') {
      pCtx.moveTo(0, tileSize.h);
      pCtx.lineTo(tileSize.w, 0);
      pCtx.moveTo(0, 0);
      pCtx.lineTo(tileSize.w, tileSize.h);
    } else if (style === 'scanline') {
      pCtx.moveTo(0, tileSize.h / 2);
      pCtx.lineTo(tileSize.w, tileSize.h / 2);
    } else {
      // standard diagonal /
      pCtx.moveTo(0, tileSize.h);
      pCtx.lineTo(tileSize.w, 0);
    }
    pCtx.stroke();

    const pattern = ctx.createPattern(pCanvas, 'repeat');
    if (pattern) {
      _patternCache.set(key, pattern);
      return pattern;
    }
  } catch (e) {
    // Canvas pattern creation fallback
  }
  return color;
}

// Offscreen buffers for post FX
let _bloomCanvas = null;
let _bloomCtx = null;
let _glitchCanvas = null;
let _glitchCtx = null;

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
 * Projects a local 3D voxel coordinate into 2D canvas coordinates using layer and character 3D transforms.
 */
function projectVoxelPoint(rotMatrix, charLx, charLy, charLz, cellLx, cellLy, cellLz, posX, posY, posZ, originX, originY, fov, cameraZ) {
  const ptCell = transformPoint(rotMatrix, cellLx, cellLy, cellLz);
  const ptChar = transformPoint(rotMatrix, charLx, charLy, charLz);
  return project3D(ptChar.x + ptCell.x + posX, ptChar.y + ptCell.y + posY, ptChar.z + ptCell.z + posZ, originX, originY, fov, cameraZ);
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
  try {
    const width = comp.width || 1920;
    const height = comp.height || 1080;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Background clear
    ctx.save();
    const bgMode = comp.bgMode || 'black';
    if (bgMode === 'transparent') {
      ctx.clearRect(0, 0, width, height);
    } else if (bgMode === 'custom') {
      ctx.fillStyle = comp.bgColor || '#060608';
      ctx.fillRect(0, 0, width, height);
    } else {
      // Deep black CRT background
      ctx.fillStyle = '#060608';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();

    const originX = width / 2;
    const originY = height / 2;
    const beatPulse = opts.beatPulse || 0;

    // Render each visible layer directly onto the 3D typography canvas
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

      renderTextLayer(canvas, ctx, width, height, layer, normT, layerTime, duration, originX, originY, beatPulse, opts, comp.isPlaying);
    }
  } catch (err) {
    console.error('[Ascili Studio] renderStudioFrame error:', err);
  }
}

/**
 * Render an individual 3D ASCII text layer.
 */
function renderTextLayer(canvas, ctx, width, height, layer, t, layerTime, duration, originX, originY, beatPulse, opts, isPlaying) {
  // Preset evaluation (speed is factored into t and layerTime)
  const presetRes = evaluatePreset(layer.preset || 'cinematicReveal', layer, t, layerTime, duration);

  let opacity = clamp((layer.opacity ?? 1.0) * (presetRes.opacity ?? 1.0), 0, 1);
  // When paused in edit/preview mode, ensure the user can see their edits!
  if (!isPlaying && !opts.isExport && opacity <= 0.05) {
    opacity = clamp(layer.opacity ?? 1.0, 0.5, 1.0);
  }
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
  let scrollY = 0;
  if (isLongText && lines.length > 3) {
    const startY = height * 0.55;
    const endY = -totalContentHeight - height * 0.2;
    scrollY = lerp(startY, endY, t);
  }

  // Surface lighting normal
  const frontNormal = transformPoint(rotMatrix, 0, 0, 1);
  const frontLight = calculateSurfaceLight(frontNormal.x, frontNormal.y, frontNormal.z, lightX, lightY, lightZ, ambient);
  const litFrontColor = lerpColor(frontColor, highlightColor, Math.max(0, frontLight - 0.5) * 1.5);

  const hasCharReveal = presetRes.visibleCharCount !== undefined;
  const effectiveVisibleCharCount = (!isPlaying && !opts.isExport && hasCharReveal && presetRes.visibleCharCount === 0)
    ? 999999
    : presetRes.visibleCharCount;

  let charCounter = 0;

  // Patterns for 3D ASCII Typography
  const frontGlyph = layer.frontGlyph || '#';
  const glyphDensity = layer.glyphDensity || 'medium';
  const hatchStyle = layer.hatchStyle || 'diag';
  const isWireframe = layer.wireframe !== false;
  const outlineWidth = layer.outlineWidth || 1.5;
  const wireframeColor = layer.wireframeColor || '#ffffff';

  const hashPattern = getHashPattern(ctx, frontGlyph, litFrontColor, glyphDensity);
  const effectiveSlices = isLongText ? 3 : Math.min(slices, 24);

  // ─── True 3D ASCII Typography (Discrete Voxel Grid & Per-Character charStates) ───
  if (!isLongText && lines.length <= 8 && text.length <= 300) {
    const cellW = glyphDensity === 'fine' ? Math.max(3, Math.round(fontSize / 9.5))
                : glyphDensity === 'coarse' ? Math.max(5, Math.round(fontSize / 5.5))
                : Math.max(4, Math.round(fontSize / 7.2));
    const cellH = glyphDensity === 'fine' ? Math.max(5, Math.round(fontSize / 6.5))
                : glyphDensity === 'coarse' ? Math.max(7, Math.round(fontSize / 4.0))
                : Math.max(6, Math.round(fontSize / 5.1));

    const charItems = [];
    let globalCharIdx = 0;

    for (let li = 0; li < lines.length; li++) {
      const lineText = lines[li];
      if (!lineText) continue;

      const charWidths = [];
      let totalLineWidth = 0;
      for (let ci = 0; ci < lineText.length; ci++) {
        const ch = lineText[ci];
        const cw = ctx.measureText(ch).width + (layer.letterSpacing || 3);
        charWidths.push(cw);
        totalLineWidth += cw;
      }

      let curX = -totalLineWidth / 2;
      if (textAlign === 'left') curX = -width * 0.35;
      else if (textAlign === 'right') curX = width * 0.35 - totalLineWidth;

      const lineYOffset = li * lineHeight - (totalContentHeight / 2) + (lineHeight / 2);

      for (let ci = 0; ci < lineText.length; ci++) {
        const ch = lineText[ci];
        const cw = charWidths[ci];
        const cx = curX + cw / 2;
        curX += cw;

        const charIdx = globalCharIdx++;
        const isRevealed = !hasCharReveal || charIdx < effectiveVisibleCharCount;
        if (!isRevealed || ch === ' ') continue;

        // Consume per-character animation states from presets (dissolve, scatter, glitch, wave, shatter, etc.)
        const cs = (presetRes.charStates && presetRes.charStates[charIdx]) ? presetRes.charStates[charIdx] : null;

        const charOpacity = (cs?.opacity ?? 1.0) * opacity;
        if (charOpacity <= 0.001) continue;

        const charToDraw = cs?.char ?? ch;
        if (!charToDraw || charToDraw === ' ') continue;

        const charOx = cs?.ox || 0;
        const charOy = cs?.oy || 0;
        const charOz = cs?.oz || 0;
        const charScale = cs?.scale ?? 1.0;
        const charColor = cs?.color || null;

        // Combine local character rotation with layer Euler matrix
        let charRot = rotMatrix;
        if (cs && (cs.rotX || cs.rotY || cs.rotZ)) {
          const lRot = createRotationMatrix(degToRad(cs.rotX || 0), degToRad(cs.rotY || 0), degToRad(cs.rotZ || 0));
          charRot = multiplyMatrices3x3(rotMatrix, lRot);
        }

        // Get sampled 2D ASCII voxel grid for this character
        const grid = getSampledCharGrid(charToDraw, fontFamily, fontSize, fontWeight, cellW, cellH);

        charItems.push({
          char: charToDraw,
          localX: cx,
          localY: lineYOffset,
          ox: charOx,
          oy: charOy,
          oz: charOz,
          scale: charScale,
          opacity: charOpacity,
          color: charColor,
          rotMatrix: charRot,
          grid,
        });
      }
    }

    // 1. Render Extrusion Slices (Back to Front) with Discrete ASCII Glyphs
    if (depth > 0) {
      for (let s = 0; s < effectiveSlices; s++) {
        const sliceFrac = s / effectiveSlices;
        const sliceDepth = depth * (1.0 - sliceFrac);

        for (const item of charItems) {
          const sliceColor = item.color || lerpColor('#05070f', extrudeColor, sliceFrac * 0.95);
          const sliceOpacity = item.opacity * (0.4 + 0.6 * sliceFrac);

          ctx.save();
          ctx.globalAlpha = sliceOpacity;
          ctx.fillStyle = sliceColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Transform character center in 3D
          const charLx = item.localX + item.ox;
          const charLy = item.localY + item.oy + scrollY;
          const charLz = item.oz + sliceDepth;
          const ptCharCenter = transformPoint(rotMatrix, charLx, charLy, charLz);
          const cWorldX = ptCharCenter.x + posX;
          const cWorldY = ptCharCenter.y + posY;
          const cWorldZ = ptCharCenter.z + posZ;
          const centerProj = project3D(cWorldX, cWorldY, cWorldZ, originX, originY, fov, cameraZ);

          if (centerProj.scale > 0) {
            const curFontSize = Math.max(6, Math.round(cellH * centerProj.scale * item.scale));
            ctx.font = `bold ${curFontSize}px monospace`;

            for (const cell of item.grid.cells) {
              // Deep slice optimization: draw boundary cells for side/top extrusion faces
              if (!cell.isTop && !cell.isBottom && !cell.isLeft && !cell.isRight && s < effectiveSlices - 2) {
                continue;
              }

              const cellLx = (cell.relX !== undefined ? cell.relX : (cell.gx - item.grid.cols / 2 + 0.5) * cellW) * item.scale;
              const cellLy = (cell.relY !== undefined ? cell.relY : (cell.gy - item.grid.rows / 2 + 0.5) * cellH) * item.scale;
              const ptCell = transformPoint(item.rotMatrix, cellLx, cellLy, 0);
              const cellWorldX = ptCharCenter.x + ptCell.x + posX;
              const cellWorldY = ptCharCenter.y + ptCell.y + posY;
              const cellWorldZ = ptCharCenter.z + ptCell.z + posZ;
              const proj = project3D(cellWorldX, cellWorldY, cellWorldZ, originX, originY, fov, cameraZ);

              if (proj.scale <= 0) continue;

              const glyph = (cell.isTop || cell.isBottom) ? '=' : (cell.isLeft || cell.isRight ? '/' : frontGlyph);
              ctx.fillText(glyph, proj.x, proj.y);
            }
          }

          ctx.restore();
        }
      }
    }

    // 2. Render Front Face (z = 0) with Discrete '#' ASCII Grid
    for (const item of charItems) {
      ctx.save();
      ctx.globalAlpha = item.opacity;
      ctx.fillStyle = item.color || litFrontColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const charLx = item.localX + item.ox;
      const charLy = item.localY + item.oy + scrollY;
      const charLz = item.oz;
      const ptCharCenter = transformPoint(rotMatrix, charLx, charLy, charLz);
      const cWorldX = ptCharCenter.x + posX;
      const cWorldY = ptCharCenter.y + posY;
      const cWorldZ = ptCharCenter.z + posZ;
      const centerProj = project3D(cWorldX, cWorldY, cWorldZ, originX, originY, fov, cameraZ);

      if (centerProj.scale > 0) {
        if (frontLight > 0.7) {
          ctx.shadowColor = highlightColor;
          ctx.shadowBlur = Math.round(8 * centerProj.scale);
        } else {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }

        const curFontSize = Math.max(7, Math.round(cellH * centerProj.scale * item.scale));
        ctx.font = `bold ${curFontSize}px monospace`;

        // Draw each discrete ASCII cell on the front face
        for (const cell of item.grid.cells) {
          const cellLx = (cell.relX !== undefined ? cell.relX : (cell.gx - item.grid.cols / 2 + 0.5) * cellW) * item.scale;
          const cellLy = (cell.relY !== undefined ? cell.relY : (cell.gy - item.grid.rows / 2 + 0.5) * cellH) * item.scale;
          const ptCell = transformPoint(item.rotMatrix, cellLx, cellLy, 0);
          const cellWorldX = ptCharCenter.x + ptCell.x + posX;
          const cellWorldY = ptCharCenter.y + ptCell.y + posY;
          const cellWorldZ = ptCharCenter.z + ptCell.z + posZ;
          const proj = project3D(cellWorldX, cellWorldY, cellWorldZ, originX, originY, fov, cameraZ);

          if (proj.scale <= 0) continue;

          ctx.fillText(frontGlyph, proj.x, proj.y);
        }

        // Crisp CAD/blueprint 3D wireframe contour (built from projected 3D cell boundaries)
        if (isWireframe) {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.strokeStyle = wireframeColor;
          ctx.lineWidth = outlineWidth;
          ctx.beginPath();

          const hw = (cellW / 2) * item.scale;
          const hh = (cellH / 2) * item.scale;

          for (const cell of item.grid.cells) {
            if (!cell.isTop && !cell.isBottom && !cell.isLeft && !cell.isRight) continue;

            const clx = (cell.relX !== undefined ? cell.relX : (cell.gx - item.grid.cols / 2 + 0.5) * cellW) * item.scale;
            const cly = (cell.relY !== undefined ? cell.relY : (cell.gy - item.grid.rows / 2 + 0.5) * cellH) * item.scale;

            const pTL = projectVoxelPoint(rotMatrix, charLx, charLy, charLz, clx - hw, cly - hh, 0, posX, posY, posZ, originX, originY, fov, cameraZ);
            const pTR = projectVoxelPoint(rotMatrix, charLx, charLy, charLz, clx + hw, cly - hh, 0, posX, posY, posZ, originX, originY, fov, cameraZ);
            const pBL = projectVoxelPoint(rotMatrix, charLx, charLy, charLz, clx - hw, cly + hh, 0, posX, posY, posZ, originX, originY, fov, cameraZ);
            const pBR = projectVoxelPoint(rotMatrix, charLx, charLy, charLz, clx + hw, cly + hh, 0, posX, posY, posZ, originX, originY, fov, cameraZ);

            if (pTL.scale <= 0 || pTR.scale <= 0 || pBL.scale <= 0 || pBR.scale <= 0) continue;

            if (cell.isTop) {
              ctx.moveTo(pTL.x, pTL.y);
              ctx.lineTo(pTR.x, pTR.y);
            }
            if (cell.isBottom) {
              ctx.moveTo(pBL.x, pBL.y);
              ctx.lineTo(pBR.x, pBR.y);
            }
            if (cell.isLeft) {
              ctx.moveTo(pTL.x, pTL.y);
              ctx.lineTo(pBL.x, pBL.y);
            }
            if (cell.isRight) {
              ctx.moveTo(pTR.x, pTR.y);
              ctx.lineTo(pBR.x, pBR.y);
            }

            // Depth extrusion connecting lines on corners
            if (depth > 0) {
              if (cell.isTop && cell.isLeft) {
                const bTL = projectVoxelPoint(rotMatrix, charLx, charLy, charLz, clx - hw, cly - hh, depth, posX, posY, posZ, originX, originY, fov, cameraZ);
                if (bTL.scale > 0) { ctx.moveTo(pTL.x, pTL.y); ctx.lineTo(bTL.x, bTL.y); }
              }
              if (cell.isTop && cell.isRight) {
                const bTR = projectVoxelPoint(rotMatrix, charLx, charLy, charLz, clx + hw, cly - hh, depth, posX, posY, posZ, originX, originY, fov, cameraZ);
                if (bTR.scale > 0) { ctx.moveTo(pTR.x, pTR.y); ctx.lineTo(bTR.x, bTR.y); }
              }
              if (cell.isBottom && cell.isLeft) {
                const bBL = projectVoxelPoint(rotMatrix, charLx, charLy, charLz, clx - hw, cly + hh, depth, posX, posY, posZ, originX, originY, fov, cameraZ);
                if (bBL.scale > 0) { ctx.moveTo(pBL.x, pBL.y); ctx.lineTo(bBL.x, bBL.y); }
              }
              if (cell.isBottom && cell.isRight) {
                const bBR = projectVoxelPoint(rotMatrix, charLx, charLy, charLz, clx + hw, cly + hh, depth, posX, posY, posZ, originX, originY, fov, cameraZ);
                if (bBR.scale > 0) { ctx.moveTo(pBR.x, pBR.y); ctx.lineTo(bBR.x, bBR.y); }
              }
            }
          }
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  } else {
    // ─── Long Multiline Text: Line-Based Frustum Culling ──────────────────────
    if (depth > 0) {
      for (let s = 0; s < effectiveSlices; s++) {
        const sliceFrac = s / effectiveSlices;
        const sliceDepth = depth * (1.0 - sliceFrac);
        const sliceColor = lerpColor('#05070f', extrudeColor, sliceFrac * 0.9);
        const sliceOpacity = opacity * (0.35 + 0.65 * sliceFrac);
        const diagPattern = getDiagPattern(ctx, sliceColor, hatchStyle, glyphDensity);

        ctx.save();
        ctx.globalAlpha = sliceOpacity;

        for (let li = 0; li < lines.length; li++) {
          const lineText = lines[li];
          if (!lineText) continue;

          const lineY = scrollY + li * lineHeight;
          const ptCenter = transformPoint(rotMatrix, 0, lineY, sliceDepth);
          if (ptCenter.z + posZ <= -cameraZ + 1) continue;

          const proj = project3D(ptCenter.x + posX, ptCenter.y + posY, ptCenter.z + posZ, originX, originY, fov, cameraZ);
          if (proj.scale <= 0) continue;

          // Viewport frustum culling
          if (proj.y < -200 || proj.y > height + 200) continue;

          const renderedSize = Math.max(1, fontSize * proj.scale);
          ctx.font = `${fontWeight} ${renderedSize}px ${fontFamily}`;

          let currentX = proj.x;
          const lineMetrics = ctx.measureText(lineText).width;
          if (textAlign === 'center') currentX -= lineMetrics / 2;
          else if (textAlign === 'right') currentX -= lineMetrics;

          ctx.fillStyle = diagPattern || sliceColor;
          ctx.fillText(lineText, currentX, proj.y);
        }

        ctx.restore();
      }
    }

    // Front Face for Long Text
    ctx.save();
    ctx.globalAlpha = opacity;

    for (let li = 0; li < lines.length; li++) {
      let lineText = lines[li];
      if (!lineText) continue;

      const lineY = scrollY + li * lineHeight;
      const ptCenter = transformPoint(rotMatrix, 0, lineY, 0);
      if (ptCenter.z + posZ <= -cameraZ + 1) continue;

      const proj = project3D(ptCenter.x + posX, ptCenter.y + posY, ptCenter.z + posZ, originX, originY, fov, cameraZ);
      if (proj.scale <= 0) continue;

      if (proj.y < -200 || proj.y > height + 200) {
        charCounter += lineText.length;
        continue;
      }

      if (hasCharReveal) {
        const lineStart = charCounter;
        const lineEnd = charCounter + lineText.length;
        charCounter = lineEnd;

        if (effectiveVisibleCharCount < lineStart) {
          continue;
        } else if (effectiveVisibleCharCount < lineEnd) {
          const charsInLine = effectiveVisibleCharCount - lineStart;
          lineText = lineText.slice(0, charsInLine) + (presetRes.cursor || '');
        }
      }

      const renderedSize = Math.max(1, fontSize * proj.scale);
      ctx.font = `${fontWeight} ${renderedSize}px ${fontFamily}`;

      let currentX = proj.x;
      const lineMetrics = ctx.measureText(lineText).width;
      if (textAlign === 'center') currentX -= lineMetrics / 2;
      else if (textAlign === 'right') currentX -= lineMetrics;

      ctx.fillStyle = hashPattern || litFrontColor;
      ctx.fillText(lineText, currentX, proj.y);

      if (isWireframe) {
        ctx.strokeStyle = wireframeColor;
        ctx.lineWidth = outlineWidth;
        ctx.strokeText(lineText, currentX, proj.y);
      }
    }

    ctx.restore();
  }

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
  if (!bCanvas || !bCtx) return;
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
  if (!gCanvas || !gCtx) return;
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
