// Wallet sign-in against apps/api's SIWE-style flow (nonce -> sign -> verify
// -> httpOnly session cookie). Every call uses credentials: "include" so the
// cross-origin cookie (Vercel <-> Fly, SameSite=None; Secure in production —
// see apps/api/src/middleware/session.ts) is actually sent/received.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type SignMessageFn = (args: { message: string }) => Promise<string>;

export async function signIn(walletAddress: string, signMessageAsync: SignMessageFn): Promise<void> {
  const nonceRes = await fetch(`${API_BASE}/api/v1/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ walletAddress }),
  });
  if (!nonceRes.ok) throw new Error("Failed to get a sign-in nonce from the API.");
  const { message } = await nonceRes.json();

  const signature = await signMessageAsync({ message });

  const verifyRes = await fetch(`${API_BASE}/api/v1/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ walletAddress, signature }),
  });
  if (!verifyRes.ok) {
    const body = await verifyRes.json().catch(() => ({}));
    throw new Error(body.error ?? "Sign-in verification failed.");
  }
}

export async function signOut(): Promise<void> {
  await fetch(`${API_BASE}/api/v1/auth/logout`, { method: "POST", credentials: "include" });
}

export async function getSession(): Promise<{ walletAddress: string } | null> {
  const res = await fetch(`${API_BASE}/api/v1/auth/me`, { credentials: "include", cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export type NotificationRecord = {
  id: string;
  claimId: number | null;
  kind: string;
  message: string;
  read: boolean;
  createdAt: string;
};

export async function getNotifications(): Promise<NotificationRecord[]> {
  const res = await fetch(`${API_BASE}/api/v1/notifications`, { credentials: "include", cache: "no-store" });
  if (!res.ok) return [];
  const { notifications } = await res.json();
  return notifications;
}

export async function markNotificationRead(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/v1/notifications/${id}/read`, { method: "POST", credentials: "include" });
}
