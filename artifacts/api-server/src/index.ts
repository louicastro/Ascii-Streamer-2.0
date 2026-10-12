import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] || "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  logger.info({ port }, "Server listening");
  console.log(`✓ API server running on http://localhost:${port}`);
  console.log(`✓ Frontend available on http://localhost:${port}/`);
  console.log(`✓ API docs on http://localhost:${port}/api/health`);
});
