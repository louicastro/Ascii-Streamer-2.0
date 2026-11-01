// ─── Fast Pure JavaScript GIF89a Encoder (Zero Dependencies) ────────────────
// Encodes raw ImageData / Canvas frames into standard animated GIF files.

export class AsciliGifEncoder {
  constructor(width, height, options = {}) {
    this.width = Math.round(width);
    this.height = Math.round(height);
    this.delayCentisecs = Math.max(1, Math.round((options.delayMs || 100) / 10)); // 100ms = 10cs = 10 fps
    this.repeat = options.repeat ?? 0; // 0 = loop forever
    this.frames = [];
  }

  // Pre-built 256-color palette: 6x6x6 color cube (216 colors) + 32 grayscale levels + 8 primary accents
  static getPalette() {
    if (AsciliGifEncoder._palette) return AsciliGifEncoder._palette;
    const p = new Uint8Array(256 * 3);
    let idx = 0;
    // 6x6x6 color cube (216 colors)
    const levels = [0, 51, 102, 153, 204, 255];
    for (let r = 0; r < 6; r++) {
      for (let g = 0; g < 6; g++) {
        for (let b = 0; b < 6; b++) {
          p[idx++] = levels[r];
          p[idx++] = levels[g];
          p[idx++] = levels[b];
        }
      }
    }
    // 32 grayscale ramps
    for (let i = 0; i < 32; i++) {
      const v = Math.round((i / 31) * 255);
      p[idx++] = v;
      p[idx++] = v;
      p[idx++] = v;
    }
    // Fill remainder
    while (idx < 256 * 3) {
      p[idx++] = 0;
    }
    AsciliGifEncoder._palette = p;
    return p;
  }

  // Fast color quantization into 256-color palette
  static quantizePixel(r, g, b) {
    // If neutral gray
    if (Math.abs(r - g) <= 8 && Math.abs(g - b) <= 8) {
      const grayIdx = Math.max(0, Math.min(31, Math.round((r / 255) * 31)));
      return 216 + grayIdx;
    }
    // 6x6x6 cube index
    const qr = Math.min(5, Math.max(0, Math.round(r / 51)));
    const qg = Math.min(5, Math.max(0, Math.round(g / 51)));
    const qb = Math.min(5, Math.max(0, Math.round(b / 51)));
    return qr * 36 + qg * 6 + qb;
  }

  addFrame(ctxOrCanvas) {
    const w = this.width;
    const h = this.height;
    let data;
    if (ctxOrCanvas instanceof CanvasRenderingContext2D) {
      data = ctxOrCanvas.getImageData(0, 0, w, h).data;
    } else if (ctxOrCanvas instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && ctxOrCanvas instanceof OffscreenCanvas)) {
      const ctx = ctxOrCanvas.getContext('2d');
      data = ctx.getImageData(0, 0, w, h).data;
    } else if (ctxOrCanvas.data) {
      data = ctxOrCanvas.data;
    } else {
      throw new Error('Unsupported frame source for GIF encoding');
    }

    const indexed = new Uint8Array(w * h);
    for (let i = 0, len = w * h; i < len; i++) {
      const p = i * 4;
      indexed[i] = AsciliGifEncoder.quantizePixel(data[p], data[p + 1], data[p + 2]);
    }
    this.frames.push(indexed);
  }

  finish() {
    const w = this.width;
    const h = this.height;
    const palette = AsciliGifEncoder.getPalette();
    const parts = [];

    // Header & Logical Screen Descriptor
    parts.push(new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
      w & 0xFF, (w >> 8) & 0xFF,
      h & 0xFF, (h >> 8) & 0xFF,
      0xF7, // Global Color Table Flag (1), 8 bits/pixel (7)
      0x00, // Background color index
      0x00, // Pixel aspect ratio
    ]));

    // Global Color Table (256 * 3 bytes)
    parts.push(palette);

    // Netscape Application Extension for looping
    if (this.repeat >= 0) {
      parts.push(new Uint8Array([
        0x21, 0xFF, 0x0B,
        0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30, // "NETSCAPE2.0"
        0x03, 0x01,
        this.repeat & 0xFF, (this.repeat >> 8) & 0xFF,
        0x00,
      ]));
    }

    // Frames
    for (const frameIndexed of this.frames) {
      // Graphics Control Extension
      parts.push(new Uint8Array([
        0x21, 0xF9, 0x04,
        0x04, // Disposal method: restore to background (prevents ghosting)
        this.delayCentisecs & 0xFF, (this.delayCentisecs >> 8) & 0xFF,
        0x00, // Transparent color index
        0x00, // Terminator
      ]));

      // Image Descriptor
      parts.push(new Uint8Array([
        0x2C,
        0x00, 0x00, 0x00, 0x00, // Left = 0, Top = 0
        w & 0xFF, (w >> 8) & 0xFF,
        h & 0xFF, (h >> 8) & 0xFF,
        0x00, // Local color table flag = 0 (use global)
      ]));

      // LZW compressed image data (min code size = 8 for 256 colors)
      const lzwData = this._lzwEncode(frameIndexed, 8);
      parts.push(lzwData);
    }

    // GIF Trailer
    parts.push(new Uint8Array([0x3B]));

    return new Blob(parts, { type: 'image/gif' });
  }

  _lzwEncode(pixels, minCodeSize) {
    const clearCode = 1 << minCodeSize; // 256
    const eoiCode = clearCode + 1;       // 257
    let codeSize = minCodeSize + 1;     // 9
    let nextCode = eoiCode + 1;         // 258

    const dict = new Map();
    const resetDict = () => {
      dict.clear();
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
    };

    const outBytes = [];
    let curBits = 0;
    let curVal = 0;

    const emitCode = (code) => {
      curVal |= (code << curBits);
      curBits += codeSize;
      while (curBits >= 8) {
        outBytes.push(curVal & 0xFF);
        curVal >>= 8;
        curBits -= 8;
      }
    };

    emitCode(clearCode);
    let curPrefix = pixels[0];

    for (let i = 1; i < pixels.length; i++) {
      const k = pixels[i];
      const key = (curPrefix << 8) | k;
      const code = dict.get(key);

      if (code !== undefined) {
        curPrefix = code;
      } else {
        emitCode(curPrefix);
        if (nextCode < 4096) {
          dict.set(key, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
        } else {
          emitCode(clearCode);
          resetDict();
        }
        curPrefix = k;
      }
    }
    emitCode(curPrefix);
    emitCode(eoiCode);

    if (curBits > 0) {
      outBytes.push(curVal & 0xFF);
    }

    // Packetize into blocks of max 254 bytes
    const packeted = [minCodeSize];
    let pos = 0;
    while (pos < outBytes.length) {
      const blockSize = Math.min(254, outBytes.length - pos);
      packeted.push(blockSize);
      for (let j = 0; j < blockSize; j++) {
        packeted.push(outBytes[pos + j]);
      }
      pos += blockSize;
    }
    packeted.push(0x00); // Block terminator
    return new Uint8Array(packeted);
  }
}
