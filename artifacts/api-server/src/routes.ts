import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "./lib/logger";

const router = Router();

/**
 * Health check endpoint
 */
router.get("/health", (req: Request, res: Response) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0",
  };
  res.json(health);
});

/**
 * API status
 */
router.get("/status", (req: Request, res: Response) => {
  res.json({
    api: "ascii-streamer",
    status: "online",
    database: process.env.DATABASE_URL ? "configured" : "not configured",
  });
});

/**
 * Catch-all 404
 */
router.use((req: Request, res: Response) => {
  logger.warn({ path: req.path }, "Not found");
  res.status(404).json({
    error: "Not found",
    path: req.path,
  });
});

export default router;
