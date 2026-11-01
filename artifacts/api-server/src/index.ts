import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] || "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
  console.log(`✓ API server running on http://localhost:${port}`);
  console.log(`✓ Frontend available on http://localhost:${port}/`);
  console.log(`✓ API health on http://localhost:${port}/api/health`);
});

function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Received signal, initiating graceful shutdown");
  server.close(() => {
    logger.info("HTTP server closed cleanly");
    process.exit(0);
  });

  // Force close after 10s if connections remain active
  setTimeout(() => {
    logger.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
