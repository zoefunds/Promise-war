import { Router } from "express";
import { z } from "zod";
import { isAddress } from "viem";
import { prisma } from "../db.js";
import { issueNonce, verifySignInSignature } from "../auth/siwe.js";
import { issueSessionCookie, clearSessionCookie, readSession, AuthedRequest } from "../middleware/session.js";

export const authRouter = Router();

const nonceSchema = z.object({ walletAddress: z.string() });
const verifySchema = z.object({ walletAddress: z.string(), signature: z.string() });

authRouter.post("/auth/nonce", async (req, res) => {
  const parsed = nonceSchema.safeParse(req.body);
  if (!parsed.success || !isAddress(parsed.data.walletAddress)) {
    res.status(400).json({ error: "Valid walletAddress is required." });
    return;
  }
  const { message } = await issueNonce(parsed.data.walletAddress);
  res.json({ message });
});

authRouter.post("/auth/verify", async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success || !isAddress(parsed.data.walletAddress)) {
    res.status(400).json({ error: "Valid walletAddress and signature are required." });
    return;
  }
  const { walletAddress, signature } = parsed.data;

  const ok = await verifySignInSignature(walletAddress, signature);
  if (!ok) {
    res.status(401).json({ error: "Signature verification failed or nonce expired." });
    return;
  }

  await prisma.user.upsert({
    where: { walletAddress },
    create: { walletAddress },
    update: { lastSeenAt: new Date() },
  });

  issueSessionCookie(res, walletAddress);
  res.json({ walletAddress });
});

authRouter.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/auth/me", readSession, (req: AuthedRequest, res) => {
  if (!req.session) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  res.json({ walletAddress: req.session.walletAddress });
});
