import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

const SESSION_COOKIE = "promise_war_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type SessionPayload = { walletAddress: string };

export function issueSessionCookie(res: Response, walletAddress: string): void {
  const token = jwt.sign({ walletAddress } satisfies SessionPayload, env.SESSION_JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    // The frontend (Vercel) and this API (Fly.io) are different origins in
    // production, so a cross-site fetch with credentials:'include' needs
    // SameSite=None — SameSite=Lax would silently drop the cookie on every
    // cross-origin request, breaking auth without ever raising an error.
    // SameSite=None requires Secure, which is fine (production is HTTPS).
    // Locally, both run on http://localhost origins, so Lax is correct and
    // avoids needing HTTPS in dev.
    secure: env.isProduction,
    sameSite: env.isProduction ? "none" : "lax",
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  // Must repeat the same attributes used to set it — browsers only clear a
  // cookie when the clearing Set-Cookie matches path/domain/sameSite, so a
  // mismatched clearCookie() call silently does nothing.
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? "none" : "lax",
  });
}

export interface AuthedRequest extends Request {
  session?: SessionPayload;
}

/** Attaches req.session if a valid cookie is present; never rejects — use
 * requireAuth() on routes that must be authenticated. */
export function readSession(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.SESSION_JWT_SECRET) as SessionPayload;
    req.session = payload;
  } catch {
    // Invalid/expired token — treat as unauthenticated rather than erroring.
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  next();
}
