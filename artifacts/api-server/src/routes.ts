import { Router } from "express";
import type { Request, Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { logger } from "./lib/logger";

const router = Router();

/**
 * Health check endpoint
 */
router.get("/health", (_req: Request, res: Response) => {
  const healthData = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0",
  };
  // Validate schema compatibility
  HealthCheckResponse.parse(healthData);
  res.json(healthData);
});

/**
 * API status
 */
router.get("/status", (_req: Request, res: Response) => {
  res.json({
    api: "ascii-streamer",
    status: "online",
    database: process.env.DATABASE_URL ? "configured" : "not configured",
  });
});

/**
 * Catch-all JSON 404 for unknown /api/* routes
 */
router.use((req: Request, res: Response) => {
  logger.warn({ path: req.path }, "API route not found");
  res.status(404).json({
    error: "Not found",
    path: req.path,
  });
});

export default router;
