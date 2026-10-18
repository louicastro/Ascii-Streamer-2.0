let canvas;
let ctx;
let sampleCanvas;
let sampleCtx;

const ANSI16_PALETTE = [
  [0,0,0],[128,0,0],[0,128,0],[128,128,0],
  [0,0,128],[128,0,128],[0,128,128],[192,192,192],
  [128,128,128],[255,0,0],[0,255,0],[255,255,0],
  [0,0,255],[255,0,255],[0,255,255],[255,255,255],
];

function quantizeAnsi16(r, g, b) {
  let best = ANSI16_PALETTE[0];
  let bestD = Infinity;
  for (let i = 0; i < 16; i++) {
    const c = ANSI16_PALETTE[i];
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function quantizeCubeVal(v) {
  if (v < 48) return 0;
  if (v < 115) return 95;
  if (v < 155) return 135;
  if (v < 195) return 175;
  if (v < 235) return 215;
  return 255;
}

function quantizeAnsi256(r, g, b) {
  const qr = quantizeCubeVal(r);
  const qg = quantizeCubeVal(g);
  const qb = quantizeCubeVal(b);
  const dCube = (r - qr) ** 2 + (g - qg) ** 2 + (b - qb) ** 2;
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const grayStep = Math.max(0, Math.min(23, Math.round((gray - 8) / 10)));
  const qGray = 8 + grayStep * 10;
  const dGray = (r - qGray) ** 2 + (g - qGray) ** 2 + (b - qGray) ** 2;
  return dGray < dCube ? [qGray, qGray, qGray] : [qr, qg, qb];
}

self.onmessage = ({ data }) => {
  const startedAt = performance.now();
  const { frame, width, height, cols, rows, config, chars, generation } = data;
  try {
    if (!canvas) {
      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext('2d', { alpha: false });
    } else if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    if (!sampleCanvas) {
      sampleCanvas = new OffscreenCanvas(cols, rows);
      sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    } else if (sampleCanvas.width !== cols || sampleCanvas.height !== rows) {
      sampleCanvas.width = cols;
      sampleCanvas.height = rows;
    }
    sampleCtx.drawImage(frame, 0, 0, cols, rows);
    const pixels = sampleCtx.getImageData(0, 0, cols, rows).data;
    frame.close();

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    const fontSize = config.fontSize || 10;
    ctx.font = `${fontSize}px "Courier New", monospace`;
    ctx.textBaseline = 'top';
    const mono = config.colorMode === 'monochrome';
    const cellW = fontSize * 0.601;
    for (let row = 0; row < rows; row++) {
      let line = '';
      let run = '';
      let color = '';
      let runStart = 0;
      for (let col = 0; col < cols; col++) {
        const p = (row * cols + col) * 4;
        const lum = (0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2]) / 255;
        let index = Math.round(lum * (chars.length - 1));
        if (config.invertChars) index = chars.length - 1 - index;
        const ch = chars[index] || ' ';
        if (mono) {
          line += ch;
        } else {
          let pr = pixels[p], pg = pixels[p + 1], pb = pixels[p + 2];
          if (config.colorMode === 'grayscale') {
            const gray = Math.round(lum * 255);
            pr = gray; pg = gray; pb = gray;
          } else if (config.colorMode === 'ansi16') {
            const [cr, cg, cb] = quantizeAnsi16(pr, pg, pb);
            pr = cr; pg = cg; pb = cb;
          } else if (config.colorMode === 'ansi256') {
            const [cr, cg, cb] = quantizeAnsi256(pr, pg, pb);
            pr = cr; pg = cg; pb = cb;
          }
          const next = `rgb(${pr},${pg},${pb})`;
          if (next !== color) {
            if (run) {
              ctx.fillStyle = color;
              ctx.fillText(run, runStart * cellW, row * fontSize);
            }
            color = next;
            run = ch;
            runStart = col;
          } else run += ch;
        }
      }
      if (mono) {
        ctx.fillStyle = config.monoColor || '#39ff52';
        ctx.fillText(line, 0, row * fontSize);
      } else if (run) {
        ctx.fillStyle = color;
        ctx.fillText(run, runStart * cellW, row * fontSize);
      }
    }
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ bitmap, renderMs: performance.now() - startedAt, generation }, [bitmap]);
  } catch (error) {
    frame.close();
    self.postMessage({ error: error.message || 'Canvas worker render failed', generation });
  }
};
