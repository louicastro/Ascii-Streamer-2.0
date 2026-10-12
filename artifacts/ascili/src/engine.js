// ─── Character Sets ────────────────────────────────────────────────────────

export const CHAR_SETS = {
  standard:  ' .:-=+*#%@',
  extended:  ' .\'`^",:;Il!i><~+_-?][}{1)(|\\tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  block:     ' \u2591\u2592\u2593\u2588',
  minimal:   ' .oO0',
  braille:   ' \u2801\u2802\u2803\u2804\u2808\u280a\u280b\u280c\u2810\u2813\u2814\u2818\u281b\u281c\u2820\u2828\u2830\u2838\u2840\u2848\u2850\u2858\u2860\u2868\u2870\u2880\u2881\u2882\u2884\u2888\u2890\u2898\u28a0\u28a8\u28b0\u28b8\u28c0\u28c8\u28d0\u28d8\u28e0\u28e8\u28f0\u28f8',
  matrix:    ' .:=+*#MW&8%B@$',
};

// ─── ANSI Colour Tables (shared with exporter) ─────────────────────────────

export const ANSI16 = [
  [0,0,0],[128,0,0],[0,128,0],[128,128,0],
  [0,0,128],[128,0,128],[0,128,128],[192,192,192],
  [128,128,128],[255,0,0],[0,255,0],[255,255,0],
  [0,0,255],[255,0,255],[0,255,255],[255,255,255],
];

// Precompute the full 256-colour palette for fast nearest-colour lookup
export const ANSI256 = (() => {
  const t = [];
  for (const c of ANSI16) t.push(c);
  const lvl = [0,95,135,175,215,255];
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++)
        t.push([lvl[r],lvl[g],lvl[b]]);
  for (let i = 0; i < 24; i++) { const v = 8 + i*10; t.push([v,v,v]); }
  return t;
})();

// ─── Colour Helpers ────────────────────────────────────────────────────────

export function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

export function closestRgb(palette, r, g, b) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const pr = palette[i][0], pg = palette[i][1], pb = palette[i][2];
    const d = (r-pr)**2 + (g-pg)**2 + (b-pb)**2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return palette[best];
}

// Build color lookup tables only when an ANSI export first needs them. This
// avoids several million distance checks and about 6 MiB of allocations at startup.
function buildAnsiLookupTable(palette) {
  const lut = new Uint8Array(32 * 32 * 32 * 3);
  for (let r = 0; r < 32; r++) {
    const vr = (r * 255 / 31) | 0;
    for (let g = 0; g < 32; g++) {
      const vg = (g * 255 / 31) | 0;
      for (let b = 0; b < 32; b++) {
        const vb = (b * 255 / 31) | 0;
        const [cr, cg, cb] = closestRgb(palette, vr, vg, vb);
        const idx = ((r << 10) | (g << 5) | b) * 3;
        lut[idx]     = cr;
        lut[idx + 1] = cg;
        lut[idx + 2] = cb;
      }
    }
  }
  return lut;
}

export let ANSI16_LUT = null;
export let ANSI256_LUT = null;

export function getAnsiColorLut(mode) {
  if (mode === 'ansi16') {
    if (!ANSI16_LUT) ANSI16_LUT = buildAnsiLookupTable(ANSI16);
    return ANSI16_LUT;
  }
  if (mode === 'ansi256') {
    if (!ANSI256_LUT) ANSI256_LUT = buildAnsiLookupTable(ANSI256);
    return ANSI256_LUT;
  }
  return null;
}

// ─── Image Adjustments ───────────────────────────────────────────────────────

export function adjustPixel(r, g, b, brightness, contrast, gamma, saturation) {
  if (brightness !== 0) {
    const d = brightness * 2.55;
    r += d; g += d; b += d;
  }

  if (contrast !== 0) {
    const f = (259 * (contrast + 255)) / (255 * (259 - contrast));
    r = f * (r - 128) + 128;
    g = f * (g - 128) + 128;
    b = f * (b - 128) + 128;
  }

  if (saturation !== 0) {
    const gray = 0.299*r + 0.587*g + 0.114*b;
    const s = (saturation + 100) / 100;
    r = gray + s*(r - gray);
    g = gray + s*(g - gray);
    b = gray + s*(b - gray);
  }

  if (gamma !== 0) {
    const gv = gamma > 0 ? 1/(1 + gamma/100) : 1 + Math.abs(gamma)/100;
    r = 255 * Math.pow(clamp(r)/255, gv);
    g = 255 * Math.pow(clamp(g)/255, gv);
    b = 255 * Math.pow(clamp(b)/255, gv);
  }

  return [clamp(r), clamp(g), clamp(b)];
}

const ESC = { '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#39;' };
function esc(ch) { return ESC[ch] || ch; }

function hexToRgbVec3(hex) {
  if (!hex || hex[0] !== '#') return [0.22, 1.0, 0.32];
  const r = parseInt(hex.slice(1, 3), 16) / 255.0;
  const g = parseInt(hex.slice(3, 5), 16) / 255.0;
  const b = parseInt(hex.slice(5, 7), 16) / 255.0;
  return [isNaN(r) ? 0.22 : r, isNaN(g) ? 1.0 : g, isNaN(b) ? 0.32 : b];
}

