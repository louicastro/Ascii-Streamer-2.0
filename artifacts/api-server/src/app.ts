import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);

// 1. Security Headers Middleware (zero-dependency)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), display-capture=(self), microphone=()",
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob: mediastream:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none';",
  );
  next();
});

// 2. Structured Request Logging (pino-http)
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// 3. CORS Configuration
const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

const customOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

const allowedOrigins = new Set([...defaultAllowedOrigins, ...customOrigins]);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (such as same-origin, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.has(origin) ||
        (process.env.NODE_ENV !== "production" &&
          /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      ) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  }),
);

// 4. Request Body Parsing with Strict Limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb", parameterLimit: 1000 }));

// 5. In-Memory Rate Limiting for /api
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 120; // 120 requests per minute

function apiRateLimiter(req: Request, res: Response, next: NextFunction) {
  // Allow health and status probes to bypass rate limiting
  if (req.path === "/health" || req.path === "/status") {
    return next();
  }

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  record.count += 1;
  if (record.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: "Too Many Requests",
      message: `Rate limit exceeded. Please retry after ${retryAfter} seconds.`,
    });
  }

  // Periodic cleanup of stale entries when map exceeds threshold
  if (rateLimitMap.size > 10000) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (now > val.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }

  next();
}

// 6. Mount API router with rate limiting
app.use("/api", apiRateLimiter, router);

// 7. Resolve Frontend Static Directory
function resolvePublicDir(): string | null {
  const currentDir = typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

  const candidates = [
    process.env.PUBLIC_DIR,
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "artifacts/ascili/dist/public"),
    path.resolve(currentDir, "../public"),
    path.resolve(currentDir, "../../ascili/dist/public"),
    path.resolve(currentDir, "../../../artifacts/ascili/dist/public"),
  ].filter((p): p is string => Boolean(p));

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "index.html"))) {
        return dir;
      }
    } catch {
      // Ignore filesystem access errors
    }
  }
  return null;
}

const publicDir = resolvePublicDir();
if (publicDir) {
  logger.info({ publicDir }, "Serving static frontend assets");
  app.use(
    express.static(publicDir, {
      index: false,
      maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
    }),
  );
} else {
  logger.warn("Frontend public directory not found. Static serving disabled.");
}

// 8. Root Route Handler
app.get("/", (_req: Request, res: Response) => {
  if (publicDir) {
    return res.sendFile(path.join(publicDir, "index.html"));
  }
  res.status(200).send("ASCILI API Server is running. Frontend build not found.");
});

// 9. Safe SPA Fallback
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }
  // Never intercept API routes (let router handle with JSON 404)
  if (req.path.startsWith("/api")) {
    return next();
  }
  // Never serve SPA HTML for missing static assets (.js, .css, .png, etc.)
  if (path.extname(req.path)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  // Serve SPA index.html for client-side navigation
  if (publicDir) {
    return res.sendFile(path.join(publicDir, "index.html"));
  }
  next();
});

// 10. Centralized Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err, path: req.path, method: req.method }, "Unhandled server error");

  if (res.headersSent) {
    return next(err);
  }

  const isCorsError = err.message && typeof err.message === "string" && err.message.includes("CORS policy");
  const statusCode = isCorsError ? 403 : (Number(err.status) || Number(err.statusCode) || 500);

  res.status(statusCode).json({
    error: statusCode === 403 ? "Forbidden" : "Internal Server Error",
    message: process.env.NODE_ENV === "production" ? undefined : err.message,
  });
});

export default app;
