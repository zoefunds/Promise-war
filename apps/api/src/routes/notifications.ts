import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, readSession, AuthedRequest } from "../middleware/session.js";

export const notificationsRouter = Router();

notificationsRouter.get("/notifications", readSession, requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { walletAddress: req.session!.walletAddress } });
  if (!user) {
    res.json({ notifications: [] });
    return;
  }
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ notifications });
});

notificationsRouter.post("/notifications/:id/read", readSession, requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { walletAddress: req.session!.walletAddress } });
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: user.id },
    data: { read: true },
  });
  res.json({ ok: true });
});
