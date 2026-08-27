import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const claimsRouter = Router();

// Every route here reads the off-chain cache (kept warm by
// src/sync/poller.ts), never the contract directly — this is what makes
// claim discovery/search fast without hammering StudioNet on every page
// load. The contract itself remains authoritative for money/verdicts; the
// frontend calls it directly for anything that must be real-time-accurate
// (see apps/web/lib/genlayer-client.ts).

// Coerced-number query schemas reject NaN, negative, non-integer, and
// out-of-range input with a clean 400 instead of letting a malformed value
// (e.g. ?limit=abc, ?offset=-1, ?limit=1e30) reach Prisma raw, where it
// either silently misbehaves (Number("abc") || 24 happens to fall back
// correctly, but Number("-5") does not) or throws an unhandled error that
// falls through to the generic 500 handler.
const pageQuery = (maxLimit: number, defaultLimit: number) =>
  z.object({
    limit: z.coerce.number().int().positive().max(maxLimit).default(defaultLimit),
    offset: z.coerce.number().int().min(0).default(0),
  });

const idParam = z.object({ id: z.coerce.number().int().nonnegative() });

function badRequest(res: import("express").Response, err: z.ZodError): void {
  res.status(400).json({ error: "Invalid request parameters.", details: err.flatten().fieldErrors });
}

claimsRouter.get("/claims", async (req, res) => {
  const parsedQuery = pageQuery(50, 24).safeParse(req.query);
  if (!parsedQuery.success) return badRequest(res, parsedQuery.error);
  const { limit, offset } = parsedQuery.data;

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const search = typeof req.query.q === "string" ? req.query.q : undefined;

  const claims = await prisma.claim.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(search ? { statement: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: { id: "desc" },
    skip: offset,
    take: limit,
  });
  res.json({ claims });
});

claimsRouter.get("/claims/:id", async (req, res) => {
  const parsedParams = idParam.safeParse(req.params);
  if (!parsedParams.success) return badRequest(res, parsedParams.error);

  const claim = await prisma.claim.findUnique({ where: { id: parsedParams.data.id } });
  if (!claim) {
    res.status(404).json({ error: "Claim not found in cache yet — it may still be syncing." });
    return;
  }
  res.json({ claim });
});

claimsRouter.get("/claims/:id/evidence", async (req, res) => {
  const parsedParams = idParam.safeParse(req.params);
  if (!parsedParams.success) return badRequest(res, parsedParams.error);

  const evidence = await prisma.evidence.findMany({
    where: { claimId: parsedParams.data.id },
    orderBy: { submittedAt: "asc" },
  });
  res.json({ evidence });
});

claimsRouter.get("/claims/:id/activity", async (req, res) => {
  const parsedParams = idParam.safeParse(req.params);
  if (!parsedParams.success) return badRequest(res, parsedParams.error);
  const parsedQuery = pageQuery(100, 50).safeParse(req.query);
  if (!parsedQuery.success) return badRequest(res, parsedQuery.error);

  const activity = await prisma.activityEvent.findMany({
    where: { claimId: parsedParams.data.id },
    orderBy: { ts: "desc" },
    take: parsedQuery.data.limit,
    skip: parsedQuery.data.offset,
  });
  res.json({ activity });
});

// Global evidence feed — powers the "Evidence Vault" page. Every submission
// across every claim, newest first, so investigators can browse evidence
// quality independent of any single claim.
claimsRouter.get("/evidence", async (req, res) => {
  const parsedQuery = pageQuery(50, 30).safeParse(req.query);
  if (!parsedQuery.success) return badRequest(res, parsedQuery.error);
  const { limit, offset } = parsedQuery.data;

  const evidence = await prisma.evidence.findMany({
    orderBy: { submittedAt: "desc" },
    skip: offset,
    take: limit,
    include: { claim: { select: { statement: true } } },
  });
  res.json({ evidence });
});

const addressQuery = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "must be a valid 0x-prefixed 40-hex-char address"),
});

// Every claim a wallet has participated in (staked a side, or submitted
// evidence), derived from the activity log — powers "My Staked Claims".
// There is no separate per-staker index in Postgres (the contract's own
// side-stake ledger has no enumerable "list all stakers" view), so this is
// reconstructed from ActivityEvent rows, which already record `actor` for
// every STAKE_SIDE / SUBMIT_EVIDENCE / CREATE event.
claimsRouter.get("/my-activity", async (req, res) => {
  const parsedQuery = addressQuery.safeParse(req.query);
  if (!parsedQuery.success) return badRequest(res, parsedQuery.error);
  const address = parsedQuery.data.address.toLowerCase();

  const events = await prisma.activityEvent.findMany({
    where: { actor: { equals: address, mode: "insensitive" } },
    orderBy: { ts: "desc" },
    include: { claim: { select: { statement: true, status: true, verdict: true } } },
  });
  const seen = new Set<number>();
  const claims = [];
  for (const e of events) {
    if (seen.has(e.claimId)) continue;
    seen.add(e.claimId);
    claims.push({
      claimId: e.claimId,
      statement: e.claim.statement,
      status: e.claim.status,
      verdict: e.claim.verdict,
      lastActivityKind: e.kind,
      lastActivityTs: e.ts,
    });
  }
  res.json({ claims });
});
