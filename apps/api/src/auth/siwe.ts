// Wallet-based authentication: nonce + signature, no custodial keys, no
// passwords. Flow:
//   1. POST /api/v1/auth/nonce { walletAddress } -> { message }
//      A fresh random nonce is stored server-side (AuthNonce table, one row
//      per wallet, overwritten each request) and embedded in a plain
//      human-readable message the wallet signs.
//   2. POST /api/v1/auth/verify { walletAddress, signature } -> session JWT
//      cookie. The nonce is deleted immediately on success so a captured
//      signature can never be replayed. Signature is verified with viem's
//      verifyMessage against the exact message that was issued.
import { randomBytes } from "crypto";
import { verifyMessage } from "viem";
import { prisma } from "../db.js";

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function buildSignInMessage(walletAddress: string, nonce: string): string {
  return [
    "PROMISE WAR wants you to sign in with your wallet.",
    "",
    `Address: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued at: ${new Date().toISOString()}`,
    "",
    "This request will not trigger a blockchain transaction or cost any gas.",
  ].join("\n");
}

export async function issueNonce(walletAddress: string): Promise<{ message: string }> {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

  await prisma.authNonce.upsert({
    where: { walletAddress },
    create: { walletAddress, nonce, expiresAt },
    update: { nonce, expiresAt },
  });

  return { message: buildSignInMessage(walletAddress, nonce) };
}

export async function verifySignInSignature(walletAddress: string, signature: string): Promise<boolean> {
  const record = await prisma.authNonce.findUnique({ where: { walletAddress } });
  if (!record) return false;
  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.authNonce.delete({ where: { walletAddress } }).catch(() => undefined);
    return false;
  }

  const message = buildSignInMessage(walletAddress, record.nonce);
  const valid = await verifyMessage({
    address: walletAddress as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  });

  if (!valid) return false;

  // One-time use: delete immediately so this exact signature can never be
  // replayed against a future login attempt.
  await prisma.authNonce.delete({ where: { walletAddress } }).catch(() => undefined);
  return true;
}