export function getGraphicsProfile() {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const gl = canvas ? (canvas.getContext('webgl2') || canvas.getContext('webgl')) : null;
  const userAgent = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(userAgent);
  const hardwareConcurrency = typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
    ? navigator.hardwareConcurrency
    : 4;

  let quality = 'high';
  let maxTextureSize = 0;
  if (!gl) {
    quality = 'fallback';
  } else {
    maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (mobile || hardwareConcurrency <= 4 || maxTextureSize < 4096) quality = 'balanced';
    if (hardwareConcurrency <= 2 || maxTextureSize < 2048) quality = 'low';
  }

  const profile = {
    hasWebGL: !!gl,
    quality,
    renderer: gl ? (gl.getParameter(gl.RENDERER) || 'unknown') : 'none',
    vendor: gl ? (gl.getParameter(gl.VENDOR) || 'unknown') : 'none',
    maxTextureSize,
    hardwareConcurrency,
    mobile,
  };
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return profile;
}

// ─── Character Glyph Atlas (256 Glyphs Offscreen Texture) ────────────────────

export class AsciliGlyphAtlas {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.cellW = 16;
    this.cellH = 28;
    this.cols = 16;
    this.rows = 16;
    this.canvas.width = this.cellW * this.cols;  // 256
    this.canvas.height = this.cellH * this.rows; // 448
    this.charMap = [];
    this.charToIdx = new Map();
    this.charCount = 0;
    this.lastCharSetKey = '';
    this.version = 0;
  }

  update(charSet) {
    const key = (typeof charSet === 'string') ? charSet : (Array.isArray(charSet) ? charSet.join('') : '');
    if (key === this.lastCharSetKey && this.charMap.length > 0) return false;
    this.lastCharSetKey = key;

    const chars = Array.from(key && key.length > 0 ? key : ' .:-=+*#%@');
    this.charCount = chars.length;
    const allChars = [...chars];
    const edgeChars = ['-', '|', '/', '\\', ' '];
    for (const ec of edgeChars) {
      if (!allChars.includes(ec)) allChars.push(ec);
    }

    this.charMap = allChars;
    this.charToIdx.clear();
    for (let i = 0; i < allChars.length; i++) {
      this.charToIdx.set(allChars[i], i);
    }

    const { ctx, canvas, cellW, cellH, cols } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(cellH * 0.72)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < allChars.length; i++) {
      const ch = allChars[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW + cellW * 0.5;
      const y = row * cellH + cellH * 0.5;
      ctx.fillText(ch, x, y);
    }

    this.version++;
    return true;
  }

  getRampData(invertChars = false) {
    const ramp = new Uint8Array(256);
    const n = this.charCount;
    if (n <= 0) return ramp;
    for (let i = 0; i < 256; i++) {
      const lum = i / 255.0;
      let ci = (lum * (n - 1) + 0.5) | 0;
      if (ci >= n) ci = n - 1;
      else if (ci < 0) ci = 0;
      if (invertChars) ci = (n - 1) - ci;
      ramp[i] = ci;
    }
    return ramp;
  }
}

// ─── GPU WebGL Fragment Shader ──────────────────────────────────────────────

