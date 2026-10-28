import "dotenv/config";
import { z } from "zod";

/**
 * Environment configuration, validated at startup.
 * Add DATABASE_URL and JWT_SECRET for Step 3 (database foundation).
 *
 * All variables are read from process.env (populated by dotenv or the OS).
 * The process will exit with a clear error message if any required variable
 * is missing or invalid.
 */
const DEV_DEFAULT_AI_TOKEN =
  "dev_internal_service_secret_token_at_least_32_chars_long_for_security";
const DEV_DEFAULT_SESSION_SECRET =
  "dev_session_hmac_secret_key_at_least_32_chars_long_for_local_auth";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),

    // --- Database (required; no default — must be set explicitly) ---
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL must be set")
      .url("DATABASE_URL must be a valid connection URL"),

    // --- Authentication & Session Security (Step 6) ---
    SESSION_SECRET: z
      .string()
      .min(32, "SESSION_SECRET must be at least 32 characters")
      .default(DEV_DEFAULT_SESSION_SECRET),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(8),

    // --- Internal AI Service (Python FastAPI microservice) ---
    AI_SERVICE_URL: z.string().url().default("http://127.0.0.1:8000"),
    AI_SERVICE_TOKEN: z
      .string()
      .min(32, "AI_SERVICE_TOKEN must be at least 32 characters")
      .default(DEV_DEFAULT_AI_TOKEN),
    AI_SERVICE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(300_000)
      .default(35_000),
    // Batch question generation timeout: exceeds Python worst-case retry budget (2 * 25s + 4s + 3s = 57s)
    AI_GENERATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(300_000)
      .default(70_000),

    // --- Private PDF Artifact Storage ---
    PDF_STORAGE_DIR: z.string().min(1).default("./storage/pdf-artifacts"),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === "production" && val.AI_SERVICE_TOKEN === DEV_DEFAULT_AI_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_SERVICE_TOKEN"],
        message:
          "AI_SERVICE_TOKEN must not use the development placeholder token when NODE_ENV=production",
      });
    }
    if (val.NODE_ENV === "production" && val.SESSION_SECRET === DEV_DEFAULT_SESSION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message:
          "SESSION_SECRET must not use the development placeholder secret when NODE_ENV=production",
      });
    }
  });

const result = envSchema.safeParse(process.env);
if (!result.success) {
  console.error("❌  Invalid environment variables:\n", result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
export type Env = z.infer<typeof envSchema>;
