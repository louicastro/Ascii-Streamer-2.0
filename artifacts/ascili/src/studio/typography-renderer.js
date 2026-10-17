/**
 * 3D ASCII Typography Rasterizer
 * Renders 3D extruded text with Euler rotations, perspective camera, lighting normals,
 * CRT scanlines, bloom glow, and dense ASCII glyph patterns.
 */

import { CHAR_SETS } from '../engine.js';
import {
  degToRad,
  createRotationMatrix,
  transformPoint,
  project3D,
  calculateSurfaceLight,
  hexToRgb,
  lerpColor,
  clamp,
} from './3d-math.js';
import { evaluatePreset } from './presets.js';

// Offscreen buffer for bloom and chromatic effects
let _bloomCanvas = null;
let _bloomCtx = null;
let _glitchCanvas = null;
let _glitchCtx = null;

function getBloomCanvas(w, h) {
  if (!_bloomCanvas) {
    _bloomCanvas = document.createElement('canvas');
    _bloomCtx = _bloomCanvas.getContext('2d');
  }
  if (_bloomCanvas.width !== w || _bloomCanvas.height !== h) {
    _bloomCanvas.width = w;
    _bloomCanvas.height = h;
  }
  return { canvas: _bloomCanvas, ctx: _bloomCtx };
}

function getGlitchCanvas(w, h) {
  if (!_glitchCanvas) {
    _glitchCanvas = document.createElement('canvas');
    _glitchCtx = _glitchCanvas.getContext('2d');
  }
  if (_glitchCanvas.width !== w || _glitchCanvas.height !== h) {
    _glitchCanvas.width = w;
    _glitchCanvas.height = h;
  }
  return { canvas: _glitchCanvas, ctx: _glitchCtx };
}

/**
 * Render a single frame of the 3D ASCII Studio composition.
 *
 * @param {object} comp - Composition model
 * @param {number} time - Current playback time in seconds
 * @param {HTMLCanvasElement} canvas - Target output canvas
 * @param {object} [opts] - Additional rendering options (e.g. beatPulse, isExport)
 */
export function renderStudioFrame(comp, time, canvas, opts = {}) {
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

  // Render each visible layer
  for (const layer of comp.layers) {
    if (!layer.visible) continue;

    // Time window calculation
    const startTime = layer.startTime || 0;
    const duration = layer.duration || 5;
    const endTime = startTime + duration;

    // Check if layer is active at this time
    if (time < startTime || time > endTime) {
      // In live editing mode, if only one layer exists, preview it at clamp
      if (comp.layers.length > 1 && !opts.forceRenderAll) continue;
    }

    const layerTime = clamp(time - startTime, 0, duration);
    const normT = duration > 0 ? clamp(layerTime / duration, 0, 1) : 0;

    renderTextLayer(ctx, layer, normT, layerTime, duration, originX, originY, beatPulse, opts);
  }
}

/**
 * Render an individual 3D ASCII text layer.
 */
