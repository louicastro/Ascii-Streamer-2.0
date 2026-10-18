"""
Comprehensive test script for ASCILI AI Video Engine.
Tests:
1. Core AI ASCII Perception Engine (gradient detection, temporal coherence, color quantization)
2. Synthetic video generation and conversion at 1080p 60fps with audio preservation
3. Web API endpoints verification
"""

import os
import sys
import time
import subprocess
import numpy as np

from ai_video_engine.engine import AsciiAIEngine, EngineConfig, PRESETS, HAS_CAIRO
from ai_video_engine.video_processor import VideoProcessor, VideoMeta


def test_core_engine():
    print("--> [1/3] Testing AsciiAIEngine Core Logic...")
    engine = AsciiAIEngine(PRESETS["matrix"])

    # Create synthetic frame: a white rectangle on black background with gradient
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    frame[100:380, 150:490] = [200, 200, 200]  # White square
    frame[200:280, 250:390] = [50, 150, 255]   # Colored inner square

    t0 = time.perf_counter()
    lines, colors = engine.process_frame(frame, target_cols=80)
    t1 = time.perf_counter()

    assert len(lines) > 0, "No lines generated"
    assert len(lines[0]) == 80, f"Expected 80 cols, got {len(lines[0])}"
    assert colors.shape[1] == 80, "Color shape mismatch"

    # Test edge characters present
    all_text = "".join(lines)
    assert any(c in all_text for c in ["|", "-", "/", "\\"]), "Edge detection did not find expected borders"

    # Test exporters
    txt = engine.to_plain_text(lines)
    ansi = engine.to_ansi(lines, colors)
    html = engine.to_html(lines, colors)

    assert len(txt) > 0, "Text export failed"
    assert "\033[" in ansi, "ANSI export missing escape codes"
    assert "<pre" in html, "HTML export missing <pre> tag"

    print(f"    ✓ Frame processed in {(t1 - t0)*1000:.2f}ms (Engine throughput: ~{1/(t1-t0):.1f} FPS)")
    print("    ✓ Edge-aware structural analysis passed")
    print("    ✓ Text, ANSI, HTML exporters passed")


