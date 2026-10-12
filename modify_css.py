import re

with open("artifacts/ascili/src/style.css", "r") as f:
    content = f.read()

# 1. Scrollbar update
content = re.sub(
    r"::-webkit-scrollbar \{ width: 4px; height: 4px; \}.*?::-webkit-scrollbar-thumb \{ background: var\(--border-bright\); \}",
    """::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--green-muted); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--green-dim); }""",
    content,
    flags=re.DOTALL
)

# 2. settings-panel update
content = re.sub(
    r"\.settings-panel \{(.*?)transition: width 0\.2s ease, opacity 0\.2s ease;(.*?)\}\s*\.settings-panel\.collapsed \{(.*?)width: 0;(.*?)\}",
    r""".settings-panel {\1transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
  transform: translateX(0);\2}
.settings-panel.collapsed {\3width: 0;
  transform: translateX(100%);\4}""",
    content,
    flags=re.DOTALL
)

# 3. Source preview update
content = re.sub(
    r"\.source-preview \{(.*?)display: none;\n\}",
    r""".source-preview {\1display: none;
  cursor: grab;
  resize: both;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
.source-preview:active { cursor: grabbing; }
.source-preview::after {
  content: '||';
  position: absolute;
  top: 4px;
  right: 4px;
  color: var(--fg-dim);
  font-size: 8px;
  pointer-events: none;
  opacity: 0.5;
}
.source-preview:hover { border-color: var(--green-dim); }""",
    content,
    flags=re.DOTALL
)

# 4. Add new styles at the end
additions = """
/* ─── DRAG & DROP ZONE ──────────────────────────────────────── */
.ascii-container.drop-active {
  border: 2px dashed var(--green);
  background: rgba(57, 255, 82, 0.05);
}
.ascii-container.drop-active::after {
  content: 'DROP FILE HERE';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
  color: var(--green);
  text-shadow: 0 0 16px var(--green);
  z-index: 50;
  background: rgba(0,0,0,0.7);
  pointer-events: none;
}

/* ─── VIDEO TIMELINE BAR ────────────────────────────────────── */
.video-timeline {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--bg-surface);
  z-index: 20;
  display: flex;
  align-items: flex-end;
  transition: height 0.2s ease;
  cursor: pointer;
  opacity: 0;
}
.video-timeline.visible { opacity: 1; }
.video-timeline:hover { height: 8px; }
.vt-bar {
  width: 100%;
  height: 100%;
  background: var(--bg-elevated);
  position: relative;
}
.vt-fill {
  height: 100%;
  background: var(--green);
  width: 0%;
  box-shadow: 0 0 8px rgba(57,255,82,0.5);
  transition: width 0.1s linear;
}
.vt-time, .vt-duration {
  position: absolute;
  bottom: 12px;
  font-size: 9px;
  color: var(--fg);
  background: rgba(0,0,0,0.7);
  padding: 2px 4px;
  border: 1px solid var(--border);
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}
.vt-time { left: 4px; }
.vt-duration { right: 4px; }
.video-timeline:hover .vt-time,
.video-timeline:hover .vt-duration { opacity: 1; }

/* ─── RECORD RESOLUTION PICKER ──────────────────────────────── */
.rec-res-menu {
  position: absolute;
  bottom: calc(100% + 4px);
  right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-bright);
  z-index: 100;
  display: none;
  flex-direction: column;
  min-width: 120px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
}
.rec-res-menu.open { display: flex; }
.rec-res-item {
  padding: 6px 12px;
  font-size: 10px;
  color: var(--fg-dim);
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.rec-res-item:last-child { border-bottom: none; }
.rec-res-item:hover, .rec-res-item.active {
  background: rgba(57, 255, 82, 0.08);
  color: var(--green);
}

/* ─── MONOCHROME COLOR PICKER ───────────────────────────────── */
.color-swatch-row {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  justify-content: space-between;
}
.color-swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  cursor: pointer;
  border: 1px solid var(--border);
  transition: transform 0.2s, box-shadow 0.2s;
}
.color-swatch:hover, .color-swatch.active { transform: scale(1.2); }
.color-swatch[data-color="green"] { background: var(--green); box-shadow: 0 0 6px var(--green); }
.color-swatch[data-color="amber"] { background: var(--amber); box-shadow: 0 0 6px var(--amber); }
.color-swatch[data-color="cyan"] { background: var(--cyan); box-shadow: 0 0 6px var(--cyan); }
.color-swatch[data-color="red"] { background: var(--red); box-shadow: 0 0 6px var(--red); }
.color-swatch[data-color="white"] { background: #fff; box-shadow: 0 0 6px #fff; }
.color-swatch[data-color="purple"] { background: #b000ff; box-shadow: 0 0 6px #b000ff; }

/* ─── SPEED BADGE ───────────────────────────────────────────── */
.speed-badge {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.7);
  border: 1px solid var(--cyan);
  color: var(--cyan);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  z-index: 10;
  display: none;
}
.speed-badge.visible { display: block; }

/* ─── CONVERTER MODAL ENHANCEMENTS ──────────────────────────── */
.cv-frame-count, .cv-speed-badge {
  font-size: 9px;
  color: var(--cyan);
  background: rgba(0, 245, 255, 0.1);
  border: 1px solid var(--cyan);
  padding: 1px 4px;
  margin-left: 8px;
  border-radius: 2px;
}
.cv-loading {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-bright);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: cv-spin 1s linear infinite;
  display: inline-block;
}
@keyframes cv-spin {
  to { transform: rotate(360deg); }
}

/* ─── BUTTON TOOLTIPS ───────────────────────────────────────── */
.icon-btn[title] { position: relative; }
.icon-btn[title]:hover::after {
  content: attr(title);
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-bright);
  color: var(--green);
  font-size: 9px;
  padding: 4px 8px;
  white-space: nowrap;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  pointer-events: none;
}

/* ─── SCANLINES & CRT GLOW ──────────────────────────────────── */
.scanlines {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(255,255,255,0),
    rgba(255,255,255,0) 50%,
    rgba(0,0,0,0.2) 50%,
    rgba(0,0,0,0.2)
  );
  background-size: 100% 4px;
  pointer-events: none;
  z-index: 2;
  opacity: 0.5;
}
.crt-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, rgba(0,0,0,0) 60%, rgba(0,0,0,0.6) 100%);
  pointer-events: none;
  z-index: 3;
}
.glow-text { text-shadow: 0 0 8px currentColor; }

/* ─── MOBILE RESPONSIVE ─────────────────────────────────────── */
@media (max-width: 768px) {
  .topbar {
    flex-direction: column;
    height: auto;
    padding: 8px;
    align-items: stretch;
  }
  .preset-bar {
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .source-bar { justify-content: space-between; }
  .source-btn { flex: 1; justify-content: center; }
  .settings-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100% !important;
    height: 50vh;
    border-left: none;
    border-top: 1px solid var(--border);
    transform: translateY(100%);
    z-index: 100;
  }
  .settings-panel:not(.collapsed) { transform: translateY(0); }
  .stats-bar {
    gap: 8px;
    font-size: 8px;
    justify-content: space-between;
  }
  .stat:nth-child(n+3) { display: none; }
  .settings-title { font-size: 12px; }
  .section-label { font-size: 10px; }
}
"""

with open("artifacts/ascili/src/style.css", "w") as f:
    f.write(content + "\n" + additions)