function renderTextLayer(ctx, layer, t, layerTime, duration, originX, originY, beatPulse, opts) {
  // Preset evaluation
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
  const lines = text.split('\n');
  const fontSize = Math.max(12, Math.round((layer.fontSize || 58) * baseScale));
  const fontFamily = layer.fontFamily || "'JetBrains Mono', monospace";
  const fontWeight = layer.fontWeight || 'bold';
  const letterSpacing = (layer.letterSpacing || 3) * baseScale;
  const lineHeight = (layer.lineHeight || 1.25) * fontSize;
  const textAlign = layer.textAlign || 'center';

  const frontColor = layer.frontColor || '#ffffff';
  const extrudeColor = layer.extrudeColor || '#3a7bd5';
  const highlightColor = layer.highlightColor || '#00ffff';

  // Measure text blocks
  ctx.save();
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'middle';

  // Per-line layout
  const lineLayouts = [];
  const totalBlockHeight = lines.length * lineHeight;
  let globalCharIndex = 0;

  for (let li = 0; li < lines.length; li++) {
    const lineText = lines[li];
    const chars = [];
    let lineWidth = 0;

    for (let ci = 0; ci < lineText.length; ci++) {
      const char = lineText[ci];
      const charWidth = ctx.measureText(char).width + letterSpacing;
      chars.push({
        char,
        width: charWidth,
        charIndex: globalCharIndex++,
      });
      lineWidth += charWidth;
    }

    lineLayouts.push({
      lineText,
      chars,
      lineWidth,
      yOffset: (li - (lines.length - 1) / 2) * lineHeight,
    });
  }

  // Pre-calculate 3D character world positions
  const charWorldPositions = [];
  for (const line of lineLayouts) {
    let currentX = -line.lineWidth / 2;
    if (textAlign === 'left') currentX = -originX * 0.4;
    else if (textAlign === 'right') currentX = originX * 0.4 - line.lineWidth;

    for (const ch of line.chars) {
      const cCenterX = currentX + ch.width / 2;
      const cCenterY = line.yOffset;

      // Check per-character preset state
      let charOverride = ch.char;
      let ox = 0, oy = 0, oz = 0, rx = 0, ry = 0, rz = 0;
      let charOpacity = 1.0;
      let charColor = null;

      if (presetRes.charStates && presetRes.charStates[ch.charIndex]) {
        const cs = presetRes.charStates[ch.charIndex];
        charOverride = cs.char ?? ch.char;
        ox = cs.ox || 0;
        oy = cs.oy || 0;
        oz = cs.oz || 0;
        rx = degToRad(cs.rotX || 0);
        ry = degToRad(cs.rotY || 0);
        rz = degToRad(cs.rotZ || 0);
        charOpacity = cs.opacity ?? 1.0;
        charColor = cs.color || null;
      }

      charWorldPositions.push({
        char: charOverride,
        baseX: cCenterX + ox + posX,
        baseY: cCenterY + oy + posY,
        baseZ: oz + posZ,
        localRotX: rx,
        localRotY: ry,
        localRotZ: rz,
        opacity: charOpacity * opacity,
        colorOverride: charColor,
        width: ch.width,
      });

      currentX += ch.width;
    }
  }

  // Calculate surface normal of the front face
  const frontNormal = transformPoint(rotMatrix, 0, 0, 1);
  const frontLight = calculateSurfaceLight(frontNormal.x, frontNormal.y, frontNormal.z, lightX, lightY, lightZ, ambient);

  // ─── 1. Extrusion Slices (Back to Front) ──────────────────────────────────
  if (depth > 0) {
    for (let s = 0; s < slices; s++) {
      const sliceFrac = s / slices; // 0 = deepest back, 1 = just behind front
      const sliceDepth = -depth * (1.0 - sliceFrac);

      // Interpolate extrusion color toward dark shadow at the back
      const sliceColor = lerpColor('#040810', extrudeColor, sliceFrac * 0.9);
      const sliceOpacity = opacity * (0.4 + 0.6 * sliceFrac);

      renderSlice(ctx, charWorldPositions, rotMatrix, sliceDepth, originX, originY, fov, cameraZ, fontSize, fontFamily, fontWeight, sliceColor, sliceOpacity, layer.shadow && s === 0);
    }
  }

  // ─── 2. Front Face with High-Intensity Lighting & ASCII Glow ─────────────
  renderFrontFace(
    ctx,
    charWorldPositions,
    rotMatrix,
    originX,
    originY,
    fov,
    cameraZ,
    fontSize,
    fontFamily,
    fontWeight,
    frontColor,
    highlightColor,
    frontLight,
    opacity,
    layer,
    presetRes
  );

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
 * Render a single extruded depth slice.
 */
function renderSlice(ctx, charPositions, rotMatrix, sliceDepth, originX, originY, fov, cameraZ, fontSize, fontFamily, fontWeight, color, opacity, hasShadow) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;

  if (hasShadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 15;
  }

  for (const cp of charPositions) {
    if (cp.opacity <= 0 || cp.char === ' ') continue;

    // Transform character center point in 3D
    const ptRot = transformPoint(rotMatrix, cp.baseX, cp.baseY, cp.baseZ + sliceDepth);
    const proj = project3D(ptRot.x, ptRot.y, ptRot.z, originX, originY, fov, cameraZ);

    if (proj.scale <= 0) continue;

    const renderedSize = Math.max(1, fontSize * proj.scale);
    ctx.font = `${fontWeight} ${renderedSize}px ${fontFamily}`;

    ctx.fillText(cp.char, proj.x, proj.y);
  }
  ctx.restore();
}

