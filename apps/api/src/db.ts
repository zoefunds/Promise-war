import { PrismaClient } from "@prisma/client";

// Single shared Prisma client for the process lifetime. Fly.io's
// min_machines_running=1 means this process is expected to stay warm — no
// per-request client construction.
export const prisma = new PrismaClient();
