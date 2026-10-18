let canvas;
let ctx;
let sampleCanvas;
let sampleCtx;

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
            pr = Math.round(Math.round(pr / 127.5) * 127.5);
            pg = Math.round(Math.round(pg / 127.5) * 127.5);
            pb = Math.round(Math.round(pb / 127.5) * 127.5);
          } else if (config.colorMode === 'ansi256') {
            pr = Math.round(Math.round(pr / 51) * 51);
            pg = Math.round(Math.round(pg / 51) * 51);
            pb = Math.round(Math.round(pb / 51) * 51);
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
