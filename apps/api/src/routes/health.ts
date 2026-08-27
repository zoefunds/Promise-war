import { Router } from "express";
import { prisma } from "../db.js";

export const healthRouter = Router();

// Matches fly.toml's http_service.checks path — must stay cheap and fast
// since Fly polls it every 15s to decide if the always-on machine is alive.
healthRouter.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: "degraded", error: err instanceof Error ? err.message : "unknown" });
  }
});
