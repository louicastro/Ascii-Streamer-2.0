"""
Ascili AI Video Engine - Web API & Streaming Server
Zero external web framework dependencies (built with Python standard library).
Provides CORS-enabled REST endpoints and Server-Sent Events (SSE) streaming for web clients.
"""

import os
import sys
import time
import json
import uuid
import base64
import urllib.parse
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from typing import Dict, Any, Optional

import numpy as np

from .engine import AsciiAIEngine, EngineConfig, PRESETS, HAS_CAIRO
from .video_processor import VideoProcessor, ConversionJob


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


# In-memory job repository
JOBS: Dict[str, ConversionJob] = {}
JOB_TIMESTAMPS: Dict[str, float] = {}
OUTPUT_DIR = os.path.abspath("converted_videos")
UPLOAD_DIR = os.path.abspath("uploaded_videos")
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB

def cleanup_old_jobs(max_age_seconds: float = 3600, max_jobs: int = 50):
    """Automatically cleans up expired job records and files to avoid disk/RAM leaks."""
    now = time.time()
    to_delete = []
    for j_id, ts in list(JOB_TIMESTAMPS.items()):
        if (now - ts) > max_age_seconds or len(JOBS) > max_jobs:
            to_delete.append(j_id)
    for j_id in to_delete:
        job = JOBS.pop(j_id, None)
        JOB_TIMESTAMPS.pop(j_id, None)
        if job:
            if job.input_path and job.input_path.startswith(UPLOAD_DIR):
                try:
                    if os.path.exists(job.input_path):
                        os.remove(job.input_path)
                except Exception:
                    pass
            if job.output_path and job.output_path.startswith(OUTPUT_DIR):
                try:
                    if os.path.exists(job.output_path):
                        os.remove(job.output_path)
                except Exception:
                    pass


