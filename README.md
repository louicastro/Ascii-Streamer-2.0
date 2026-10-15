# Ascii-Streamer 2.0 (ASCILI)

> High-performance ASCII video streaming, real-time webcam conversion, social media presets, dithering algorithms, and YouTube `.ytt` animated color subtitles.

---

## Table of Contents

- [Overview](#overview)
- [Architecture & Monorepo Structure](#architecture--monorepo-structure)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Production Build & Serving](#production-build--serving)
- [Docker & Containerized Deployment](#docker--containerized-deployment)
- [Cloud Deployment (Railway & GitHub Pages)](#cloud-deployment-railway--github-pages)
- [Key Features](#key-features)
  - [1. Real-Time ASCII Engine & Dithering](#1-real-time-ascii-engine--dithering)
  - [2. YouTube Captions (.ytt) Export](#2-youtube-captions-ytt-export)
  - [3. Social Media & Video Export](#3-social-media--video-export)
  - [4. Webcam & Streamer Controls](#4-webcam--streamer-controls)
  - [5. PWA & Offline Support](#5-pwa--offline-support)
- [API Endpoints & Security Controls](#api-endpoints--security-controls)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [License](#license)

---

## Overview

**Ascii-Streamer 2.0 (ASCILI)** is a dual-engine ASCII media workstation:
- **Client-Side Engine (`artifacts/ascili`)**: Zero-latency HTML5 Canvas/WebGL engine capable of transforming live webcam streams, screen recordings, and local video files into ASCII animations at up to 60 FPS in full color or classic terminal green.
- **Backend API & Server (`artifacts/api-server`)**: Hardened Express 5 server providing unified static file serving, safe Single-Page Application (SPA) routing, CORS controls, rate limiting, and health monitoring.
- **Python Processing Engine (`ai_video_engine`)**: Server-side engine utilizing OpenCV, NumPy, and FastAPI for offline video transformation, batch exports, and high-resolution rendering.

---

## Architecture & Monorepo Structure

```
.
├── artifacts/
│   ├── ascili/                 # Core Web Client (HTML5 / Vanilla JS / Canvas / PWA)
│   │   ├── src/
│   │   │   ├── engine.js       # ASCII rasterizer, crop boxes, color & dithering math
│   │   │   ├── exporter.js     # Exporters (.txt, .html, .png, .gif, .mp4, YouTube .ytt)
│   │   │   ├── gif-encoder.js  # Client-side NeuQuant + LZW animated GIF encoder
│   │   │   └── app.js          # UI controller, event handlers, and device streams
│   │   └── vite.config.ts      # Client build configuration
│   ├── api-server/             # Express 5 production backend & static host
│   │   ├── src/
│   │   │   ├── app.ts          # Express app, security middleware, SPA fallback
│   │   │   ├── index.ts        # Server entrypoint with graceful shutdown
│   │   │   └── routes.ts       # Healthcheck, status, and API routes
│   │   └── build.mjs           # esbuild bundling script
│   └── mockup-sandbox/         # Rapid UI testing environment
├── lib/
│   ├── api-spec/               # OpenAPI / Orval schema specifications
│   ├── api-zod/                # Zod schemas generated from API spec
│   ├── api-client-react/       # React Query client hooks
│   └── db/                     # Drizzle ORM database layer (PostgreSQL)
├── ai_video_engine/            # Python backend engine (OpenCV / FastAPI)
├── .github/workflows/
│   ├── ci.yml                  # Automated typecheck & build pipeline
│   └── deploy.yml              # GitHub Pages deployment workflow
├── Dockerfile                  # Multi-stage production container build
├── docker-compose.yml          # Local containerized orchestration (Postgres + Node)
├── docker-entrypoint.sh        # Container startup script with signal forwarding
└── pnpm-workspace.yaml         # Pnpm workspace definition and dependency policies
```

---

## Prerequisites

- **Node.js**: `>= 20.0.0` (LTS recommended)
- **pnpm**: `>= 9.0.0` (Pinned to `10.5.2`)
- **Docker & Docker Compose** (optional, for container runs)
- **Python**: `>= 3.10` with `numpy` & `opencv-python` (optional, for `ai_video_engine`)

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

4. **Start the API Server**:
   ```bash
   pnpm --filter @workspace/api-server dev
   ```

5. **Typecheck all packages**:
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
   The frontend assets are bundled into `artifacts/ascili/dist/public`.

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

### Docker Compose (API + PostgreSQL)

```bash
docker-compose up --build
```
This boots:
- `ascii-streamer-db`: PostgreSQL 16 on port `5432`
- `ascii-streamer-api`: Node.js server on port `3000`

---

## Cloud Deployment (Railway & GitHub Pages)

### Railway Deployment
The project is configured for one-click deployment on Railway using `railway.json` and `Dockerfile`:
1. Connect your GitHub repository to Railway.
2. Railway detects `railway.json` and builds via `Dockerfile`.
3. Health check runs automatically against `/api/health`.
4. Environment variables to configure (optional):
   - `PORT`: Automatically assigned by Railway (defaults to 3000).
   - `DATABASE_URL`: Connection string for Postgres (if database features are used).
   - `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS domains.

### GitHub Pages Deployment
A GitHub Actions workflow is provided in `.github/workflows/deploy.yml`:
- Pushing to `main` automatically builds `artifacts/ascili` and deploys the static site to GitHub Pages.
- Handles base URL configuration automatically.

---

## Key Features

### 1. Real-Time ASCII Engine & Dithering
- **Presets**: Classic Terminal Green, Matrix Rain, True Color (24-bit RGB), Braille 2x4 cell mapping, Block Pixels.
- **Photorealistic Dithering**:
  - `None`: Threshold quantization.
  - `Floyd-Steinberg`: Error-diffusion dithering for smooth gradients.
  - `Atkinson`: High-contrast dithering preserving sharp edges.
  - `Bayer 4x4 & 8x8`: Ordered matrix dithering for retro aesthetic.

### 2. YouTube Captions (.ytt) Export
- Generates YouTube-compliant `.ytt` subtitle files with colored ASCII frames.
- Configurable frame rate (2 FPS up to 24 FPS).
- Complies with YouTube's 20MB subtitle size limit via frame compression and color run-length encoding.

### 3. Social Media & Video Export
- **Aspect Ratio Presets**:
  - `16:9` Landscape (YouTube, Twitch, Desktop).
  - `9:16` Vertical (TikTok, Instagram Reels, YouTube Shorts).
  - `1:1` Square (Instagram feed, profile avatars).
- **Export Formats**:
  - `.txt`: Raw ASCII text frame.
  - `.html`: Styled terminal document.
  - `.png`: High-resolution snapshot with custom background.
  - `.gif`: Animated GIF with neuquant palette reduction.
  - `.mp4`: Direct video recording via MediaRecorder.

### 4. Webcam & Streamer Controls
- Horizontal camera mirroring.
- Brightness, contrast, gamma, and invert controls.
- Dynamic column resolution slider (20 to 240 columns).
- Frame rate limiter (5 to 60 FPS) to optimize CPU/GPU usage.

### 5. PWA & Offline Support
- Fully functional offline via Service Worker and Web Manifest.
- Installable as a native desktop or mobile application.

---

## API Endpoints & Security Controls

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the ASCILI frontend web application |
| `GET` | `/api/health` | Health probe returning status, uptime, and version (Zod validated) |
| `GET` | `/api/status` | Reports API status and database connectivity |
| `*` | `/api/*` | Unknown routes return JSON `{"error": "Not found", "path": "..."}` with 404 |

### Security Features
- **Zero-Dependency Security Headers**: Injected Content Security Policy (CSP), Strict-Transport-Security (HSTS), X-Content-Type-Options: `nosniff`, X-Frame-Options: `SAMEORIGIN`, and Permissions-Policy.
- **CORS Hardening**: Strict origin allowlist configurable via `ALLOWED_ORIGINS`.
- **Sliding-Window Rate Limiter**: 120 requests/min per IP on public API endpoints with automatic header feedback (`Retry-After`).
- **Body & Parameter Size Limits**: 1MB payload limits to prevent buffer exhaustion attacks.
- **Sanitized Errors**: Production responses conceal stack traces and internal paths.
- **Non-Root Container**: Docker container runs under unprivileged `node` user with `dumb-init` signal handling.

---

## Troubleshooting & FAQ

#### 1. Why does the video appear distorted or cropped?
Ensure the Aspect Ratio setting matches your media. Selecting `Native` uses the exact input dimensions, while `16:9` or `9:16` applies centered crop-boxing without stretching.

#### 2. Subtitle upload fails on YouTube?
YouTube limits `.ytt` caption files to 20MB. For long videos (> 5 minutes), reduce the export FPS to 6–12 FPS or lower the column count to 60–80 columns.

#### 3. How to allow external domains to access the API?
Set the `ALLOWED_ORIGINS` environment variable to a comma-separated list of origins:
```bash
export ALLOWED_ORIGINS="https://mywebsite.com,https://stream.mywebsite.com"
```

---

## License

This project is licensed under the [MIT License](LICENSE).
