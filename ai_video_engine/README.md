# 🎬 ASCILI AI Video Engine (Python)

A state-of-the-art, high-performance, **edge-aware, temporally coherent ASCII video perception and conversion engine** written in raw Python.

**100% offline — zero external API keys, zero cloud tokens, no proprietary dependencies.**

---

## 🌟 Key Features

1. **AI Structural Edge Perception**:
   - Unlike basic ASCII converters that only map 1D pixel brightness, this engine computes 2D spatial gradients ($G_x, G_y$), edge magnitude, and orientation angles $\theta$.
   - Automatically maps edges to directional glyphs (`|`, `-`, `/`, `\`, `+`, `~`) to retain razor-sharp silhouettes, contours, and facial features.

2. **Temporal Coherence & Anti-Flicker Filter**:
   - Uses an adaptive hysteresis matrix across frames to suppress noisy character flickering (shimmer) in video while preserving crisp response to fast motion.

3. **Handles 1+ Hour Videos at 1080p 30–120 FPS**:
   - Stream-processes frames using memory-bounded bidirectional FFmpeg pipes.
   - Memory usage remains strictly constant (~50–100MB) regardless of whether the video is 10 seconds or 2 hours long.
   - Preserves original audio tracks without desync or re-compression degradation.

4. **Multi-Mode Color Synthesis**:
   - **Monochrome Phosphor**: Matrix Green (`#39ff52`), Cyberpunk Cyan (`#00f5ff`), Retro Amber (`#ffbb00`), Blood Red, Pure White.
   - **TrueColor (24-bit RGB)**: Rich, full-color ASCII rendering with run-length encoding.
   - **ANSI 16 / ANSI 256**: High-fidelity terminal palette mapping using perceptual Euclidean color space.
   - **Grayscale**: Balanced luminance gradient.

5. **Built-in Web API & Streaming Server**:
   - Pure Python standard library HTTP/SSE server (zero external web framework dependencies).
   - Serves Server-Sent Events (SSE) live streams directly to browser frontends.
   - REST endpoints for starting conversions, checking progress/ETA, and downloading files.

---

## 🚀 Quick Start

### 1. Run the Web Server (for your website)
To start the REST & live streaming server on port `8000`:
```bash
python3 -m ai_video_engine.cli --serve --port 8000
```
Open **[http://localhost:8000](http://localhost:8000)** to view the live streaming ASCII demo!

#### Web API Endpoints:
- `GET /api/health` — Check server status & hardware support.
- `GET /api/presets` — Retrieve all aesthetic presets.
- `GET /api/stream` — Real-time Server-Sent Events (SSE) stream of ASCII frames.
- `POST /api/convert` — Start an asynchronous video conversion:
  ```json
  {
    "input_path": "/path/to/video.mp4",
    "preset": "matrix",
    "resolution": "1080p",
    "fps": 60,
    "cols": 140
  }
  ```
- `GET /api/job/<job_id>` — Monitor conversion percent, processing FPS, and ETA.
- `GET /api/download/<job_id>` — Download the finished ASCII video file (.mp4).

---

### 2. Convert a Video File via CLI
Convert any video file (MP4, MKV, WebM, MOV, AVI) to 1080p 60 FPS ASCII video:
```bash
python3 -m ai_video_engine.cli input.mp4 output.mp4 --preset matrix --res 1080p --fps 60
```

Available presets:
- `matrix`: Classic neon green phosphor with edge enhancements.
- `cyberpunk`: Vibrant TrueColor with high saturation and sharp contours.
- `edge_art`: High-density edge outline art in cyan.
- `truecolor_cinema`: Natural cinematic TrueColor rendering.
- `retro_amber`: Vintage warm CRT amber terminal feel.
- `braille_hd`: High-resolution Braille unicode dot art.

---

### 3. Play Video Directly in Terminal
Play any video directly in your terminal at 30–60 FPS with ANSI colors:
```bash
python3 -m ai_video_engine.cli input.mp4 --play --preset cyberpunk --cols 120
```

---

## 🐍 Python SDK Usage

You can also import and use the engine directly in your own Python scripts:

```python
import numpy as np
from ai_video_engine import AsciiAIEngine, PRESETS, VideoProcessor

# 1. Process single image frame
engine = AsciiAIEngine(PRESETS["matrix"])
rgb_frame = np.zeros((720, 1280, 3), dtype=np.uint8) # your image
lines, colors = engine.process_frame(rgb_frame, target_cols=120)

# Export as text or ANSI
plain_text = engine.to_plain_text(lines)
ansi_terminal = engine.to_ansi(lines, colors)
html_block = engine.to_html(lines, colors)

# 2. Batch convert full video file
processor = VideoProcessor(engine)
processor.convert_video(
    input_path="input.mp4",
    output_path="output_1080p.mp4",
    target_fps=60,
    target_resolution="1080p"
)
```

---

## 🧪 Verification & Benchmark

Run the automated test suite anytime:
```bash
python3 -m ai_video_engine.test_engine
```
Tests core edge detection, temporal stability, audio retention, and full 1080p 60 FPS video generation.
