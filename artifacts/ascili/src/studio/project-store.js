/**
 * Project Store, Local Storage Autosave, JSON Import/Export, and Templates
 */

import { createDefaultComposition, createDefaultLayer } from './types.js';

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
      // Don't serialize heavy decoded audio buffers
      const toSave = { ...comp, audio: comp.audio ? { name: comp.audio.name, duration: comp.audio.duration } : null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('[StudioProjectStore] Autosave failed:', e);
    }
  }

  static loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.layers)) {
        return parsed;
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
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.layers)) {
      throw new Error('Invalid project file format: missing layers array.');
    }
    return data;
  }
}
