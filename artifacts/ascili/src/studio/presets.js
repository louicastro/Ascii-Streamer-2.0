/**
 * 20 Distinct Animation Presets for 3D ASCII Typography
 * Each preset mathematically transforms the layer's geometry, characters, lighting, or FX over normalized clip time t in [0, 1].
 */

import { applyEasing, clamp, lerp, pseudoRandom } from './3d-math.js';

const MATRIX_GLYPHS = '0123456789ABCDEF$#@*+=-:~';

/**
 * Evaluates the active preset for a layer at a given normalized time t in [0, 1].
 *
 * @param {string} presetName
 * @param {object} layer
 * @param {number} t - normalized clip time [0, 1]
 * @param {number} layerTime - real time in seconds within the layer clip
 * @param {number} totalDuration - layer clip duration in seconds
 * @returns {object} evaluated state modifications
 */
export function evaluatePreset(presetName, layer, t, layerTime, totalDuration) {
  const text = layer.text || '';
  const textLen = text.length;

  // Apply speed multiplier to animation time for all presets
  const speed = Math.max(0.05, layer.presetSpeed ?? 1.0);
  const scaledLayerTime = layerTime * speed;
  const scaledT = clamp(t * speed, 0, 1);
  const easing = layer.presetEasing || 'easeInOutCubic';
  const easedT = applyEasing(easing, scaledT);

  // Defaults: no override
  const result = {
    opacity: 1.0,
    transform: {
      posX: layer.posX || 0,
      posY: layer.posY || 0,
      posZ: layer.posZ || 0,
      rotX: layer.rotX || 0,
      rotY: layer.rotY || 0,
      rotZ: layer.rotZ || 0,
      scale: layer.scale || 1.0,
    },
    lighting: {
      lightDirX: layer.lightDirX ?? 0.5,
      lightDirY: layer.lightDirY ?? -0.8,
      lightDirZ: layer.lightDirZ ?? 0.9,
      bloomIntensity: layer.bloomIntensity ?? 0.5,
      scanlineIntensity: layer.scanlineIntensity ?? 0.35,
    },
    glitchIntensity: 0.0,
    // Per-character overrides: array of { char, ox, oy, oz, rotX, rotY, rotZ, scale, opacity, color }
    charStates: null,
  };

  switch (presetName) {
    // 1. Typewriter: reveals characters one by one with a blinking cursor
    case 'typewriter': {
      const charCount = Math.max(0, Math.min(textLen, Math.floor(scaledT * (textLen + 1))));
      const isBlink = Math.floor(scaledLayerTime * 3) % 2 === 0;
      const cursor = scaledT < 1.0 && isBlink ? '█' : '';
      result.charStates = [];
      for (let i = 0; i < textLen; i++) {
        const isShown = i < charCount;
        result.charStates.push({
          char: isShown ? text[i] : (i === charCount && cursor ? '█' : ' '),
          opacity: isShown || (i === charCount && cursor) ? 1.0 : 0.0,
          ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0,
        });
      }
      break;
    }

    // 2. Character Reveal: Matrix-style random glyph resolution
    case 'characterReveal': {
      result.charStates = [];
      for (let i = 0; i < textLen; i++) {
        const charThreshold = (i + 0.5) / Math.max(1, textLen);
        if (scaledT >= charThreshold) {
          result.charStates.push({ char: text[i], opacity: 1.0, ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 });
        } else if (scaledT >= charThreshold - 0.25) {
          // Scrambling glyph phase
          const randIdx = Math.floor(pseudoRandom(i * 19.3 + Math.floor(scaledLayerTime * 15)) * MATRIX_GLYPHS.length);
          result.charStates.push({
            char: MATRIX_GLYPHS[randIdx],
            opacity: 0.9,
            ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0,
            color: '#39ff52',
          });
        } else {
          result.charStates.push({ char: ' ', opacity: 0.0, ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 });
        }
      }
      break;
    }

    // 3. 3D Zoom In: fly toward camera from deep perspective
    case 'zoomIn': {
      const zOffset = lerp(1400, 0, easedT);
      result.transform.posZ += zOffset;
      result.opacity = clamp(scaledT * 3.0, 0, 1.0);
      result.transform.rotX += lerp(35, 0, easedT);
      result.transform.rotY += lerp(-40, 0, easedT);
      break;
    }

    // 4. 3D Zoom Out: starts centered and recedes into infinite distance
    case 'zoomOut': {
      const zOffset = lerp(0, -900, easedT);
      result.transform.posZ += zOffset;
      result.opacity = clamp((1.0 - scaledT) * 2.0, 0, 1.0);
      result.transform.rotX += lerp(0, 25, easedT);
      result.transform.rotY += lerp(0, 45, easedT);
      break;
    }

    // 5. 3D Tumbling Rotation: multi-axis dynamic rotation
    case 'rotation3d': {
      result.transform.rotX += lerp(-180, 0, easedT);
      result.transform.rotY += lerp(360, 0, easedT);
      result.transform.rotZ += lerp(-90, 0, easedT);
      result.opacity = clamp(scaledT * 2.5, 0, 1.0);
      break;
    }

    // 6. ASCII Dissolve: characters disintegrate into decaying ASCII noise glyphs
    case 'dissolve': {
      const progress = easedT;
      result.charStates = [];
      const dissolveChars = '@#*+=:-. ';
      for (let i = 0; i < textLen; i++) {
        const noise = pseudoRandom(i * 37.1);
        const charProgress = clamp((progress - noise * 0.4) / 0.6, 0, 1);
        if (charProgress <= 0) {
          result.charStates.push({ char: text[i], opacity: 1.0, ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 });
        } else if (charProgress >= 1) {
          result.charStates.push({ char: ' ', opacity: 0.0, ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 });
        } else {
          const charIdx = Math.floor(charProgress * (dissolveChars.length - 1));
          const scatterY = charProgress * 40;
          const scatterZ = charProgress * -120;
          result.charStates.push({
            char: dissolveChars[charIdx],
            opacity: 1.0 - charProgress,
            ox: (pseudoRandom(i * 12.3) - 0.5) * charProgress * 30,
            oy: scatterY,
            oz: scatterZ,
            rotX: charProgress * 45,
            rotY: 0,
            rotZ: 0,
            scale: 1.0 - charProgress * 0.4,
          });
        }
      }
      break;
    }

    // 7. Particle Scatter: characters explode outward radially in 3D
    case 'particleScatter': {
      const progress = easedT;
      result.charStates = [];
      for (let i = 0; i < textLen; i++) {
        const seed = i + 1;
        const angle = pseudoRandom(seed * 41.7) * Math.PI * 2;
        const scatterSpd = 250 + pseudoRandom(seed * 99.1) * 350;
        const zVel = (pseudoRandom(seed * 17.5) - 0.5) * 600;
        const ox = Math.cos(angle) * scatterSpd * progress;
        const oy = Math.sin(angle) * scatterSpd * progress;
        const oz = zVel * progress;
        const rotX = progress * 360 * (pseudoRandom(seed * 3.3) - 0.5);
        const rotY = progress * 360 * (pseudoRandom(seed * 7.7) - 0.5);
        const rotZ = progress * 180 * (pseudoRandom(seed * 5.1) - 0.5);
        const op = clamp(1.0 - progress * 1.2, 0, 1.0);
        result.charStates.push({
          char: text[i],
          ox, oy, oz, rotX, rotY, rotZ,
          scale: Math.max(0.1, 1.0 - progress * 0.5),
          opacity: op,
        });
      }
      break;
    }

    // 8. Chromatic Glitch: horizontal displacement, line offsets, bit noise
    case 'glitch': {
      const isGlitchBurst = pseudoRandom(Math.floor(scaledLayerTime * 12)) > 0.45;
      result.glitchIntensity = isGlitchBurst ? 0.75 : 0.15;
      if (isGlitchBurst) {
        result.transform.posX += (pseudoRandom(scaledLayerTime * 43.1) - 0.5) * 35;
        result.transform.posY += (pseudoRandom(scaledLayerTime * 87.2) - 0.5) * 12;
      }
      result.charStates = [];
      for (let i = 0; i < textLen; i++) {
        const mutate = isGlitchBurst && pseudoRandom(i * 3.7 + scaledLayerTime) > 0.7;
        const mutatedChar = mutate ? MATRIX_GLYPHS[Math.floor(pseudoRandom(i + scaledLayerTime) * MATRIX_GLYPHS.length)] : text[i];
        const jx = isGlitchBurst ? (pseudoRandom(i * 11.1) - 0.5) * 18 : 0;
        result.charStates.push({
          char: mutatedChar,
          ox: jx, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0,
          opacity: 1.0,
          color: mutate ? '#ff0055' : null,
        });
      }
      break;
    }

    // 9. 3D Sine Wave: undulation rippling through characters in 3D
    case 'wave': {
      result.charStates = [];
      const waveFreq = 0.5;
      const waveSpeed = 4.0;
      for (let i = 0; i < textLen; i++) {
        const phase = i * waveFreq - scaledLayerTime * waveSpeed;
        const oy = Math.sin(phase) * 28;
        const oz = Math.cos(phase) * 60;
        const rx = Math.sin(phase) * 25;
        result.charStates.push({
          char: text[i],
          ox: 0, oy, oz,
          rotX: rx, rotY: 0, rotZ: 0,
          scale: 1.0 + Math.sin(phase) * 0.15,
          opacity: 1.0,
        });
      }
      break;
    }

    // 10. Fade In & Settle: smooth opacity rise with gentle landing
    case 'fadeIn': {
      result.opacity = clamp(easedT, 0, 1.0);
      result.transform.scale *= lerp(0.8, 1.0, easedT);
      result.transform.posZ += lerp(200, 0, easedT);
      break;
    }

    // 11. Fade Out: smooth fade into deep shadow
    case 'fadeOut': {
      result.opacity = clamp(1.0 - easedT, 0, 1.0);
      result.transform.scale *= lerp(1.0, 0.85, easedT);
      result.transform.posZ += lerp(0, -250, easedT);
      break;
    }

    // 12. Scanline Reveal: CRT electron beam sweeping top to bottom
    case 'scanlineReveal': {
      result.lighting.scanlineIntensity = 0.8;
      result.charStates = [];
      const sweepY = easedT; // 0 to 1
      for (let i = 0; i < textLen; i++) {
        const relPos = (i + 0.5) / Math.max(1, textLen);
        const diff = sweepY - relPos;
        if (diff > 0.05) {
          result.charStates.push({ char: text[i], opacity: 1.0, ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 });
        } else if (diff >= -0.05) {
          // Glowing active scan beam
          result.charStates.push({
            char: text[i], opacity: 1.0, ox: 0, oy: 0, oz: 20,
            rotX: 0, rotY: 0, rotZ: 0, scale: 1.15,
            color: '#39ff52',
          });
        } else {
          result.charStates.push({ char: ' ', opacity: 0.0, ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 });
        }
      }
      break;
    }

    // 13. Neon Glow: pulsing neon luminescence with breathing bloom
    case 'neonGlow': {
      const pulse = Math.sin(scaledLayerTime * 4.5);
      result.lighting.bloomIntensity = (layer.bloomIntensity ?? 0.5) * (1.2 + 0.6 * pulse);
      result.lighting.scanlineIntensity = 0.4 + 0.2 * pulse;
      break;
    }

    // 14. Cinematic Reveal: dramatic lighting sweep across extruded 3D bevels
    case 'cinematicReveal': {
      const sweepAngle = lerp(-Math.PI * 0.75, Math.PI * 0.75, easedT);
      result.lighting.lightDirX = Math.cos(sweepAngle);
      result.lighting.lightDirY = -0.6;
      result.lighting.lightDirZ = Math.sin(sweepAngle);
      result.opacity = clamp(scaledT * 2.0, 0, 1.0);
      result.transform.rotY += lerp(-30, 0, easedT);
      break;
    }

    // 15. Horizontal Sweep: left-to-right wipe with ASCII spark front
    case 'horizontalSweep': {
      result.charStates = [];
      const leadPos = easedT * (textLen + 2);
      for (let i = 0; i < textLen; i++) {
        if (i < leadPos - 1) {
          result.charStates.push({ char: text[i], opacity: 1.0, ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 });
        } else if (i < leadPos) {
          result.charStates.push({
            char: '*', opacity: 1.0, ox: 0, oy: 0, oz: 30,
            rotX: 0, rotY: 0, rotZ: 0, scale: 1.25,
            color: '#ffea00',
          });
        } else {
          result.charStates.push({ char: ' ', opacity: 0.0, ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 });
        }
      }
      break;
    }

    // 16. Vertical Sweep: cascade from top
    case 'verticalSweep': {
      result.charStates = [];
      for (let i = 0; i < textLen; i++) {
        const charStart = (i / Math.max(1, textLen)) * 0.5;
        const charT = clamp((scaledT - charStart) / 0.5, 0, 1);
        const charEased = applyEasing('easeOutBounce', charT);
        const oy = lerp(-140, 0, charEased);
        const op = clamp(charT * 2.0, 0, 1.0);
        result.charStates.push({
          char: text[i],
          ox: 0, oy, oz: 0,
          rotX: lerp(90, 0, charEased),
          rotY: 0, rotZ: 0,
          scale: lerp(0.5, 1.0, charEased),
          opacity: op,
        });
      }
      break;
    }

    // 17. Ripple: radial circular shockwave expanding from center
    case 'ripple': {
      result.charStates = [];
      const mid = (textLen - 1) / 2;
      const waveFront = easedT * (mid + 4);
      for (let i = 0; i < textLen; i++) {
        const dist = Math.abs(i - mid);
        const waveDist = Math.abs(dist - waveFront);
        if (waveDist < 2.0) {
          const impact = Math.cos((waveDist / 2.0) * Math.PI * 0.5);
          result.charStates.push({
            char: text[i],
            ox: 0,
            oy: -impact * 35,
            oz: impact * 80,
            rotX: -impact * 30,
            rotY: 0, rotZ: 0,
            scale: 1.0 + impact * 0.25,
            opacity: 1.0,
            color: impact > 0.6 ? '#00ffff' : null,
          });
        } else {
          result.charStates.push({ char: text[i], opacity: 1.0, ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 });
        }
      }
      break;
    }

    // 18. Shatter: faceted 3D ASCII shards tumbling away
    case 'shatter': {
      result.charStates = [];
      for (let i = 0; i < textLen; i++) {
        const seed = i * 13.7 + 1.1;
        const shardT = easedT;
        const dx = (pseudoRandom(seed * 3.1) - 0.5) * 500 * shardT;
        const dy = (pseudoRandom(seed * 5.7) - 0.5) * 400 * shardT + (shardT * shardT * 200); // gravity
        const dz = (pseudoRandom(seed * 7.9) - 0.5) * 600 * shardT;
        const rx = pseudoRandom(seed * 2.3) * 720 * shardT;
        const ry = pseudoRandom(seed * 4.1) * 720 * shardT;
        const rz = pseudoRandom(seed * 6.5) * 360 * shardT;
        const op = clamp(1.0 - shardT * 1.1, 0, 1.0);
        result.charStates.push({
          char: text[i],
          ox: dx, oy: dy, oz: dz,
          rotX: rx, rotY: ry, rotZ: rz,
          scale: Math.max(0.2, 1.0 - shardT * 0.6),
          opacity: op,
        });
      }
      break;
    }

    // 19. Digital Rain: cascading green Katakana & ASCII streams resolving into words
    case 'digitalRain': {
      result.charStates = [];
      for (let i = 0; i < textLen; i++) {
        const settleTime = 0.3 + (i / Math.max(1, textLen)) * 0.5;
        if (scaledT >= settleTime) {
          result.charStates.push({ char: text[i], opacity: 1.0, ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 });
        } else {
          const rainPhase = (scaledLayerTime * 12 + i * 2) % MATRIX_GLYPHS.length;
          const char = MATRIX_GLYPHS[Math.floor(rainPhase)];
          const dropY = ((scaledLayerTime * 200 + i * 35) % 80) - 40;
          result.charStates.push({
            char,
            ox: 0, oy: dropY, oz: 20,
            rotX: 0, rotY: 0, rotZ: 0,
            scale: 1.05,
            opacity: 0.9,
            color: '#39ff52',
          });
        }
      }
      break;
    }

    // 20. Loop Animation: seamless 3D harmonic figure-8 oscillation
    case 'loopAnimation':
    default: {
      const angle = (scaledLayerTime * Math.PI * 2) % (Math.PI * 2);
      result.transform.rotX += Math.sin(angle) * 15;
      result.transform.rotY += Math.cos(angle * 0.5) * 25;
      result.transform.posZ += Math.sin(angle * 2) * 50;
      result.transform.posY += Math.cos(angle) * 12;
      result.opacity = 1.0;
      break;
    }
  }

  return result;
}