const VS_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = (a_pos + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FS_SRC = `
precision mediump float;
varying vec2 v_uv;

uniform sampler2D u_video;
uniform sampler2D u_atlas;
uniform sampler2D u_ramp;

uniform vec2  u_gridSize;
uniform vec2  u_atlasGrid;
uniform int   u_colorMode;
uniform vec3  u_monoColor;
uniform int   u_scanlines;

uniform float u_brightness;
uniform float u_contrast;
uniform float u_gamma;
uniform float u_saturation;

uniform int   u_enableEdge;
uniform float u_edgeThresholdSq;
uniform float u_idxDash;
uniform float u_idxPipe;
uniform float u_idxSlash;
uniform float u_idxBackslash;

vec3 adjustColor(vec3 c) {
  if (u_brightness != 0.0) {
    c += u_brightness;
  }
  if (u_contrast != 0.0) {
    float cVal = u_contrast * 255.0;
    float f = (259.0 * (cVal + 255.0)) / (255.0 * (259.0 - cVal));
    c = (c - 0.5) * f + 0.5;
  }
  if (u_saturation != 0.0) {
    float gray = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(gray), c, 1.0 + u_saturation);
  }
  if (u_gamma != 0.0) {
    float gv = u_gamma > 0.0 ? 1.0 / (1.0 + u_gamma) : 1.0 + abs(u_gamma);
    c = pow(clamp(c, 0.0, 1.0), vec3(gv));
  }
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec2 cellCoord  = v_uv * u_gridSize;
  vec2 cellIndex  = floor(cellCoord);
  vec2 inCell     = fract(cellCoord);

  vec2 cellCenter = (cellIndex + 0.5) / u_gridSize;
  vec3 rawRgb     = texture2D(u_video, cellCenter).rgb;
  vec3 rgb        = adjustColor(rawRgb);
  float lum       = dot(rgb, vec3(0.299, 0.587, 0.114));

  float charIdx = -1.0;

  if (u_enableEdge == 1 && cellIndex.x > 0.0 && cellIndex.x < u_gridSize.x - 1.0 && cellIndex.y > 0.0 && cellIndex.y < u_gridSize.y - 1.0) {
    vec2 stepX = vec2(1.0 / u_gridSize.x, 0.0);
    vec2 stepY = vec2(0.0, 1.0 / u_gridSize.y);

    vec3 rgbR = adjustColor(texture2D(u_video, cellCenter + stepX).rgb);
    vec3 rgbL = adjustColor(texture2D(u_video, cellCenter - stepX).rgb);
    vec3 rgbD = adjustColor(texture2D(u_video, cellCenter + stepY).rgb);
    vec3 rgbU = adjustColor(texture2D(u_video, cellCenter - stepY).rgb);

    float lumR = dot(rgbR, vec3(0.299, 0.587, 0.114));
    float lumL = dot(rgbL, vec3(0.299, 0.587, 0.114));
    float lumD = dot(rgbD, vec3(0.299, 0.587, 0.114));
    float lumU = dot(rgbU, vec3(0.299, 0.587, 0.114));

    float gx = (lumR - lumL) * 0.5;
    float gy = (lumD - lumU) * 0.5;
    float magSq = gx * gx + gy * gy;

    if (magSq >= u_edgeThresholdSq) {
      float absGx = abs(gx);
      float absGy = abs(gy);
      if (absGy > 1.8 * absGx) {
        charIdx = u_idxDash;
      } else if (absGx > 1.8 * absGy) {
        charIdx = u_idxPipe;
      } else {
        charIdx = (gx * gy > 0.0) ? u_idxBackslash : u_idxSlash;
      }
    }
  }

  if (charIdx < 0.0) {
    charIdx = floor(texture2D(u_ramp, vec2(lum, 0.5)).r * 255.0 + 0.5);
  }

  float atlasCols = u_atlasGrid.x;
  float atlasCol  = mod(charIdx, atlasCols);
  float atlasRow  = floor(charIdx / atlasCols);
  vec2 atlasUV    = (vec2(atlasCol, atlasRow) + inCell) / u_atlasGrid;

  float glyphAlpha = texture2D(u_atlas, atlasUV).a;

  vec3 color = rgb;
  if (u_colorMode == 0) {
    color = u_monoColor;
  } else if (u_colorMode == 1) {
    color = vec3(lum);
  } else if (u_colorMode == 2 || u_colorMode == 3) {
    color = floor(rgb * 5.0 + 0.5) / 5.0;
  }

  vec3 finalColor = color * glyphAlpha;

  if (u_scanlines == 1) {
    float scan = sin(gl_FragCoord.y * 1.5) * 0.15;
    finalColor = max(vec3(0.0), finalColor - scan);
  }

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

function createWebGL2ShaderSources() {
  const vertex = `#version 300 es\n${VS_SRC
    .replace(/\battribute\b/g, 'in')
    .replace(/\bvarying\b/g, 'out')}`;
  const fragment = `#version 300 es\n${FS_SRC
    .replace(/\bvarying\b/g, 'in')
    .replace(/\btexture2D\b/g, 'texture')
    .replace('precision mediump float;', 'precision mediump float;\nout vec4 fragColor;')
    .replace(/\bgl_FragColor\b/g, 'fragColor')}`;
  return { vertex, fragment };
}

export class AsciliWebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    this.isWebGL2 = Boolean(this.gl);
    this.gl ||= canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    this.supported = !!this.gl;
    this.profile = null;
    if (!this.supported) return;

    const gl = this.gl;
    this._timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2') ||
      gl.getExtension('EXT_disjoint_timer_query');
    this._gpuQuery = null;
    this._gpuQueryActive = false;
    this.gpuTimeMs = null;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    const quadVertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
    this._quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const shaders = this.isWebGL2 ? createWebGL2ShaderSources() : { vertex: VS_SRC, fragment: FS_SRC };
    this._program = this._createProgram(gl, shaders.vertex, shaders.fragment);
    if (!this._program) {
      this.supported = false;
      return;
    }

    this._aPos             = gl.getAttribLocation(this._program, 'a_pos');
    this._uVideo           = gl.getUniformLocation(this._program, 'u_video');
    this._uAtlas           = gl.getUniformLocation(this._program, 'u_atlas');
    this._uRamp            = gl.getUniformLocation(this._program, 'u_ramp');
    this._uGridSize        = gl.getUniformLocation(this._program, 'u_gridSize');
    this._uAtlasGrid       = gl.getUniformLocation(this._program, 'u_atlasGrid');
    this._uColorMode       = gl.getUniformLocation(this._program, 'u_colorMode');
    this._uMonoColor       = gl.getUniformLocation(this._program, 'u_monoColor');
    this._uScanlines       = gl.getUniformLocation(this._program, 'u_scanlines');

    this._uBrightness      = gl.getUniformLocation(this._program, 'u_brightness');
    this._uContrast        = gl.getUniformLocation(this._program, 'u_contrast');
    this._uGamma           = gl.getUniformLocation(this._program, 'u_gamma');
    this._uSaturation      = gl.getUniformLocation(this._program, 'u_saturation');

    this._uEnableEdge      = gl.getUniformLocation(this._program, 'u_enableEdge');
    this._uEdgeThresholdSq = gl.getUniformLocation(this._program, 'u_edgeThresholdSq');
    this._uIdxDash         = gl.getUniformLocation(this._program, 'u_idxDash');
    this._uIdxPipe         = gl.getUniformLocation(this._program, 'u_idxPipe');
    this._uIdxSlash        = gl.getUniformLocation(this._program, 'u_idxSlash');
    this._uIdxBackslash    = gl.getUniformLocation(this._program, 'u_idxBackslash');

    this._texVideo = gl.createTexture();
    this._texAtlas = gl.createTexture();
    this._texRamp  = gl.createTexture();

    this._setupTexture(this._texVideo, gl.LINEAR);
    this._setupTexture(this._texAtlas, gl.LINEAR);
    this._setupTexture(this._texRamp,  gl.NEAREST);

    this._lastAtlasVer = -1;
    this._lastRampKey  = '';
    this._lastVideoW   = 0;
    this._lastVideoH   = 0;
  }

  _setupTexture(tex, filter) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  _createProgram(gl, vsSrc, fsSrc) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return null;

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    return prog;
  }

  renderDirect(sourceEl, cols, rows, atlas, config) {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return false;

    this._pollGpuTimer();
    this._beginGpuTimer();

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this._program);

    const vw = sourceEl.videoWidth || sourceEl.width || 640;
    const vh = sourceEl.videoHeight || sourceEl.height || 480;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texVideo);
    if (this._lastVideoW !== vw || this._lastVideoH !== vh) {
      this._lastVideoW = vw;
      this._lastVideoH = vh;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, vw, vh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    try {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sourceEl);
    } catch {
      this._endGpuTimer();
      return false;
    }

    if (this._lastAtlasVer !== atlas.version) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._texAtlas);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
      this._lastAtlasVer = atlas.version;
    }

    const rampKey = `${atlas.version}_${config.invertChars}`;
    if (this._lastRampKey !== rampKey) {
      const rampData = atlas.getRampData(config.invertChars);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this._texRamp);
      if (this.isWebGL2) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, rampData);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, rampData);
      }
      this._lastRampKey = rampKey;
    }

    gl.uniform1i(this._uVideo, 0);
    gl.uniform1i(this._uAtlas, 1);
    gl.uniform1i(this._uRamp,  2);

    gl.uniform2f(this._uGridSize, cols, rows);
    gl.uniform2f(this._uAtlasGrid, atlas.cols, atlas.rows);

    const mode = config.colorMode === 'monochrome' ? 0
               : config.colorMode === 'grayscale'  ? 1
               : config.colorMode === 'ansi16'     ? 2
               : config.colorMode === 'ansi256'    ? 3
               : 4;
    gl.uniform1i(this._uColorMode, mode);

    const monoRgb = hexToRgbVec3(config.monoColor);
    gl.uniform3f(this._uMonoColor, monoRgb[0], monoRgb[1], monoRgb[2]);
    gl.uniform1i(this._uScanlines, config.scanlines ? 1 : 0);

    gl.uniform1f(this._uBrightness, (config.brightness || 0) / 100.0);
    gl.uniform1f(this._uContrast,   (config.contrast || 0) / 100.0);
    gl.uniform1f(this._uGamma,      (config.gamma || 0) / 100.0);
    gl.uniform1f(this._uSaturation, (config.saturation || 0) / 100.0);

    const quality = this.profile?.quality || 'high';
    const edgeEnabled = (config.enableEdgeDetection ?? true) &&
      quality !== 'low' &&
      cols * rows <= 250_000 && atlas.charCount >= 5 && rows > 2 && cols > 2;
    gl.uniform1i(this._uEnableEdge, edgeEnabled ? 1 : 0);
    const eth = config.edgeThreshold ?? 0.16;
    gl.uniform1f(this._uEdgeThresholdSq, eth * eth);

    gl.uniform1f(this._uIdxDash,      atlas.charToIdx.get('-') ?? 0);
    gl.uniform1f(this._uIdxPipe,      atlas.charToIdx.get('|') ?? 0);
    gl.uniform1f(this._uIdxSlash,     atlas.charToIdx.get('/') ?? 0);
    gl.uniform1f(this._uIdxBackslash, atlas.charToIdx.get('\\') ?? 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf);
    gl.enableVertexAttribArray(this._aPos);
    gl.vertexAttribPointer(this._aPos, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this._endGpuTimer();
    return true;
  }

  _beginGpuTimer() {
    if (!this._timerExt || this._gpuQuery) return;
    const gl = this.gl;
    try {
      if (typeof gl.createQuery === 'function') {
        this._gpuQuery = { query: gl.createQuery(), webgl2: true };
        gl.beginQuery(this._timerExt.TIME_ELAPSED_EXT, this._gpuQuery.query);
      } else {
        this._gpuQuery = { query: this._timerExt.createQueryEXT(), webgl2: false };
        this._timerExt.beginQueryEXT(this._timerExt.TIME_ELAPSED_EXT, this._gpuQuery.query);
      }
      this._gpuQueryActive = true;
    } catch { this._gpuQuery = null; this._gpuQueryActive = false; }
  }

  _endGpuTimer() {
    if (!this._gpuQuery || !this._gpuQueryActive) return;
    try {
      if (this._gpuQuery.webgl2) this.gl.endQuery(this._timerExt.TIME_ELAPSED_EXT);
      else this._timerExt.endQueryEXT(this._timerExt.TIME_ELAPSED_EXT);
      this._gpuQueryActive = false;
    } catch {
      this._deleteGpuQuery();
    }
  }

  _pollGpuTimer() {
    if (!this._gpuQuery) return;
    const { gl, _timerExt: ext } = this;
    try {
      const available = this._gpuQuery.webgl2
        ? gl.getQueryParameter(this._gpuQuery.query, gl.QUERY_RESULT_AVAILABLE)
        : ext.getQueryObjectEXT(this._gpuQuery.query, ext.QUERY_RESULT_AVAILABLE_EXT);
      if (!available) return;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      const nanoseconds = this._gpuQuery.webgl2
        ? gl.getQueryParameter(this._gpuQuery.query, gl.QUERY_RESULT)
        : ext.getQueryObjectEXT(this._gpuQuery.query, ext.QUERY_RESULT_EXT);
      if (!disjoint && Number.isFinite(nanoseconds)) this.gpuTimeMs = nanoseconds / 1e6;
    } catch { /* Timer queries are optional and may be unavailable on some GPUs. */ }
    this._deleteGpuQuery();
  }

  _deleteGpuQuery() {
    if (!this._gpuQuery) return;
    try {
      if (this._gpuQuery.webgl2) this.gl.deleteQuery(this._gpuQuery.query);
      else this._timerExt.deleteQueryEXT(this._gpuQuery.query);
    } catch { /* Context may have been lost. */ }
    this._gpuQuery = null;
    this._gpuQueryActive = false;
  }
}

// ─── High-Speed Canvas 2D Fallback Renderer ──────────────────────────────────

export class AsciliCanvas2DRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas 2D is unavailable');
  }

  render(cols, rows, charGrid, colorGrid, atlas, isMono, monoColorHex, fontSize = 10) {
    const { ctx, canvas } = this;
    const charW = fontSize * 0.601;
    const charH = fontSize;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fontSize}px "Courier New", monospace`;
    ctx.textBaseline = 'top';

    const charMap = atlas.charMap;

    if (isMono) {
      ctx.fillStyle = monoColorHex;
      for (let r = 0; r < rows; r++) {
        let line = '';
        const offset = r * cols;
        for (let c = 0; c < cols; c++) {
          line += charMap[charGrid[offset + c]] || ' ';
        }
        ctx.fillText(line, 0, r * charH);
      }
    } else {
      for (let r = 0; r < rows; r++) {
        const offset = r * cols;
        let run = '';
        let runStart = 0;
        let lastR = -1, lastG = -1, lastB = -1;

        for (let c = 0; c < cols; c++) {
          const idx = offset + c;
          const p3  = idx * 3;
          const cr  = colorGrid[p3];
          const cg  = colorGrid[p3 + 1];
          const cb  = colorGrid[p3 + 2];
          const ch  = charMap[charGrid[idx]] || ' ';

          if (cr === lastR && cg === lastG && cb === lastB) {
            run += ch;
          } else {
            if (run.length > 0) {
              ctx.fillStyle = `rgb(${lastR},${lastG},${lastB})`;
              ctx.fillText(run, runStart * charW, r * charH);
            }
            run = ch;
            runStart = c;
            lastR = cr;
            lastG = cg;
            lastB = cb;
          }
        }
        if (run.length > 0) {
          ctx.fillStyle = `rgb(${lastR},${lastG},${lastB})`;
          ctx.fillText(run, runStart * charW, r * charH);
        }
      }
    }
    return true;
  }
}

class AsciliCanvasWorkerRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas 2D is unavailable');
    this.busy = false;
    this.failed = !this.ctx;
    this.renderTimeMs = null;
    this.generation = 0;
    this.worker = new Worker(new URL('./canvas-renderer.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      if (data.generation !== this.generation) {
        data.bitmap?.close();
        return;
      }
      this.busy = false;
      if (data.error) this.failed = true;
      if (Number.isFinite(data.renderMs)) this.renderTimeMs = data.renderMs;
      if (data.bitmap) {
        this.ctx.drawImage(data.bitmap, 0, 0, this.canvas.width, this.canvas.height);
        data.bitmap.close();
      }
    };
    this.worker.onerror = () => { this.busy = false; this.failed = true; };
  }

  render(video, cols, rows, atlas, config) {
    if (this.failed || typeof createImageBitmap !== 'function') return false;
    if (this.busy) return true;
    const generation = this.generation;
    this.busy = true;
    createImageBitmap(video).then((frame) => {
      if (!this.busy || generation !== this.generation) { frame.close(); return; }
      this.worker.postMessage({
        frame, width: this.canvas.width, height: this.canvas.height,
        cols, rows, config, chars: atlas.charMap.slice(0, atlas.charCount), generation,
      }, [frame]);
    }).catch(() => {
      if (generation === this.generation) {
        this.busy = false;
        this.failed = true;
      }
    });
    return true;
  }

  reset() {
    this.generation++;
    this.busy = false;
  }
}

