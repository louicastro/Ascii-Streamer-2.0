/**
 * 3D Math, Rotation Matrices, Perspective Projection, and Easing Curves
 */

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function degToRad(deg) {
  return deg * DEG2RAD;
}

export function clamp(v, min = 0, max = 1) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ─── Easing Functions ────────────────────────────────────────────────────────

export const EASING_FUNCTIONS = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  },
  easeOutElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

export function applyEasing(easingName, t) {
  const fn = EASING_FUNCTIONS[easingName] || EASING_FUNCTIONS.easeInOutCubic;
  return fn(clamp(t, 0, 1));
}

// ─── 3D Euler Matrix Transform ───────────────────────────────────────────────

/**
 * Creates a 3x3 rotation matrix for Euler angles (pitch=rotX, yaw=rotY, roll=rotZ in radians).
 * Uses Z * Y * X rotation order.
 */
export function createRotationMatrix(rotXRad, rotYRad, rotZRad) {
  const cx = Math.cos(rotXRad), sx = Math.sin(rotXRad);
  const cy = Math.cos(rotYRad), sy = Math.sin(rotYRad);
  const cz = Math.cos(rotZRad), sz = Math.sin(rotZRad);

  return [
    cy * cz,
    cx * sz + sx * sy * cz,
    sx * sz - cx * sy * cz,

    -cy * sz,
    cx * cz - sx * sy * sz,
    sx * cz + cx * sy * sz,

    sy,
    -sx * cy,
    cx * cy,
  ];
}

/**
 * Transforms a 3D point (x, y, z) using rotation matrix m.
 */
export function transformPoint(m, x, y, z) {
  return {
    x: m[0] * x + m[3] * y + m[6] * z,
    y: m[1] * x + m[4] * y + m[7] * z,
    z: m[2] * x + m[5] * y + m[8] * z,
  };
}

/**
 * Projects a 3D point onto 2D canvas space with perspective division.
 * originX, originY: viewport center point
 * fov: perspective focal distance (e.g. 700-1000)
 * cameraZ: camera offset
 */
export function project3D(x, y, z, originX, originY, fov = 750, cameraZ = 0) {
  const zTotal = z + cameraZ;
  const safeZ = Math.max(10, fov + zTotal);
  const scale = fov / safeZ;
  return {
    x: originX + x * scale,
    y: originY + y * scale,
    z: zTotal,
    scale,
  };
}

// ─── Lighting and Shading ───────────────────────────────────────────────────

export function calculateSurfaceLight(normalX, normalY, normalZ, lightX, lightY, lightZ, ambient = 0.35) {
  // Normalize light
  const lenL = Math.hypot(lightX, lightY, lightZ) || 1;
  const lx = lightX / lenL;
  const ly = lightY / lenL;
  const lz = lightZ / lenL;

  // Dot product
  const dot = Math.max(0, normalX * lx + normalY * ly + normalZ * lz);
  return clamp(ambient + (1 - ambient) * dot, 0, 1);
}

// ─── Color Utilities ────────────────────────────────────────────────────────

export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 255, g: 255, b: 255 };
  let c = hex.replace('#', '').trim();
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return { r: 255, g: 255, b: 255 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = lerp(a.r, b.r, t);
  const g = lerp(a.g, b.g, t);
  const bl = lerp(a.b, b.b, t);
  return rgbToHex(r, g, bl);
}

export function multiplyColorBrightness(hex, factor) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.round(clamp(r * factor, 0, 255))}, ${Math.round(clamp(g * factor, 0, 255))}, ${Math.round(clamp(b * factor, 0, 255))})`;
}

// ─── Deterministic Hash Noise ───────────────────────────────────────────────

export function pseudoRandom(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