/**
 * Render the front face with specular highlights and per-character typography.
 */
function renderFrontFace(ctx, charPositions, rotMatrix, originX, originY, fov, cameraZ, fontSize, fontFamily, fontWeight, frontColor, highlightColor, lightLevel, opacity, layer, presetRes) {
  ctx.save();

  // Combine front face lighting
  const litFrontColor = lerpColor(frontColor, highlightColor, Math.max(0, lightLevel - 0.5) * 1.5);

  for (const cp of charPositions) {
    if (cp.opacity <= 0 || cp.char === ' ') continue;

    // Transform 3D position
    const ptRot = transformPoint(rotMatrix, cp.baseX, cp.baseY, cp.baseZ);
    const proj = project3D(ptRot.x, ptRot.y, ptRot.z, originX, originY, fov, cameraZ);

    if (proj.scale <= 0) continue;

    const renderedSize = Math.max(1, fontSize * proj.scale);
    ctx.font = `${fontWeight} ${renderedSize}px ${fontFamily}`;
    ctx.fillStyle = cp.colorOverride || litFrontColor;
    ctx.globalAlpha = cp.opacity * opacity;

    // Specular edge highlight
    if (lightLevel > 0.7) {
      ctx.shadowColor = highlightColor;
      ctx.shadowBlur = Math.round(8 * proj.scale);
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    ctx.fillText(cp.char, proj.x, proj.y);
  }

  ctx.restore();
}

/**
 * Applies horizontal CRT scanlines across the canvas.
 */
function applyScanlines(ctx, originX, originY, width, height, layer, presetRes) {
  const intensity = clamp(presetRes.lighting.scanlineIntensity ?? layer.scanlineIntensity ?? 0.35, 0, 1);
  if (intensity <= 0.01) return;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(0, 0, 0, ${intensity * 0.6})`;

  const step = 4; // Scanline spacing in pixels
  for (let y = 0; y < height; y += step) {
    ctx.fillRect(0, y, width, 1.5);
  }

  // Subtle phosphor glow line
  ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.08})`;
  for (let y = 1; y < height; y += step) {
    ctx.fillRect(0, y, width, 0.5);
  }

  ctx.restore();
}

/**
 * Fast two-pass Bloom & Glow Filter.
 */
function applyBloom(ctx, canvas, width, height, intensity, radius, glowColor) {
  const { canvas: bCanvas, ctx: bCtx } = getBloomCanvas(Math.round(width / 2), Math.round(height / 2));
  bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);

  // Downsample
  bCtx.drawImage(canvas, 0, 0, bCanvas.width, bCanvas.height);

  // Composite glow with additive blend mode
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clamp(intensity * 0.8, 0, 1);
  ctx.filter = `blur(${Math.round(radius)}px)`;
  ctx.drawImage(bCanvas, 0, 0, width, height);

  // Second soft specular pass
  ctx.globalAlpha = clamp(intensity * 0.4, 0, 0.6);
  ctx.filter = `blur(${Math.round(radius * 2.2)}px)`;
  ctx.drawImage(bCanvas, 0, 0, width, height);

  ctx.filter = 'none';
  ctx.restore();
}

/**
 * Chromatic aberration glitch pass: splits R and G/B channels horizontally.
 */
function applyChromaticGlitch(ctx, canvas, width, height, glitchIntensity) {
  const { canvas: gCanvas, ctx: gCtx } = getGlitchCanvas(width, height);
  gCtx.clearRect(0, 0, width, height);
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
