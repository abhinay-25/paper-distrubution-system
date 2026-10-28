import express from "express";
import { env } from "./config/env.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  // --- Global middleware ---
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "1mb" }));

  // CORS policy with credential support for HttpOnly session cookies
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", env.CORS_ORIGIN);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-CSRF-Token, X-Request-Id, X-Institution-Id, X-User-Id, X-User-Role",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // --- Routes ---
  app.use("/api", apiRouter);

  // 404 catch-all (must be before the error handler)
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // --- Global error handler (must be last) ---
  app.use(errorHandler);

  return app;
}
