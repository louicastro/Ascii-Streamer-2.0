/**
 * Project Store, Local Storage Autosave, JSON Import/Export, and Templates
 */

import { ASPECT_RATIOS, createDefaultComposition, createDefaultLayer } from './types.js';

const STORAGE_KEY = 'ascili_studio_autosave_v1';

export const TEMPLATES = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Title',
    description: 'High-depth neon extrusion, scanlines, and dramatic cinematic lighting pass',
    create: () => {
      const comp = createDefaultComposition();
      comp.name = 'Cyberpunk Title';
      comp.duration = 5.0;
      const layer = comp.layers[0];
      layer.text = 'CYBERPUNK\n2088';
      layer.preset = 'cinematicReveal';
      layer.fontSize = 62;
      layer.depth = 48;
      layer.frontColor = '#ffffff';
      layer.extrudeColor = '#ff0055';
      layer.highlightColor = '#00ffff';
      layer.bloom = true;
      layer.bloomIntensity = 0.6;
      layer.scanlines = true;
      layer.scanlineIntensity = 0.45;
      return comp;
    },
  },
  {
    id: 'matrix',
    name: 'Matrix Code Stream',
    description: 'Digital Katakana & ASCII streams resolving into glowing green code',
    create: () => {
      const comp = createDefaultComposition();
      comp.name = 'Matrix Code Stream';
      comp.duration = 6.0;
      const layer = comp.layers[0];
      layer.text = 'WAKE UP, NEO.\nFOLLOW THE RABBIT.';
      layer.preset = 'digitalRain';
      layer.fontSize = 44;
      layer.depth = 24;
      layer.frontColor = '#ffffff';
      layer.extrudeColor = '#003b00';
      layer.highlightColor = '#39ff52';
      layer.bloom = true;
      layer.bloomIntensity = 0.7;
      layer.scanlines = true;
      return comp;
    },
  },
  {
    id: 'synthwave',
    name: 'Retro Synthwave 3D',
    description: 'Harmonic 3D wave undulation with neon magenta and cyan glow',
    create: () => {
      const comp = createDefaultComposition();
      comp.name = 'Retro Synthwave 3D';
      comp.duration = 5.0;
      const layer = comp.layers[0];
      layer.text = 'SYNTHWAVE';
      layer.preset = 'wave';
      layer.fontSize = 72;
      layer.depth = 40;
      layer.rotX = 25;
      layer.rotY = 0;
      layer.frontColor = '#ffffff';
      layer.extrudeColor = '#9d4edd';
      layer.highlightColor = '#ff007f';
      layer.bloom = true;
      layer.bloomIntensity = 0.65;
      return comp;
    },
  },
  {
    id: 'minimalist',
    name: 'Minimalist Mono 3D',
    description: 'Pure bright white typography against infinite black void, 3D rotation',
    create: () => {
      const comp = createDefaultComposition();
      comp.name = 'Minimalist Mono 3D';
      comp.duration = 4.0;
      const layer = comp.layers[0];
      layer.text = 'ASCII\nTYPOGRAPHY';
      layer.preset = 'rotation3d';
      layer.fontSize = 58;
      layer.depth = 32;
      layer.frontColor = '#ffffff';
      layer.extrudeColor = '#4a5568';
      layer.highlightColor = '#ffffff';
      layer.bloom = false;
      layer.scanlines = false;
      return comp;
    },
  },
  {
    id: 'glitchShatter',
    name: 'Glitch & Shatter',
    description: 'Explosive polygonal shard fragmentation and chromatic RGB displacement',
    create: () => {
      const comp = createDefaultComposition();
      comp.name = 'Glitch & Shatter';
      comp.duration = 4.5;
      const layer = comp.layers[0];
      layer.text = 'FRAGMENT';
      layer.preset = 'shatter';
      layer.fontSize = 74;
      layer.depth = 45;
      layer.frontColor = '#ffffff';
      layer.extrudeColor = '#ff3366';
      layer.highlightColor = '#ffff00';
      layer.glitchIntensity = 0.4;
      layer.bloom = true;
      return comp;
    },
  },
];

