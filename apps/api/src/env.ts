import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_JWT_SECRET: z.string().min(32, "SESSION_JWT_SECRET must be at least 32 chars"),
  PORT: z.string().default("4000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CONTRACT_ADDRESS: z.string().min(1, "CONTRACT_ADDRESS is required"),
  SYNC_INTERVAL_MS: z.string().default("30000"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  port: Number(parsed.data.PORT),
  syncIntervalMs: Number(parsed.data.SYNC_INTERVAL_MS),
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((o) => o.trim()),
  isProduction: parsed.data.NODE_ENV === "production",
};