// ─── AsciliEngine (GPU Vision Engine - Sub-1.5ms, 2M Chars @ 120 FPS) ────────

export class AsciliEngine {
  constructor() {
    this._sampleCanvas  = document.createElement('canvas');
    this._sampleCtx     = this._sampleCanvas.getContext('2d', { willReadFrequently: true });
    this._atlas         = new AsciliGlyphAtlas();
    this._webgl         = null;
    this._gpuCanvas     = null;
    this._displayCtx    = null;
    this._canvas2d      = null;
    this._canvasWorker  = null;
    this._canvasWorkerFailed = false;
    this._currentTarget = null;
    this.hardwareProfile = getGraphicsProfile();

    this._lastCols      = 0;
    this._lastRows      = 0;
    this._lastConfig    = null;
    this._lastSource    = null;
    this._fallbackChars = new Uint8Array(0);
    this._fallbackColors = new Uint8Array(0);
    this._fallbackCapacity = 0;
    this._prevCharGrid = new Uint8Array(0);
  }

  get gpuCanvas() { return this._gpuCanvas; }

  renderFrame(videoEl, targetCanvas, config) {
    if (!videoEl) return { rows: 0, cols: 0, chars: 0 };

    const vw = videoEl.videoWidth  || videoEl.width  || 640;
    const vh = videoEl.videoHeight || videoEl.height || 480;
    const cellRatio = (vh / vw) * 0.45;
    const requestedCols = Math.min(1000, Math.max(20, Math.round(config.cols || 80)));
    const maxColsForSafeFrame = Math.floor(Math.sqrt(500_000 / Math.max(cellRatio, 0.01)));
    const cols = config.cols ? Math.min(1000, Math.max(20, Math.round(config.cols))) : Math.min(requestedCols, Math.max(20, maxColsForSafeFrame));

    const rows = config.rows ?? Math.max(1, Math.round(cols * (vh / vw) * 0.45));
    const totalCells = rows * cols;

    this._lastCols   = cols;
    this._lastRows   = rows;
    this._lastConfig = { ...config };
    this._lastSource = videoEl;

    this._atlas.update(config.charSet);

    if (targetCanvas instanceof HTMLCanvasElement) {
      if (this._currentTarget !== targetCanvas) {
        this._currentTarget = targetCanvas;
        // Keep the visible canvas 2D-capable so a shader/context failure can
        // always fall back and screenshots/recordings see the finished frame.
        this._displayCtx = targetCanvas.getContext('2d', { alpha: false });
        this._gpuCanvas = document.createElement('canvas');
        try {
          this._webgl = new AsciliWebGLRenderer(this._gpuCanvas);
          this._webgl.profile = this.hardwareProfile;
        } catch {
          this._webgl = null;
        }

        if (!this._webgl?.supported) this._webgl = null;
        if (!this._webgl) this._initFallbackRenderer(targetCanvas);
      }
      if (this._canvasWorker?.failed) {
        this._canvasWorker.worker.terminate();
        this._canvasWorker = null;
        this._canvasWorkerFailed = true;
      }

      // Prefer the GPU path; timer queries report GPU time asynchronously when supported.
      let rendered = false;
      if (this._webgl && this._webgl.supported) {
        if (this._gpuCanvas.width !== targetCanvas.width) this._gpuCanvas.width = targetCanvas.width;
        if (this._gpuCanvas.height !== targetCanvas.height) this._gpuCanvas.height = targetCanvas.height;
        try {
          rendered = this._webgl.renderDirect(videoEl, cols, rows, this._atlas, config);
          if (rendered && this._displayCtx) {
            this._displayCtx.drawImage(this._gpuCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
          }
        } catch {
          this._webgl = null;
          rendered = false;
        }
      }

      // If syncOnly is requested (e.g. video export), avoid asynchronous worker
      if (!rendered && !config.syncOnly && !this._canvasWorker && !this._canvas2d && totalCells <= 500_000) {
        this._initFallbackRenderer(targetCanvas);
      }
      if (!rendered && !config.syncOnly && this._canvasWorker && totalCells <= 500_000) {
        rendered = this._canvasWorker.render(videoEl, cols, rows, this._atlas, config);
      }
      if (!rendered && this._canvasWorker?.failed) {
        this._canvasWorker.worker.terminate();
        this._canvasWorker = null;
        this._canvasWorkerFailed = true;
        this._initFallbackRenderer(targetCanvas);
      }
      if (!rendered) {
        if (!this._canvas2d) {
          try { this._canvas2d = new AsciliCanvas2DRenderer(targetCanvas); } catch { this._canvas2d = null; }
        }
        if (this._canvas2d) {
          this._renderFallback2D(videoEl, cols, rows, config);
          rendered = true;
        }
      }
      if (!rendered) {
        return { rows, cols, chars: totalCells, rendered: false };
      }
    }

    return { rows, cols, chars: totalCells, rendered: true };
  }

  getPerformanceStats() {
    return {
      renderer: this._webgl?.supported ? 'webgl' : this._canvasWorker ? 'canvas-worker' : 'canvas-2d',
      gpuTimeMs: this._webgl?.gpuTimeMs ?? null,
      workerTimeMs: this._canvasWorker?.renderTimeMs ?? null,
    };
  }

  _initFallbackRenderer(targetCanvas) {
    if (this._canvasWorker || this._canvas2d) return;
    if (!this._canvasWorkerFailed && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
      try {
        this._canvasWorker = new AsciliCanvasWorkerRenderer(targetCanvas);
        if (this._canvasWorker.failed) {
          this._canvasWorker.worker.terminate();
          this._canvasWorker = null;
          this._canvasWorkerFailed = true;
        }
      } catch {
        this._canvasWorker = null;
        this._canvasWorkerFailed = true;
      }
    }
    if (!this._canvasWorker) {
      try { this._canvas2d = new AsciliCanvas2DRenderer(targetCanvas); }
      catch { this._canvas2d = null; }
    }
  }

  _renderFallback2D(videoEl, cols, rows, config) {
    if (this._sampleCanvas.width !== cols || this._sampleCanvas.height !== rows) {
      this._sampleCanvas.width  = cols;
      this._sampleCanvas.height = rows;
    }
    this._sampleCtx.drawImage(videoEl, 0, 0, cols, rows);
    let imgData;
    try { imgData = this._sampleCtx.getImageData(0, 0, cols, rows).data; } catch { return; }

    const cells = cols * rows;
    if (cells > this._fallbackCapacity) {
      this._fallbackChars = new Uint8Array(cells);
      this._fallbackCapacity = cells;
    }
    const isMono = config.colorMode === 'monochrome';
    if (!isMono && this._fallbackColors.length < cells * 3) {
      this._fallbackColors = new Uint8Array(cells * 3);
    }
    const charGrid = this._fallbackChars;
    const colorGrid = this._fallbackColors;
    const n = this._atlas.charCount;

    for (let i = 0; i < cells; i++) {
      const p4 = i * 4;
      const r = imgData[p4], g = imgData[p4+1], b = imgData[p4+2];
      const lum = (0.299*r + 0.587*g + 0.114*b) / 255.0;
      let ci = (lum * (n - 1) + 0.5) | 0;
      if (ci >= n) ci = n - 1; else if (ci < 0) ci = 0;
      if (config.invertChars) ci = (n - 1) - ci;
      charGrid[i] = ci;
      if (!isMono) {
        const p3 = i * 3;
        colorGrid[p3] = r; colorGrid[p3+1] = g; colorGrid[p3+2] = b;
      }
    }

    if (config.temporalStability !== false) {
      if (this._prevCharGrid.length !== cells) {
        this._prevCharGrid = new Uint8Array(cells);
      }
      for (let i = 0; i < cells; i++) {
        const prev = this._prevCharGrid[i];
        const current = charGrid[i];
        if (Math.abs(current - prev) <= 2) {
          charGrid[i] = Math.round((current + prev) * 0.5);
        }
      }
      this._prevCharGrid.set(charGrid);
    }

    this._canvas2d.render(cols, rows, charGrid, colorGrid, this._atlas, isMono, config.monoColor || '#39ff52', config.fontSize || 10);
  }

  async exportPlainTextAsync(onProgress) {
    const cols = this._lastCols;
    const rows = this._lastRows;
    const src  = this._lastSource;
    const cfg  = this._lastConfig || {};
    if (!cols || !rows || !src) return '';

    const off = document.createElement('canvas');
    off.width  = cols;
    off.height = rows;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(src, 0, 0, cols, rows);
    const imgData = octx.getImageData(0, 0, cols, rows).data;

    const chars = Array.from(cfg.charSet || CHAR_SETS.standard);
    const nChars = chars.length;
    const invert = cfg.invertChars || false;

    const lines = [];
    const chunkSize = 200;

    for (let r = 0; r < rows; r += chunkSize) {
      const endR = Math.min(rows, r + chunkSize);
      for (let cr = r; cr < endR; cr++) {
        let line = '';
        const offset = cr * cols;
        for (let c = 0; c < cols; c++) {
          const p4 = (offset + c) * 4;
          const lum = (0.299 * imgData[p4] + 0.587 * imgData[p4 + 1] + 0.114 * imgData[p4 + 2]) / 255.0;
          let ci = (lum * (nChars - 1) + 0.5) | 0;
          if (ci >= nChars) ci = nChars - 1; else if (ci < 0) ci = 0;
          if (invert) ci = (nChars - 1) - ci;
          line += chars[ci] ?? ' ';
        }
        lines.push(line);
      }
      onProgress?.(Math.round((endR / rows) * 100));
      if (endR < rows) await new Promise(res => setTimeout(res, 0));
    }

    return lines.join('\n');
  }

  async exportStyledHtmlAsync(options = {}, onProgress) {
    const cols = this._lastCols;
    const rows = this._lastRows;
    const src  = this._lastSource;
    const cfg  = this._lastConfig || {};
    if (!cols || !rows || !src) return '';

    const off = document.createElement('canvas');
    off.width  = cols;
    off.height = rows;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(src, 0, 0, cols, rows);
    const imgData = octx.getImageData(0, 0, cols, rows).data;

    const chars     = Array.from(cfg.charSet || CHAR_SETS.standard);
    const nChars    = chars.length;
    const invert    = cfg.invertChars || false;
    const isMono    = (cfg.colorMode || 'monochrome') === 'monochrome';
    const monoColor = options.monoColor || '#39ff52';
    const fontSize  = options.fontSize  || cfg.fontSize || 10;

    const htmlLines = [];
    const chunkSize = 150;

    for (let r = 0; r < rows; r += chunkSize) {
      const endR = Math.min(rows, r + chunkSize);
      for (let cr = r; cr < endR; cr++) {
        let line = '';
        const offset = cr * cols;
        if (isMono) {
          for (let c = 0; c < cols; c++) {
            const p4 = (offset + c) * 4;
            const lum = (0.299 * imgData[p4] + 0.587 * imgData[p4 + 1] + 0.114 * imgData[p4 + 2]) / 255.0;
            let ci = (lum * (nChars - 1) + 0.5) | 0;
            if (ci >= nChars) ci = nChars - 1; else if (ci < 0) ci = 0;
            if (invert) ci = (nChars - 1) - ci;
            line += esc(chars[ci] ?? ' ');
          }
        } else {
          let currColor = null;
          let currRun   = '';
          for (let c = 0; c < cols; c++) {
            const p4 = (offset + c) * 4;
            const red = imgData[p4], green = imgData[p4+1], blue = imgData[p4+2];
            const lum = (0.299 * red + 0.587 * green + 0.114 * blue) / 255.0;
            let ci = (lum * (nChars - 1) + 0.5) | 0;
            if (ci >= nChars) ci = nChars - 1; else if (ci < 0) ci = 0;
            if (invert) ci = (nChars - 1) - ci;
            const ch = esc(chars[ci] ?? ' ');
            const colorKey = `${red},${green},${blue}`;

            if (colorKey === currColor) {
              currRun += ch;
            } else {
              if (currColor !== null) {
                line += `<span style="color:rgb(${currColor})">${currRun}</span>`;
              }
              currColor = colorKey;
              currRun   = ch;
            }
          }
          if (currColor !== null) {
            line += `<span style="color:rgb(${currColor})">${currRun}</span>`;
          }
        }
        htmlLines.push(line);
      }
      onProgress?.(Math.round((endR / rows) * 100));
      if (endR < rows) await new Promise(res => setTimeout(res, 0));
    }

    const bg    = '#000';
    const color = isMono ? monoColor : '#fff';
    const body  = htmlLines.join('\n');
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>ASCILI Export</title>
<style>
body{margin:0;background:${bg};padding:8px}
pre{font-family:'Courier New',monospace;font-size:${fontSize}px;line-height:1;color:${color};white-space:pre;overflow:auto}
</style>
</head>
<body><pre>${body}</pre></body>
</html>`;
  }

  getPlainText() {
    const cols = this._lastCols;
    const rows = this._lastRows;
    const src  = this._lastSource;
    const cfg  = this._lastConfig || {};
    if (!cols || !rows || !src) return '';

    const off = document.createElement('canvas');
    off.width  = cols;
    off.height = rows;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(src, 0, 0, cols, rows);
    const imgData = octx.getImageData(0, 0, cols, rows).data;

    const chars = Array.from(cfg.charSet || CHAR_SETS.standard);
    const n = chars.length;
    const invert = cfg.invertChars || false;

    const lines = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      const offset = r * cols;
      for (let c = 0; c < cols; c++) {
        const p4 = (offset + c) * 4;
        const lum = (0.299 * imgData[p4] + 0.587 * imgData[p4 + 1] + 0.114 * imgData[p4 + 2]) / 255.0;
        let ci = (lum * (n - 1) + 0.5) | 0;
        if (ci >= n) ci = n - 1; else if (ci < 0) ci = 0;
        if (invert) ci = (n - 1) - ci;
        line += chars[ci] ?? ' ';
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  getStyledHtml(options = {}) {
    const text = this.getPlainText();
    const bg   = '#000';
    const color = (options.colorMode || 'monochrome') === 'monochrome' ? (options.monoColor || '#39ff52') : '#fff';
    const fontSize = options.fontSize || 10;
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>ASCILI Export</title>
<style>
body{margin:0;background:${bg};padding:8px}
pre{font-family:'Courier New',monospace;font-size:${fontSize}px;line-height:1;color:${color};white-space:pre;overflow:auto}
</style>
</head>
<body><pre>${text}</pre></body>
</html>`;
  }

  reset() {
    this._lastCols = 0;
    this._lastRows = 0;
    this._lastConfig = null;
    this._lastSource = null;
    this._prevCharGrid = new Uint8Array(0);
    this._canvasWorker?.reset();
  }
}

// Backward compatibility alias for existing imports that may call this symbol.
export const AsciliEngineLegacy = AsciliEngine;

// NOTE: The browser-side engine already ships a WebGL fast path and a 2D fallback.
// These runtime profile checks keep the renderer stable across low-end devices and
// reduce visual flicker without sacrificing responsiveness.
