export function weiToGen(wei: string | number, decimals = 2): string {
  const value = typeof wei === "string" ? BigInt(wei) : BigInt(Math.trunc(wei));
  const gen = Number(value) / 1e18;
  return gen.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export function timeRemaining(deadlineTs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = deadlineTs - now;
  if (diff <= 0) return "Deadline passed";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** True once wall-clock time has passed the given unix timestamp. The
 * contract enforces every deadline authoritatively itself (this is display
 * logic only), but the frontend must compute this independently rather
 * than trust a claim's cached `status` field — a claim can sit in ACTIVE
 * long after its deadline if nobody has called
 * `advance_to_evidence_maturing()` or `request_adjudication()` yet, and the
 * UI must not imply an action is open just because status hasn't caught
 * up. */
export function isPast(unixTs: number): boolean {
  return Math.floor(Date.now() / 1000) > unixTs;
}

export const TERMINAL_STATUSES = new Set(["SETTLED", "CANCELLED", "EXPIRED_TIMEOUT"]);
export const ADJUDICATION_TIMEOUT_SECONDS = 7 * 24 * 60 * 60;