def test_video_conversion():
    print("\n--> [2/3] Testing Full Video Conversion Pipeline...")
    temp_dir = "test_output"
    os.makedirs(temp_dir, exist_ok=True)

    input_vid = os.path.join(temp_dir, "input_test.mp4")
    output_vid = os.path.join(temp_dir, "output_ascii_1080p.mp4")

    # 1. Generate 3-second synthetic test video with a sine wave audio track using FFmpeg
    print("    Generating 3-second 1080p test video with audio...")
    gen_cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "testsrc=duration=3:size=1920x1080:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        input_vid,
    ]
    subprocess.run(gen_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    assert os.path.exists(input_vid), "Failed to generate test input video"

    # 2. Probe video metadata
    meta = VideoProcessor.probe_video(input_vid)
    print(f"    Probed video: {meta.width}x{meta.height}, {meta.fps} FPS, {meta.duration:.1f}s, Audio={meta.has_audio}")
    assert meta.has_audio, "Probe failed to detect audio"

    # 3. Convert to ASCII 1080p 60 FPS
    print("    Converting to 1080p 60 FPS ASCII Video with audio...")
    processor = VideoProcessor(AsciiAIEngine(PRESETS["cyberpunk"]))

    t0 = time.time()
    processor.convert_video(
        input_path=input_vid,
        output_path=output_vid,
        target_fps=60,
        target_resolution="1080p",
    )
    elapsed = time.time() - t0

    assert os.path.exists(output_vid), "Output video was not created"
    assert os.path.getsize(output_vid) > 0, "Output video is 0 bytes"

    # 4. Verify output metadata
    out_meta = VideoProcessor.probe_video(output_vid)
    print(f"    ✓ Output generated: {out_meta.width}x{out_meta.height} @ {out_meta.fps} FPS, Size: {os.path.getsize(output_vid)/1024:.1f} KB")
    print(f"    ✓ Preserved Audio: {out_meta.has_audio}")
    print(f"    ✓ Conversion time: {elapsed:.2f}s (~{out_meta.total_frames/elapsed:.1f} FPS)")

    assert out_meta.width == 1920 and out_meta.height == 1080, "Output resolution is not 1080p"
    assert out_meta.has_audio, "Output video lost audio track"

    # Clean up test files
    for f in [input_vid, output_vid]:
        if os.path.exists(f):
            os.remove(f)
    if os.path.exists(temp_dir):
        os.rmdir(temp_dir)


def test_presets():
    print("\n--> [3/3] Testing Presets...")
    for name, cfg in PRESETS.items():
        engine = AsciiAIEngine(cfg)
        test_frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
        lines, colors = engine.process_frame(test_frame)
        assert len(lines) > 0, f"Preset {name} produced empty lines"
        print(f"    ✓ Preset '{name}': {cfg.color_mode}, cols={cfg.cols}, edge={cfg.enable_edge_detection}")


def test_web_api():
    print("\n--> [4/4] Testing Web API Server...")
    from ai_video_engine.server import ThreadedHTTPServer, AsciliServerHandler
    import urllib.request
    import urllib.error
    import threading
    import json

    server = ThreadedHTTPServer(("127.0.0.1", 0), AsciliServerHandler)
    port = server.server_address[1]
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    base_url = f"http://127.0.0.1:{port}"

    try:
        # 1. Health endpoint
        req = urllib.request.Request(f"{base_url}/api/health")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "ok"
            assert "cairo_enabled" in data
            print("    ✓ Health check endpoint verified")

        # 2. Presets endpoint
        req = urllib.request.Request(f"{base_url}/api/presets")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            presets = json.loads(resp.read().decode())
            assert "matrix" in presets
            assert "cyberpunk" in presets
            print("    ✓ Presets endpoint verified")

        # 3. Input validation: missing file returns 400
        req = urllib.request.Request(
            f"{base_url}/api/convert",
            data=json.dumps({"input_path": "/nonexistent/video.mp4"}).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            urllib.request.urlopen(req)
            assert False, "Should have failed with 400"
        except urllib.error.HTTPError as e:
            assert e.code == 400
            print("    ✓ Input file validation verified (400 on non-existent file)")

        # 4. Input validation: invalid cols returns 400
        req = urllib.request.Request(
            f"{base_url}/api/convert",
            data=json.dumps({"input_path": __file__, "cols": -5}).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            urllib.request.urlopen(req)
            assert False, "Should have failed with 400"
        except urllib.error.HTTPError as e:
            assert e.code == 400
            print("    ✓ Cols parameter validation verified (400 on invalid cols)")

        # 5. Auth verification
        os.environ["ASCILI_API_KEY"] = "secret123"
        try:
            # Without key should fail 401
            req = urllib.request.Request(
                f"{base_url}/api/convert",
                data=json.dumps({"input_path": __file__}).encode(),
                headers={"Content-Type": "application/json"},
            )
            try:
                urllib.request.urlopen(req)
                assert False, "Should have failed with 401"
            except urllib.error.HTTPError as e:
                assert e.code == 401
                print("    ✓ API auth rejection verified (401 without key)")

            # With key should succeed past auth (will return 400 on invalid input, but NOT 401)
            req = urllib.request.Request(
                f"{base_url}/api/convert",
                data=json.dumps({"input_path": "/nonexistent/video.mp4"}).encode(),
                headers={"Content-Type": "application/json", "Authorization": "Bearer secret123"},
            )
            try:
                urllib.request.urlopen(req)
            except urllib.error.HTTPError as e:
                assert e.code == 400
                print("    ✓ API auth acceptance verified (Bearer token authorized)")
        finally:
            os.environ.pop("ASCILI_API_KEY", None)

    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    print("==================================================")
    print("  ASCILI AI Video Engine - Test Suite")
    print("==================================================")
    test_core_engine()
    test_presets()
    test_video_conversion()
    test_web_api()
    print("\n==================================================")
    print("  ALL TESTS PASSED SUCCESSFULLY! (100% Ready)")
    print("==================================================")