class AsciliServerHandler(BaseHTTPRequestHandler):
    processor = VideoProcessor()

    def _set_cors(self, content_type: str = "application/json", status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-API-Key, X-Filename")
        self.end_headers()

    def _check_auth(self) -> bool:
        required_key = os.environ.get("ASCILI_API_KEY")
        if not required_key:
            return True
        auth_header = self.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            if token == required_key:
                return True
        api_key_header = self.headers.get("X-API-Key", "").strip()
        if api_key_header == required_key:
            return True
        self._set_cors("application/json", status=401)
        self.wfile.write(json.dumps({"error": "Unauthorized: Invalid or missing API key"}).encode("utf-8"))
        return False

    def do_OPTIONS(self):
        self._set_cors()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. Health & Capabilities Check
        if path == "/api/health":
            self._set_cors("application/json")
            res = {
                "status": "ok",
                "version": "2.0.0",
                "cairo_enabled": HAS_CAIRO,
                "output_dir": OUTPUT_DIR,
                "active_jobs": len(JOBS),
            }
            self.wfile.write(json.dumps(res).encode("utf-8"))
            return

        # 2. Presets Endpoint
        if path == "/api/presets":
            self._set_cors("application/json")
            presets_data = {}
            for name, cfg in PRESETS.items():
                presets_data[name] = {
                    "cols": cfg.cols,
                    "color_mode": cfg.color_mode,
                    "char_set": cfg.char_set,
                    "enable_edge_detection": cfg.enable_edge_detection,
                    "edge_threshold": cfg.edge_threshold,
                    "temporal_smoothing": cfg.temporal_smoothing,
                    "phosphor_color": cfg.phosphor_color,
                    "contrast": cfg.contrast,
                    "brightness": cfg.brightness,
                }
            self.wfile.write(json.dumps(presets_data, indent=2).encode("utf-8"))
            return

        # 3. Job Status Query: /api/job/<job_id>
        if path.startswith("/api/job/"):
            job_id = path.replace("/api/job/", "").strip()
            job = JOBS.get(job_id)
            if not job:
                self._set_cors("application/json", status=404)
                self.wfile.write(json.dumps({"error": f"Job {job_id} not found"}).encode("utf-8"))
                return

            self._set_cors("application/json")
            data = job.progress.to_dict()
            if job.progress.status == "completed":
                data["download_url"] = f"/api/download/{job_id}"
            self.wfile.write(json.dumps(data).encode("utf-8"))
            return

        # 4. Download Converted Video: /api/download/<job_id>
        if path.startswith("/api/download/"):
            job_id = path.replace("/api/download/", "").strip()
            job = JOBS.get(job_id)
            if not job or not job.progress.output_path or not os.path.exists(job.progress.output_path):
                self._set_cors("application/json", status=404)
                self.wfile.write(json.dumps({"error": "File not found"}).encode("utf-8"))
                return

            filepath = job.progress.output_path
            filename = os.path.basename(filepath)
            filesize = os.path.getsize(filepath)
            mime = "video/webm" if filename.endswith(".webm") else "video/mp4"

            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(filesize))
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            with open(filepath, "rb") as f:
                while chunk := f.read(65536):
                    self.wfile.write(chunk)
            return

        # 5. Live Server-Sent Events (SSE) Stream Demo: /api/stream
        if path == "/api/stream":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            engine = AsciiAIEngine(PRESETS["matrix"])
            t = 0
            try:
                # Generate synthetic procedural test pattern (plasma wave)
                while True:
                    w, h = 320, 180
                    y, x = np.ogrid[:h, :w]
                    plasma = (
                        np.sin(x / 16.0 + t) +
                        np.sin(y / 8.0 + t) +
                        np.sin((x + y) / 16.0 + t) +
                        np.sin(np.sqrt(x**2 + y**2) / 8.0)
                    )
                    plasma = ((plasma + 4) / 8.0 * 255).astype(np.uint8)
                    rgb = np.stack([plasma // 2, plasma, plasma // 3], axis=-1)

                    lines, colors = engine.process_frame(rgb, target_cols=80)
                    text_payload = "\n".join(lines)
                    event_data = json.dumps({"frame": t, "ascii": text_payload})

                    self.wfile.write(f"data: {event_data}\n\n".encode("utf-8"))
                    self.wfile.flush()
                    t += 1
                    time.sleep(0.033)  # ~30 FPS
            except (BrokenPipeError, ConnectionResetError):
                return

        # 6. Embedded Web Demo Page
        if path in ("/", "/index.html"):
            self._set_cors("text/html")
            self.wfile.write(self._render_demo_html().encode("utf-8"))
            return

        self._set_cors("application/json", status=404)
        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    def do_POST(self):
        if not self._check_auth():
            return

        cleanup_old_jobs()

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Cancellation endpoint: POST /api/job/<job_id>/cancel
        if path.startswith("/api/job/") and path.endswith("/cancel"):
            job_id = path.replace("/api/job/", "").replace("/cancel", "").strip()
            job = JOBS.get(job_id)
            if not job:
                self._set_cors("application/json", status=404)
                self.wfile.write(json.dumps({"error": f"Job {job_id} not found"}).encode("utf-8"))
                return
            job.should_cancel = True
            job.progress.status = "cancelled"
            self._set_cors("application/json")
            self.wfile.write(json.dumps({"message": f"Job {job_id} cancellation requested"}).encode("utf-8"))
            return

        # 0. Upload & Convert: /api/upload
        if path == "/api/upload":
            content_len = int(self.headers.get("Content-Length", 0))
            if content_len == 0:
                self._set_cors("application/json", status=400)
                self.wfile.write(json.dumps({"error": "Empty upload body"}).encode("utf-8"))
                return
            if content_len > MAX_UPLOAD_SIZE:
                self._set_cors("application/json", status=413)
                self.wfile.write(json.dumps({
                    "error": f"Upload exceeds maximum allowed size ({MAX_UPLOAD_SIZE // (1024*1024)} MB)"
                }).encode("utf-8"))
                return

            filename = os.path.basename(self.headers.get("X-Filename", "uploaded_video.mp4"))
            clean_name = "".join(c for c in filename if c.isalnum() or c in "._-") or "video.mp4"
            job_id = str(uuid.uuid4())[:8]
            input_path = os.path.join(UPLOAD_DIR, f"{job_id}_{clean_name}")

            bytes_left = content_len
            with open(input_path, "wb") as f:
                while bytes_left > 0:
                    chunk = self.rfile.read(min(bytes_left, 65536))
                    if not chunk:
                        break
                    f.write(chunk)
                    bytes_left -= len(chunk)

            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            preset_name = query.get("preset", ["matrix"])[0]
            base_cfg = PRESETS.get(preset_name, PRESETS["matrix"])
            try:
                cols = int(query.get("cols", [base_cfg.cols])[0])
                cols = max(10, min(500, cols))
            except (ValueError, TypeError):
                cols = base_cfg.cols

            fps_raw = query.get("fps", [None])[0]
            try:
                fps = int(fps_raw) if fps_raw else None
            except (ValueError, TypeError):
                fps = None

            res = query.get("resolution", ["1080p"])[0]
            if res not in ("720p", "1080p", "1440p", "2k", "4k"):
                res = "1080p"

            cfg = EngineConfig(
                cols=cols,
                color_mode=base_cfg.color_mode,
                char_set=base_cfg.char_set,
                enable_edge_detection=True,
                edge_threshold=0.16,
                temporal_smoothing=0.35,
                phosphor_color=base_cfg.phosphor_color,
                contrast=base_cfg.contrast,
                brightness=base_cfg.brightness,
            )

            output_path = os.path.join(OUTPUT_DIR, f"ascii_{job_id}.mp4")
            job = ConversionJob(job_id, input_path, output_path, cfg)
            JOBS[job_id] = job
            JOB_TIMESTAMPS[job_id] = time.time()

            def worker():
                try:
                    proc = VideoProcessor(AsciiAIEngine(cfg))
                    proc.convert_video(
                        input_path=input_path,
                        output_path=output_path,
                        config=cfg,
                        target_fps=fps,
                        target_resolution=res,
                        job=job,
                    )
                except Exception as ex:
                    job.progress.status = "failed"
                    job.progress.error_message = str(ex)
                finally:
                    if os.path.exists(input_path):
                        try:
                            os.remove(input_path)
                        except Exception:
                            pass

            threading.Thread(target=worker, daemon=True).start()

            self._set_cors("application/json", status=202)
            self.wfile.write(json.dumps({
                "message": "Video uploaded and conversion started",
                "job_id": job_id,
                "status_url": f"/api/job/{job_id}",
            }).encode("utf-8"))
            return

        content_len = int(self.headers.get("Content-Length", 0))
        if content_len > 10 * 1024 * 1024:  # 10 MB JSON payload limit
            self._set_cors("application/json", status=413)
            self.wfile.write(json.dumps({"error": "Payload too large"}).encode("utf-8"))
            return

        body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {}

        # 1. Start Conversion: /api/convert
        if path == "/api/convert":
            input_path = payload.get("input_path")
            if not input_path or not os.path.isfile(input_path):
                self._set_cors("application/json", status=400)
                self.wfile.write(json.dumps({"error": f"input_path '{input_path}' is not a valid accessible file"}).encode("utf-8"))
                return

            job_id = str(uuid.uuid4())[:8]
            ext = ".webm" if str(payload.get("format", "mp4")).lower() == "webm" else ".mp4"

            # Enforce output path is strictly contained within OUTPUT_DIR
            req_out = payload.get("output_path")
            if req_out:
                safe_out_name = os.path.basename(req_out).strip()
                if not safe_out_name or safe_out_name.startswith("."):
                    safe_out_name = f"ascii_{job_id}{ext}"
                if not (safe_out_name.endswith(".mp4") or safe_out_name.endswith(".webm")):
                    safe_out_name += ext
                output_path = os.path.join(OUTPUT_DIR, safe_out_name)
            else:
                output_path = os.path.join(OUTPUT_DIR, f"ascii_{job_id}{ext}")

            # Configuration & parameter validation
            preset_name = payload.get("preset", "matrix")
            base_cfg = PRESETS.get(preset_name, PRESETS["matrix"])

            try:
                cols = int(payload.get("cols", base_cfg.cols))
                if cols < 10 or cols > 500:
                    raise ValueError("cols must be between 10 and 500")
            except (ValueError, TypeError) as ex:
                self._set_cors("application/json", status=400)
                self.wfile.write(json.dumps({"error": f"Invalid 'cols' parameter: {ex}"}).encode("utf-8"))
                return

            try:
                contrast = int(payload.get("contrast", base_cfg.contrast))
                brightness = int(payload.get("brightness", base_cfg.brightness))
                edge_threshold = float(payload.get("edge_threshold", base_cfg.edge_threshold))
                temporal_smoothing = float(payload.get("temporal_smoothing", base_cfg.temporal_smoothing))
            except (ValueError, TypeError) as ex:
                self._set_cors("application/json", status=400)
                self.wfile.write(json.dumps({"error": f"Invalid numeric parameters: {ex}"}).encode("utf-8"))
                return

            target_fps_raw = payload.get("fps")
            try:
                target_fps = int(target_fps_raw) if target_fps_raw else None
            except (ValueError, TypeError):
                target_fps = None

            target_res = str(payload.get("resolution", "1080p")).lower()

            cfg = EngineConfig(
                cols=cols,
                color_mode=payload.get("color_mode", base_cfg.color_mode),
                char_set=payload.get("char_set", base_cfg.char_set),
                enable_edge_detection=bool(payload.get("enable_edge_detection", base_cfg.enable_edge_detection)),
                edge_threshold=edge_threshold,
                temporal_smoothing=temporal_smoothing,
                phosphor_color=tuple(payload.get("phosphor_color", base_cfg.phosphor_color)),
                contrast=contrast,
                brightness=brightness,
            )

            job = ConversionJob(job_id, input_path, output_path, cfg)
            JOBS[job_id] = job
            JOB_TIMESTAMPS[job_id] = time.time()

            # Run in worker thread
            def worker():
                try:
                    proc = VideoProcessor(AsciiAIEngine(cfg))
                    proc.convert_video(
                        input_path=input_path,
                        output_path=output_path,
                        config=cfg,
                        target_fps=target_fps,
                        target_resolution=target_res,
                        job=job,
                    )
                except Exception as ex:
                    job.progress.status = "failed"
                    job.progress.error_message = str(ex)

            thread = threading.Thread(target=worker, daemon=True)
            thread.start()

            self._set_cors("application/json", status=202)
            self.wfile.write(json.dumps({
                "message": "Conversion job started",
                "job_id": job_id,
                "status_url": f"/api/job/{job_id}",
            }).encode("utf-8"))
            return

        # 2. Real-time Single Frame Processing: /api/process_frame
        # Accepts base64 RGB or raw matrix, returns ASCII lines
        if path == "/api/process_frame":
            image_b64 = payload.get("image_base64")
            if not image_b64:
                self._set_cors("application/json", status=400)
                self.wfile.write(json.dumps({"error": "image_base64 is required"}).encode("utf-8"))
                return

            try:
                # Strip data url prefix if present
                if "," in image_b64:
                    image_b64 = image_b64.split(",", 1)[1]
                img_bytes = base64.b64decode(image_b64)

                w = int(payload.get("width", 0))
                h = int(payload.get("height", 0))
                if w > 0 and h > 0 and len(img_bytes) == w * h * 3:
                    frame = np.frombuffer(img_bytes, dtype=np.uint8).reshape((h, w, 3))
                else:
                    self._set_cors("application/json", status=400)
                    self.wfile.write(json.dumps({"error": "Raw RGB requires valid width and height matching byte length"}).encode("utf-8"))
                    return

                try:
                    cols = int(payload.get("cols", 80))
                    cols = max(10, min(500, cols))
                except (ValueError, TypeError):
                    cols = 80

                engine = AsciiAIEngine(PRESETS.get(payload.get("preset", "matrix")))
                lines, colors = engine.process_frame(frame, target_cols=cols)

                self._set_cors("application/json")
                self.wfile.write(json.dumps({"lines": lines}).encode("utf-8"))
                return
            except Exception as ex:
                self._set_cors("application/json", status=500)
                self.wfile.write(json.dumps({"error": str(ex)}).encode("utf-8"))
                return

        self._set_cors("application/json", status=404)
        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    def _render_demo_html(self) -> str:
        """Render embedded Web UI."""
        return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>ASCILI AI Video Engine - Live Stream</title>
<style>
  body { margin:0; background:#080c08; color:#39ff52; font-family:'Courier New',monospace; display:flex; flex-direction:column; height:100vh; overflow:hidden; }
  header { padding:12px 20px; background:#0d130d; border-bottom:1px solid #1a2a1a; display:flex; justify-content:space-between; align-items:center; }
  h1 { margin:0; font-size:16px; font-weight:bold; letter-spacing:2px; text-shadow:0 0 10px #39ff52; }
  #screen { flex:1; padding:16px; margin:0; font-size:11px; line-height:1; white-space:pre; overflow:auto; color:#39ff52; text-shadow:0 0 5px rgba(57,255,82,0.4); }
  .status { font-size:11px; color:#607060; }
  .badge { background:#111811; border:1px solid #234023; padding:2px 8px; border-radius:3px; color:#39ff52; }
</style>
</head>
<body>
<header>
  <h1>ASCILI AI VIDEO ENGINE // PYTHON BACKEND</h1>
  <div class="status">ENGINE: <span class="badge">ACTIVE (NO API KEYS)</span> | FPS: <span class="badge" id="fps">30</span></div>
</header>
<pre id="screen">Connecting to Python AI Video Stream...</pre>
<script>
  const screen = document.getElementById('screen');
  const fpsBadge = document.getElementById('fps');
  let lastTime = performance.now();
  let frames = 0;

  const evtSource = new EventSource('/api/stream');
  evtSource.onmessage = function(e) {
    const data = JSON.parse(e.data);
    screen.textContent = data.ascii;
    frames++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
      fpsBadge.textContent = Math.round(frames * 1000 / (now - lastTime));
      frames = 0;
      lastTime = now;
    }
  };
</script>
</body>
</html>"""


def run_server(host: str = "0.0.0.0", port: int = 8000):
    server = ThreadedHTTPServer((host, port), AsciliServerHandler)
    print(f"================================================================")
    print(f"  ASCILI AI Video Engine Server running at http://{host}:{port}")
    print(f"  - REST API:        http://{host}:{port}/api/health")
    print(f"  - Presets:         http://{host}:{port}/api/presets")
    print(f"  - Video Converter: POST http://{host}:{port}/api/convert")
    print(f"  - SSE Live Stream: http://{host}:{port}/api/stream")
    print(f"  - Interactive Web: http://{host}:{port}/")
    print(f"================================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        server.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port=port)
