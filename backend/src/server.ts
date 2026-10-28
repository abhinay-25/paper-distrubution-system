import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { closePrisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`✅  pds-backend listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown — drain open connections before the process exits.
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received — shutting down gracefully…`);
  server.close(async () => {
    try {
      await closePrisma();
      console.log("Database pool closed. Goodbye.");
      process.exit(0);
    } catch (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
  });

  // Force exit after 10 s if graceful close hangs.
  setTimeout(() => {
    console.error("Forced exit after timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
