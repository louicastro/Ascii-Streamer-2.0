/**
 * 3D ASCII Typography & Video Animation Studio — Data Models & Defaults
 */

export const ASPECT_RATIOS = {
  '16:9':   { label: '16:9 Landscape (YouTube, Twitch)', ratio: 16 / 9, defaultW: 1920, defaultH: 1080 },
  '9:16':   { label: '9:16 Vertical (Shorts, TikTok, Reels)', ratio: 9 / 16, defaultW: 1080, defaultH: 1920 },
  '1:1':    { label: '1:1 Square (Instagram, Feed)', ratio: 1, defaultW: 1080, defaultH: 1080 },
  '4:5':    { label: '4:5 Portrait (Instagram Posts)', ratio: 4 / 5, defaultW: 1080, defaultH: 1350 },
  '4:3':    { label: '4:3 Classic (Retro TV, CRT)', ratio: 4 / 3, defaultW: 1440, defaultH: 1080 },
  '21:9':   { label: '21:9 Ultrawide (Cinematic)', ratio: 21 / 9, defaultW: 2560, defaultH: 1080 },
  'custom': { label: 'Custom Dimensions', ratio: 16 / 9, defaultW: 1280, defaultH: 720 },
};

export const RESOLUTION_PRESETS = {
  '480p':  { label: '480p (Fast / Draft)',  scale: 0.444 },
  '720p':  { label: '720p HD (Balanced)',   scale: 0.666 },
  '1080p': { label: '1080p Full HD (Pro)',  scale: 1.0 },
  '1440p': { label: '1440p 2K (Crisp)',     scale: 1.333 },
  '4k':    { label: '4K Ultra HD (Master)', scale: 2.0 },
};

export const FPS_OPTIONS = [24, 25, 30, 50, 60];

export const PRESET_CATEGORIES = {
  reveals: ['typewriter', 'characterReveal', 'scanlineReveal', 'cinematicReveal', 'horizontalSweep', 'verticalSweep'],
  transforms: ['zoomIn', 'zoomOut', 'rotation3d', 'loopAnimation'],
  explosions: ['dissolve', 'particleScatter', 'shatter', 'glitch', 'ripple', 'wave'],
  lighting: ['neonGlow', 'fadeIn', 'fadeOut', 'digitalRain'],
};

export const PRESET_LABELS = {
  typewriter:       '1. Typewriter Reveal',
  characterReveal:  '2. Character Reveal',
  zoomIn:           '3. 3D Zoom In',
  zoomOut:          '4. 3D Zoom Out',
  rotation3d:       '5. 3D Tumbling Rotation',
  dissolve:         '6. ASCII Dissolve',
  particleScatter:  '7. Particle Scatter',
  glitch:           '8. Chromatic Glitch',
  wave:             '9. 3D Sine Wave',
  fadeIn:           '10. Fade In & Settle',
  fadeOut:          '11. Fade Out',
  scanlineReveal:   '12. CRT Scanline Sweep',
  neonGlow:         '13. Neon Luminescence',
  cinematicReveal:  '14. Cinematic Lighting Pass',
  horizontalSweep:  '15. Horizontal Sweep',
  verticalSweep:    '16. Matrix Vertical Cascade',
  ripple:           '17. Radial Shockwave Ripple',
  shatter:          '18. Polyhedral Shatter',
  digitalRain:      '19. Digital Code Rain',
  loopAnimation:    '20. Seamless 3D Loop',
};

export const EASING_OPTIONS = [
  'linear',
  'easeInQuad',
  'easeOutQuad',
  'easeInOutQuad',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeOutBounce',
  'easeOutElastic',
];

export const FONT_OPTIONS = [
  { label: 'JetBrains Mono (Modern Dev)', value: "'JetBrains Mono', monospace" },
  { label: 'Courier New (Terminal Classic)', value: "'Courier New', monospace" },
  { label: 'Fira Code (Ligature Tech)', value: "'Fira Code', monospace" },
  { label: 'Consolas (Windows Matrix)', value: "'Consolas', monospace" },
  { label: 'Impact / Heavy (Title Block)', value: "Impact, 'Arial Black', sans-serif" },
  { label: 'System Monospace', value: "monospace" },
];

export function createDefaultLayer(id = 'layer-1', text = 'ASCII 3D STUDIO', startTime = 0, duration = 5) {
  return {
    id,
    name: text.slice(0, 18) || 'Text Layer',
    text,
    visible: true,
    locked: false,
    startTime,
    duration,

    // Typography
    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    fontSize: 58,
    fontWeight: 'bold',
    lineHeight: 1.25,
    letterSpacing: 3,
    textAlign: 'center',

    // 3D Transform
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: 18,    // degrees Pitch
    rotY: -22,   // degrees Yaw
    rotZ: 0,     // degrees Roll
    scale: 1.0,

    // Extrusion & Depth
    depth: 36,           // depth extrusion extent in 3D units
    slices: 14,          // number of geometric slices along the depth axis
    perspective: 750,    // focal perspective FOV distance
    cameraZ: 0,          // camera distance offset

    // Shading & Material
    charSet: 'standard', // 'standard', 'extended', 'block', 'minimal', 'braille', 'matrix', 'cyberpunk', 'custom'
    customChars: '',
    invertChars: false,
    charDensity: 1.0,    // grid cell density multiplier
    frontColor: '#ffffff',
    extrudeColor: '#3a7bd5',
    highlightColor: '#00ffff',
    lightDirX: 0.5,
    lightDirY: -0.8,
    lightDirZ: 0.9,
    ambientLight: 0.35,

    // Scanlines, Glow & FX
    scanlines: true,
    scanlineIntensity: 0.35,
    scanlineFrequency: 2.0,
    bloom: true,
    bloomRadius: 10,
    bloomIntensity: 0.5,
    shadow: true,
    shadowBlur: 16,
    shadowColor: 'rgba(0, 0, 0, 0.85)',
    glitchIntensity: 0.0,
    particleDispersion: 0.0,

    // Background
    bgMode: 'black',     // 'black', 'transparent', 'custom'
    bgColor: '#060608',

    // Animation Preset
    preset: 'cinematicReveal',
    presetSpeed: 1.0,
    presetEasing: 'easeInOutCubic',
    loop: false,

    // Keyframes: array of { id, time, prop, value, easing }
    keyframes: [],
  };
}

export function createDefaultComposition() {
  const defaultLayer = createDefaultLayer('layer-1', 'ASCII 3D STUDIO', 0, 5);
  return {
    id: 'comp-' + Date.now(),
    name: '3D ASCII Motion Graphics',
    duration: 5.0, // seconds
    fps: 30,
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    layers: [defaultLayer],
    selectedLayerId: defaultLayer.id,
    currentTime: 0.0,
    isPlaying: false,
    loop: true,
    audio: null, // { name, url, duration, buffer, beatTimes: [] }
    syncToBeat: false,
    beatSensitivity: 0.65,
    zoom: 1.0,
  };
}