export class StudioProjectStore {
  static saveToLocalStorage(comp) {
    try {
      if (typeof localStorage === 'undefined') return;
      // Don't serialize heavy decoded audio buffers
      const toSave = { ...comp, audio: comp.audio ? { name: comp.audio.name, duration: comp.audio.duration } : null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('[StudioProjectStore] Autosave failed:', e);
    }
  }

  static loadFromLocalStorage() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return validateAndSanitizeProject(parsed);
      }
    } catch (e) {
      console.warn('[StudioProjectStore] Restore failed:', e);
    }
    return null;
  }

  static exportToJson(comp) {
    const toSave = { ...comp, audio: null };
    const jsonStr = JSON.stringify(toSave, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${comp.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.ascii-project.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  static async importFromJson(file) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON file format.');
    }
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid project file: root must be an object.');
    }
    return validateAndSanitizeProject(data);
  }
}

/**
 * Strict schema validator and sanitizer for composition data
 */
export function validateAndSanitizeProject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid project: root must be a JSON object.');
  }

  const safeStr = (v, maxLen = 100, fallback = '') => {
    if (typeof v !== 'string') return fallback;
    return v.replace(/[<>]/g, '').slice(0, maxLen);
  };

  const safeNum = (v, min, max, fallback) => {
    if (typeof v !== 'number' || !isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
  };

  const safeColor = (c, fallback = '#ffffff') => {
    if (typeof c === 'string' && (/^#[0-9a-fA-F]{3,8}$/.test(c) || /^rgba?\([0-9,.\s]+\)$/.test(c))) {
      return c.slice(0, 40);
    }
    return fallback;
  };

  const duration = safeNum(raw.duration, 0.5, 600, 5.0);

  const sanitized = {
    id: safeStr(raw.id, 64, 'comp-' + Date.now()),
    name: safeStr(raw.name, 100, 'Untitled 3D ASCII Animation'),
    duration,
    fps: safeNum(Math.round(raw.fps), 1, 120, 30),
    aspectRatio: typeof raw.aspectRatio === 'string' && raw.aspectRatio in ASPECT_RATIOS ? raw.aspectRatio : '16:9',
    width: safeNum((Math.round(raw.width) + 1) & ~1, 128, 4096, 1920),
    height: safeNum((Math.round(raw.height) + 1) & ~1, 128, 4096, 1080),
    currentTime: 0.0,
    isPlaying: false,
    loop: typeof raw.loop === 'boolean' ? raw.loop : true,
    bgMode: ['black', 'transparent', 'custom'].includes(raw.bgMode) ? raw.bgMode : 'black',
    bgColor: safeColor(raw.bgColor, '#060608'),
    syncToBeat: Boolean(raw.syncToBeat),
    charSet: safeStr(raw.charSet, 30, 'standard'),
    colorMode: safeStr(raw.colorMode, 20, 'truecolor'),
    asciiCols: safeNum(Math.round(raw.asciiCols), 20, 400, 120),
    dithering: ['none', 'bayer', 'floyd', 'atkinson'].includes(raw.dithering) ? raw.dithering : 'none',
    enableEdgeDetection: typeof raw.enableEdgeDetection === 'boolean' ? raw.enableEdgeDetection : true,
    asciiEngineMode: typeof raw.asciiEngineMode === 'boolean' ? raw.asciiEngineMode : true,
    zoom: 1.0,
    layers: [],
  };

  if (!Array.isArray(raw.layers) || raw.layers.length === 0) {
    sanitized.layers = [createDefaultLayer('layer-1', 'ASCII 3D STUDIO', 0, sanitized.duration)];
    sanitized.selectedLayerId = sanitized.layers[0].id;
    return sanitized;
  }

  sanitized.layers = raw.layers.slice(0, 50).map((l, idx) => {
    if (!l || typeof l !== 'object') {
      return createDefaultLayer(`layer-${idx + 1}`, 'Text Layer', 0, sanitized.duration);
    }

    const defaultL = createDefaultLayer(`layer-${idx + 1}`);

    return {
      id: safeStr(l.id, 64, `layer-${idx + 1}`),
      name: safeStr(l.name, 50, 'Text Layer'),
      text: typeof l.text === 'string' ? l.text.slice(0, 200000) : 'Text',
      visible: typeof l.visible === 'boolean' ? l.visible : true,
      locked: Boolean(l.locked),
      startTime: safeNum(l.startTime, 0, sanitized.duration, 0),
      duration: safeNum(l.duration, 0.1, sanitized.duration, sanitized.duration),

      fontFamily: safeStr(l.fontFamily, 100, defaultL.fontFamily),
      fontSize: safeNum(Math.round(l.fontSize), 8, 300, 58),
      fontWeight: safeStr(l.fontWeight, 20, 'bold'),
      lineHeight: safeNum(l.lineHeight, 0.5, 3.0, 1.25),
      letterSpacing: safeNum(l.letterSpacing, -10, 50, 3),
      textAlign: ['left', 'center', 'right'].includes(l.textAlign) ? l.textAlign : 'center',

      posX: safeNum(l.posX, -4000, 4000, 0),
      posY: safeNum(l.posY, -4000, 4000, 0),
      posZ: safeNum(l.posZ, -4000, 4000, 0),
      rotX: safeNum(l.rotX, -360, 360, 18),
      rotY: safeNum(l.rotY, -360, 360, -22),
      rotZ: safeNum(l.rotZ, -360, 360, 0),
      scale: safeNum(l.scale, 0.05, 10, 1.0),

      depth: safeNum(l.depth, 0, 200, 36),
      slices: safeNum(Math.round(l.slices), 2, 40, 14),
      perspective: safeNum(l.perspective, 100, 3000, 750),
      cameraZ: safeNum(l.cameraZ, -2000, 2000, 0),

      charSet: safeStr(l.charSet, 30, 'standard'),
      customChars: safeStr(l.customChars, 100, ''),
      invertChars: Boolean(l.invertChars),
      colorMode: safeStr(l.colorMode, 20, 'truecolor'),
      asciiCols: safeNum(Math.round(l.asciiCols), 20, 400, 120),
      dithering: ['none', 'bayer', 'floyd', 'atkinson'].includes(l.dithering) ? l.dithering : 'none',
      enableEdgeDetection: typeof l.enableEdgeDetection === 'boolean' ? l.enableEdgeDetection : true,
      asciiEngineMode: typeof l.asciiEngineMode === 'boolean' ? l.asciiEngineMode : true,
      charDensity: safeNum(l.charDensity, 0.1, 5, 1.0),
      asciiTextureMode: typeof l.asciiTextureMode === 'boolean' ? l.asciiTextureMode : true,

      frontColor: safeColor(l.frontColor, '#ffffff'),
      extrudeColor: safeColor(l.extrudeColor, '#3a7bd5'),
      highlightColor: safeColor(l.highlightColor, '#00ffff'),

      lightDirX: safeNum(l.lightDirX, -1, 1, 0.5),
      lightDirY: safeNum(l.lightDirY, -1, 1, -0.8),
      lightDirZ: safeNum(l.lightDirZ, -1, 1, 0.9),
      ambientLight: safeNum(l.ambientLight, 0, 1, 0.35),

      scanlines: typeof l.scanlines === 'boolean' ? l.scanlines : true,
      scanlineIntensity: safeNum(l.scanlineIntensity, 0, 1, 0.35),
      bloom: typeof l.bloom === 'boolean' ? l.bloom : true,
      bloomRadius: safeNum(l.bloomRadius, 1, 40, 10),
      bloomIntensity: safeNum(l.bloomIntensity, 0, 2, 0.5),
      shadow: typeof l.shadow === 'boolean' ? l.shadow : true,
      glitchIntensity: safeNum(l.glitchIntensity, 0, 1, 0.0),

      preset: safeStr(l.preset, 50, 'cinematicReveal'),
      presetSpeed: safeNum(l.presetSpeed, 0.1, 5.0, 1.0),
      presetEasing: safeStr(l.presetEasing, 50, 'easeInOutCubic'),
      loop: Boolean(l.loop),
      keyframes: [],
    };
  });

  sanitized.selectedLayerId = sanitized.layers[0].id;
  return sanitized;
}
