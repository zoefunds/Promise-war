import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./env.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { claimsRouter } from "./routes/claims.js";
import { notificationsRouter } from "./routes/notifications.js";
import { startSyncPoller } from "./sync/poller.js";

const app = express();

app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1", healthRouter);
app.use("/api/v1", authRouter);
app.use("/api/v1", claimsRouter);
app.use("/api/v1", notificationsRouter);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] PROMISE WAR backend listening on :${env.port} (${env.NODE_ENV})`);
  startSyncPoller();
});
