# Ascii-Streamer 2.0 (ASCILI)

```text
    _   ___  ___ ___ ___   ___ _____ ___ ___   _   __  __ ___ ___ 
   /_\ / __|/ __|_ _|_ _| / __|_   _| _ \ __| /_\ |  \/  | __| _ \
  / _ \\__ \ (__ | | | |  \__ \ | | |   / _| / _ \| |\/| | _||   /
 /_/ \_\___/\___|___|___| |___/ |_| |_|_\___/_/ \_\_|  |_|___|_|_\  v2.0
```

> **High-Performance ASCII Video Streaming, Real-Time Webcam Workstation, Photorealistic Dithering, Social Media Presets, and 24 FPS YouTube `.ytt` Animated Color Subtitles.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.5.2-orange.svg)](https://pnpm.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![PWA](https://img.shields.io/badge/PWA-100%25%20Offline-7928CA.svg)](#pwa--100-offline-support)
[![YouTube](https://img.shields.io/badge/YouTube-.ytt%20Subtitles-FF0000.svg)](#youtube-timed-text-ytt-animation-guide)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
  - [1. Real-Time ASCII Engine & Dithering](#1-real-time-ascii-engine--dithering)
  - [2. YouTube Captions (.ytt) Color ASCII Animation](#2-youtube-captions-ytt-color-ascii-animation)
  - [3. Social Media Presets & Aspect Ratios](#3-social-media-presets--aspect-ratios)
  - [4. Webcam & Streamer Quality of Life (QoL)](#4-webcam--streamer-quality-of-life-qol)
  - [5. Custom Character Sets & Free Color Picker](#5-custom-character-sets--free-color-picker)
  - [6. Comprehensive Export Suite with Live Preview](#6-comprehensive-export-suite-with-live-preview)
  - [7. PWA & 100% Offline Support](#7-pwa--100-offline-support)
- [YouTube Timed Text (.ytt) Animation Guide](#youtube-timed-text-ytt-animation-guide)
- [Export Formats Reference](#export-formats-reference)
- [Architecture & Monorepo Structure](#architecture--monorepo-structure)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Production Build & Serving](#production-build--serving)
- [Docker & Containerized Deployment](#docker--containerized-deployment)
- [Cloud Deployment (Railway & GitHub Pages)](#cloud-deployment-railway--github-pages)
- [API Endpoints & Security Controls](#api-endpoints--security-controls)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [License](#license)

---

## Overview

**Ascii-Streamer 2.0 (ASCILI)** is an advanced dual-engine ASCII media workstation designed for content creators, live streamers, and retro-computing enthusiasts:

- **Client-Side Engine (`artifacts/ascili`)**: Zero-latency HTML5 Canvas/WebGL engine capable of transforming live webcam streams, screen recordings, and local video files into ASCII animations at up to 60 FPS in full 24-bit TrueColor or retro phosphor green.
- **Backend API & Server (`artifacts/api-server`)**: Hardened Express 5 server providing unified static file serving, safe Single-Page Application (SPA) routing, CORS allowlists, sliding-window rate limiting, and health monitoring.
- **Python Video Processing Engine (`ai_video_engine`)**: Server-side engine utilizing NumPy, pycairo, FFmpeg, and standard library HTTP server for offline batch conversions, 1080p rendering with audio preservation, and headless pipelines.

---


## Key Features

### 1. Real-Time ASCII Engine & Dithering
* **High-Speed Rendering**: Renders high-density ASCII video in real-time with sub-millisecond character rasterization.
* **Photorealistic Dithering Algorithms**:
  * **Floyd-Steinberg**: Error-diffusion dithering for photorealistic shading and ultra-smooth gradients.
  * **Atkinson**: Preserves high-contrast edges and crisp detail (classic 1-bit Macintosh aesthetic).
  * **Bayer 4×4 & 8×8**: Ordered spatial matrix dithering producing a stylish retro-arcade look.
  * **Threshold (None)**: Clean quantization for bold, minimalist typography.
* **Braille 2×4 Cell Mode**: High-definition sub-pixel rendering using Unicode Braille patterns (`⠀`–`⣿`) yielding 8× the effective resolution of standard characters.

### 2. YouTube Captions (.ytt) Color ASCII Animation
* Converts full-motion video directly into **YouTube Timed Text (`.ytt`)** format.
* **Full 24-bit RGB Color**: Generates color span tags rendered natively by YouTube's subtitle player.
* **High Frame Rates (2 to 24 FPS)**: Choose 2, 4, 8, 12, 16, or 24 FPS for fluid playback.
* **Smart Size Budgeting**: Automatically calculates and respects YouTube's strict **20 MB upload ceiling**, with real-time payload estimation and warning thresholds.

### 3. Social Media Presets & Aspect Ratios
* **Aspect Ratio Modes**:
  * `16:9` Widescreen (YouTube, Twitch, Desktop).
  * `9:16` Vertical (TikTok, Instagram Reels, YouTube Shorts).
  * `1:1` Square (Instagram feed, Discord avatars, social media posts).
  * `Native`: Uncropped original source dimensions.
* **Crop-Box Correction**: Non-destructive centered aspect-ratio cropping prevents character distortion and stretching.

### 4. Webcam & Streamer Quality of Life (QoL)
* **Real-Time Camera Mirroring**: Horizontal flip toggle for natural video framing while streaming.
* **Camera Device Switching**: Effortlessly switch between front/back or external USB capture cards without reloading.
* **Post-Processing Sliders**: Live brightness, contrast, gamma, and invert controls.
* **Performance Limiter**: Dynamic target FPS limiter (5 to 60 FPS) and column resolution slider (20 to 240 cols) to minimize CPU/GPU load during gaming or live streaming.
* **Streamer Clean Mode**: Hide controls and UI chrome for clean OBS window capture.

### 5. Custom Character Sets & Free Color Picker
* **Built-in Character Presets**: Standard ASCII (` .:-=+*#%@`), Dense (` .'`,:;Il!i><~+_-?][}{1)(|\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$`), Blocks (` ░▒▓█`), Matrix Katakana, and Braille.
* **Custom Character Input**: Enter any custom string of characters or emojis to generate unique artistic textures.
* **Free Custom Color Pickers**: Custom hex/RGB pickers for both character text and background canvas.
* **Retro Terminal Palettes**: Green Phosphor (P1 CRT), Amber CRT (P3), Cyberpunk Cyan, Monochrome, and TrueColor 24-bit RGB.

### 6. Comprehensive Export Suite with Live Preview
* **Live Export Render Preview**: Dedicated preview canvas renders ASCII output immediately upon loading a file or changing settings, and mirrors live frames at ~20 FPS during conversion.
* **Supported Export Formats**:
  * **Video**: `.mp4` (H.264 / AVC) and `.webm` (VP8/VP9) with automatic audio-codec conflict resolution.
  * **Subtitles**: `.ytt` (YouTube Timed Text), `.vtt` (WebVTT), `.srt` (SubRip), and `.ass` (Advanced SubStation Alpha).
  * **Animated GIF**: NeuQuant palette quantization and LZW compression directly in the browser.
  * **Static**: `.png` high-res image, styled `.html` terminal document, and raw `.txt` file.

### 7. PWA & 100% Offline Support
* **Progressive Web App**: Fully functional offline via Service Worker asset caching.
* **Zero Cloud Dependency**: Client-side conversion processes video entirely inside the browser's sandbox without uploading media to third-party servers.
* **Installable**: One-click install to desktop or mobile home screen on Chrome, Edge, Safari, and Android.

---

## YouTube Timed Text (.ytt) Animation Guide

YouTube's subtitle renderer supports rich XML styling through the `.ytt` (YouTube Timed Text) format. Ascii-Streamer allows you to stream entire ASCII animations inside YouTube captions!

### Step-by-Step Instructions:
1. **Prepare Your Video in Ascii-Streamer**:
   - Open Ascii-Streamer and load your video.
   - Click **Export / Convert** (or press <kbd>C</kbd>).
   - In the **Export Format** dropdown, select **YouTube Subtitles (.ytt)**.
   - Choose your **Column Resolution** (80 or 100 columns recommended).
   - Select your **Target Frame Rate** (e.g., 12 FPS or 24 FPS).
   - Verify the ASCII render in the **Render Preview** area.
   - Click **Start Conversion** and wait for the file to process.
   - Click **Download .ytt**.

2. **Upload to YouTube Studio**:
   - Navigate to [YouTube Studio](https://studio.youtube.com).
   - Select your video and click **Subtitles** from the left navigation menu.
   - Click **Add Language** (e.g., *English*).
   - Under the Subtitles column, click **Add**.
   - Click **Upload file** → select **With timing** → click **Continue**.
   - Select the downloaded `.ytt` file.
   - Click **Publish**.
   - Watch your video on YouTube with Closed Captions (**CC**) enabled!

> [!TIP]
> **Staying Under YouTube's 20 MB Limit**:
> - YouTube strictly rejects caption files larger than **20 MB**.
> - For short clips (< 2 minutes), 100 columns at 24 FPS will easily fit within 20 MB.
> - For longer videos (5 to 14 minutes), select **80 columns** and **6–12 FPS**, or use monochrome color mode to stay comfortably under the 20 MB ceiling.

---

## Export Formats Reference

| Format | Extension | Type | Color Support | Recommended Settings | Best For |
|---|---|---|---|---|---|
| **YouTube Timed Text** | `.ytt` | Subtitle | Full 24-bit RGB / Mono | 80–100 cols, 6–24 FPS | YouTube Closed Captions animations |
| **WebVTT** | `.vtt` | Subtitle | Monochrome | 32–40 cols, 2–4 FPS | Web video players, HTML5 `<track>` |
| **SubRip** | `.srt` | Subtitle | Monochrome | 32–40 cols, 2–4 FPS | VLC, media players, universal subtitles |
| **Advanced SubStation** | `.ass` | Subtitle | Full RGB Color | 80–160 cols, 10–24 FPS | Anime stylization, Aegisub, desktop players |
| **MP4 Video** | `.mp4` | Video | 24-bit RGB | 80–160 cols, 24–60 FPS | Social media sharing, YouTube uploads |
| **WebM Video** | `.webm` | Video | 24-bit RGB | 80–160 cols, 24–60 FPS | Web embeds, Discord clips |
| **Animated GIF** | `.gif` | Image | 256-color NeuQuant | 40–80 cols, 10–15 FPS | GitHub READMEs, Discord stickers, forums |
| **PNG Snapshot** | `.png` | Image | 24-bit RGB | Any resolution | Wallpapers, album covers, prints |
| **HTML Page** | `.html` | Document | 24-bit RGB / CRT | Any resolution | Standalone web pages, embedding |
| **Raw Text** | `.txt` | Plaintext | Monochrome | Any resolution | Terminal `cat`, code comments, copy-paste |

---

## Architecture & Monorepo Structure

```text
.
├── artifacts/
│   ├── ascili/                 # Core Web Client (HTML5 / Vanilla JS / Canvas / PWA)
│   │   ├── src/
│   │   │   ├── engine.js       # ASCII rasterizer, crop boxes, color & dithering math
│   │   │   ├── exporter.js     # Exporters (.txt, .html, .png, .gif, .mp4, .ytt, .srt)
│   │   │   ├── gif-encoder.js  # NeuQuant palette reduction + LZW animated GIF encoder
│   │   │   └── app.js          # UI controller, state management, preview & streams
│   │   ├── index.html          # Web application shell & export modal layout
│   │   ├── manifest.json       # Progressive Web App manifest
│   │   ├── sw.js               # Service Worker for offline asset caching
│   │   └── vite.config.ts      # Vite build configuration with safe host binding
│   ├── api-server/             # Express 5 production backend & static host
│   │   ├── src/
│   │   │   ├── app.ts          # Express app, Helmet CSP, CORS allowlist, SPA fallback
│   │   │   ├── index.ts        # Server bootstrap with graceful SIGINT/SIGTERM handling
│   │   │   └── routes.ts       # Healthcheck, status, and API routes
│   │   └── build.mjs           # Fast esbuild production bundling script
│   └── mockup-sandbox/         # Rapid UI testing environment
├── lib/
│   ├── api-spec/               # OpenAPI / Orval schema specifications
│   ├── api-zod/                # Zod validation schemas
│   ├── api-client-react/       # React Query client hooks
│   └── db/                     # Drizzle ORM database layer (PostgreSQL)
├── ai_video_engine/            # Python backend engine (NumPy / pycairo / FFmpeg)
├── .github/workflows/
│   ├── ci.yml                  # Automated typecheck, build, and Python test pipeline
│   └── deploy.yml              # GitHub Pages deployment workflow
├── Dockerfile                  # Multi-stage production container build
├── docker-compose.yml          # Container orchestration (Node API + optional Python engine)
├── docker-entrypoint.sh        # Container startup script with dumb-init signal handling
├── LICENSE                     # MIT License
└── pnpm-workspace.yaml         # Pnpm workspace definition and dependency policies
```

---

## Prerequisites

- **Node.js**: `>= 20.0.0` (LTS recommended)
- **pnpm**: `>= 9.0.0` (Pinned to `10.5.2`)
- **Docker & Docker Compose** (optional, for containerized deployments)
- **Python**: `>= 3.10` with `numpy`, `pycairo`, and `ffmpeg` (for `ai_video_engine`)

---

## Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/louicastro/Ascii-Streamer-2.0.git
   cd Ascii-Streamer-2.0
   ```

2. **Install workspace dependencies**:
   ```bash
   pnpm install
   ```

3. **Start the Frontend Development Server**:
   ```bash
   pnpm --filter @workspace/ascili dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Start the API Server** (in a separate terminal):
   ```bash
   pnpm --filter @workspace/api-server dev
   ```

5. **Typecheck all workspace packages**:
   ```bash
   pnpm run typecheck
   ```

---

## Production Build & Serving

1. **Build all packages and frontend bundles**:
   ```bash
   pnpm run build
   pnpm --filter @workspace/ascili run build
   ```
   The client application compiles into `artifacts/ascili/dist/public`.

2. **Start the production server**:
   ```bash
   pnpm --filter @workspace/api-server start
   ```
   The Express server serves the frontend at `/` with safe SPA routing, while exposing API endpoints at `/api/*`.

---

## Docker & Containerized Deployment

### Standalone Docker Build

```bash
# Build the production image
docker build -t ascii-streamer .

# Run the container
docker run -p 3000:3000 -e NODE_ENV=production ascii-streamer
```

### Docker Compose

```bash
docker-compose up --build
```
This boots:
- `ascii-streamer-api`: Node.js server and ASCILI web application on port `3000`

### Python AI Video Engine (`ai_video_engine`)

The Python engine provides high-resolution edge-aware structural perception and headless video conversion:
- **Throughput**: ~12–15 FPS for full 1080p60 Cairo rasterization on CPU with audio preservation; ~40+ FPS for raw ASCII conversion.
- **Run Standalone Server**:
  ```bash
  python3 -m ai_video_engine.server 8000
  ```
- **Run Engine Tests**:
  ```bash
  pytest ai_video_engine/test_engine.py
  ```

---

## Cloud Deployment (Railway & GitHub Pages)

### Railway Deployment
The project is configured for seamless deployment on Railway via `railway.json` and `Dockerfile`:
1. Link your GitHub repository to Railway.
2. Railway detects `railway.json` and builds via `Dockerfile`.
3. Health check runs automatically against `/api/health`.
4. Environment variables to configure (optional):
   - `PORT`: Automatically assigned by Railway (defaults to 3000).
   - `DATABASE_URL`: Connection string for PostgreSQL (if persistence is enabled).
   - `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS domains.

### GitHub Pages Deployment
A GitHub Actions workflow is provided in `.github/workflows/deploy.yml`:
- Pushing to `main` automatically builds `artifacts/ascili` and deploys the static site to GitHub Pages.
- Handles base URL subpath routing automatically.

---

## API Endpoints & Security Controls

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the ASCILI frontend web application |
| `GET` | `/api/health` | Health probe returning status, uptime, and version (Zod validated) |
| `GET` | `/api/status` | Reports API status and database connectivity |
| `*` | `/api/*` | Unknown routes return JSON `{"error": "Not found", "path": "..."}` with 404 |

### Hardened Security Features
- **Zero-Dependency Security Headers**: Injected Content Security Policy (CSP), Strict-Transport-Security (HSTS), X-Content-Type-Options: `nosniff`, X-Frame-Options: `SAMEORIGIN`, and Permissions-Policy.
- **CORS Hardening**: Strict origin allowlist configurable via `ALLOWED_ORIGINS`.
- **Sliding-Window Rate Limiter**: 120 requests/min per IP on public API endpoints with automatic header feedback (`Retry-After`).
- **Body & Parameter Size Limits**: 1 MB payload limits to prevent buffer exhaustion attacks.
- **Sanitized Errors**: Production responses conceal stack traces and internal paths.
- **Non-Root Container**: Docker container runs under unprivileged `node` user with `dumb-init` signal handling.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Space</kbd> | Play / Pause video playback |
| <kbd>M</kbd> | Mute / Unmute audio |
| <kbd>F</kbd> | Toggle Fullscreen mode |
| <kbd>C</kbd> | Open Export / Converter modal |
| <kbd>H</kbd> | Toggle UI controls (Streamer clean mode) |
| <kbd>R</kbd> | Reset video to beginning |
| <kbd>Esc</kbd> | Close export modal or exit fullscreen |

---

## Troubleshooting & FAQ

#### 1. Why did subtitle export fail or freeze on frame 0?
Ensure you are using the latest version. Previous versions had a scoping bug with undeclared cue durations that has been fully resolved. For YouTube `.ytt`, also ensure your video length and column count stay under the 20 MB YouTube upload limit.

#### 2. Why does the video appear cropped or stretched?
Check your **Aspect Ratio** dropdown:
- **Native**: Keeps the exact dimensions of your original video.
- **16:9** or **9:16**: Applies non-distorted centered crop boxing.

#### 3. Video export fails on my browser?
Certain browsers do not support recording audio tracks alongside canvas capture streams. Ascii-Streamer automatically detects this and falls back to video-only encoding with compatible WebM/MP4 codecs.

#### 4. How do I configure CORS for custom domains?
Set the `ALLOWED_ORIGINS` environment variable in your production environment:
```bash
export ALLOWED_ORIGINS="https://mywebsite.com,https://stream.mywebsite.com"
```

---

## License

This project is licensed under the [MIT License](LICENSE).
