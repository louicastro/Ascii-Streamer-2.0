"""
ASCILI AI Video Engine - Command Line Interface (CLI)
Enables video conversion, terminal playback, and launching the web server.
"""

import sys
import os
import time
import argparse
import subprocess
import numpy as np

from .engine import AsciiAIEngine, EngineConfig, PRESETS, CHAR_SETS
from .video_processor import VideoProcessor
from .server import run_server


def play_in_terminal(video_path: str, cols: int = 100, preset_name: str = "matrix", fps_limit: float = 30.0):
    """Play any video file directly in the terminal as real-time ASCII art."""
    if not os.path.exists(video_path):
        print(f"Error: Video file not found: {video_path}")
        return

    meta = VideoProcessor.probe_video(video_path)
    cfg = PRESETS.get(preset_name, PRESETS["matrix"])
    cfg.cols = cols
    engine = AsciiAIEngine(cfg)

    # Spawn FFmpeg decoder
    target_fps = min(meta.fps, fps_limit) if meta.fps > 0 else 30.0
    w, h = 320, 180  # Downscaled for terminal throughput
    cmd = [
        "ffmpeg", "-i", video_path,
        "-r", str(target_fps),
        "-s", f"{w}x{h}",
        "-f", "image2pipe",
        "-pix_fmt", "rgb24",
        "-vcodec", "rawvideo",
        "-",
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=10**6)
    frame_bytes = w * h * 3
    frame_time = 1.0 / target_fps

    # Clear terminal
    sys.stdout.write("\033[2J\033[H")
    sys.stdout.flush()

    try:
        while True:
            t0 = time.perf_counter()
            raw = proc.stdout.read(frame_bytes)
            if len(raw) < frame_bytes:
                break

            frame = np.frombuffer(raw, dtype=np.uint8).reshape((h, w, 3))
            lines, colors = engine.process_frame(frame, target_cols=cols)
            ansi_text = engine.to_ansi(lines, colors)

            # Move cursor to home and redraw
            sys.stdout.write("\033[H" + ansi_text + "\n")
            sys.stdout.flush()

            elapsed = time.perf_counter() - t0
            sleep_time = frame_time - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

    except KeyboardInterrupt:
        pass
    finally:
        proc.kill()
        sys.stdout.write("\033[0m\n")


def convert_video_cli(args):
    """Batch video conversion command."""
    input_file = args.input
    output_file = args.output or f"ascii_{os.path.splitext(os.path.basename(input_file))[0]}.mp4"
    
    preset = PRESETS.get(args.preset, PRESETS["matrix"])
    if args.cols:
        preset.cols = args.cols
    if args.color_mode:
        preset.color_mode = args.color_mode

    print(f"============================================================")
    print(f"  ASCILI AI Video Engine - Converting Video")
    print(f"  Input:       {input_file}")
    print(f"  Output:      {output_file}")
    print(f"  Preset:      {args.preset.upper()}")
    print(f"  Resolution:  {args.res or 'Source'}")
    print(f"  FPS Target:  {args.fps or 'Source'}")
    print(f"  Columns:     {preset.cols}")
    print(f"  Color Mode:  {preset.color_mode}")
    print(f"============================================================")

    proc = VideoProcessor(AsciiAIEngine(preset))

    def on_prog(progress):
        eta_str = f"{int(progress.eta_seconds)}s" if progress.eta_seconds else "--"
        sys.stdout.write(
            f"\rProgress: [{progress.percent:5.1f}%] "
            f"Frame: {progress.current_frame}/{progress.total_frames} | "
            f"Speed: {progress.fps_processing:.1f} FPS | "
            f"ETA: {eta_str}   "
        )
        sys.stdout.flush()

    try:
        t0 = time.time()
        proc.convert_video(
            input_path=input_file,
            output_path=output_file,
            config=preset,
            target_fps=args.fps,
            target_resolution=args.res,
            on_progress=on_prog,
        )
        print(f"\nSuccessfully converted in {time.time() - t0:.1f}s -> {output_file}")
    except Exception as ex:
        print(f"\nError: {ex}")


def main():
    parser = argparse.ArgumentParser(description="ASCILI AI Video Engine (Raw Python, No API Keys)")
    parser.add_argument("input", nargs="?", help="Input video file path")
    parser.add_argument("output", nargs="?", help="Output video file path (.mp4 or .webm)")
    parser.add_argument("--preset", choices=list(PRESETS.keys()), default="matrix", help="AI aesthetic preset")
    parser.add_argument("--cols", type=int, help="Number of ASCII columns")
    parser.add_argument("--color-mode", choices=["monochrome", "truecolor", "ansi256", "ansi16", "grayscale"], help="Color mode")
    parser.add_argument("--fps", type=int, help="Target framerate (e.g. 30, 60, 120)")
    parser.add_argument("--res", choices=["720p", "1080p", "1440p", "2k", "4k"], default="1440p", help="Target output resolution")
    parser.add_argument("--play", action="store_true", help="Play video directly inside terminal")
    parser.add_argument("--serve", action="store_true", help="Start the web server for the website")
    parser.add_argument("--port", type=int, default=8000, help="Web server port (default: 8000)")

    args = parser.parse_args()

    if args.serve:
        run_server(port=args.port)
        return

    if not args.input:
        parser.print_help()
        return

    if args.play:
        play_in_terminal(args.input, cols=args.cols or 100, preset_name=args.preset, fps_limit=args.fps or 30.0)
    else:
        convert_video_cli(args)


if __name__ == "__main__":
    main()
