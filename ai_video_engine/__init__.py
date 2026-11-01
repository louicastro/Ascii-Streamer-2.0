"""
ASCILI AI Video Engine
High-performance, edge-aware, temporally coherent ASCII video perception and conversion engine.
Pure Python + NumPy + PyCairo / FFmpeg with ZERO external API keys.
"""

from .engine import AsciiAIEngine, EngineConfig, Preset
from .video_processor import VideoProcessor, ConversionJob, VideoMeta

__all__ = [
    "AsciiAIEngine",
    "EngineConfig",
    "Preset",
    "VideoProcessor",
    "ConversionJob",
    "VideoMeta",
]

__version__ = "2.0.0"
