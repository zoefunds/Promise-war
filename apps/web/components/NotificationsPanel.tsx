"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import Link from "next/link";
import { signIn, getSession, getNotifications, markNotificationRead, type NotificationRecord } from "@/lib/auth-client";

export function NotificationsPanel() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedSession, setCheckedSession] = useState(false);

  useEffect(() => {
    getSession().then((s) => {
      setSessionAddress(s?.walletAddress ?? null);
      setCheckedSession(true);
    });
  }, []);

  useEffect(() => {
    if (!sessionAddress) return;
    getNotifications().then(setNotifications);
  }, [sessionAddress]);

  async function handleSignIn() {
    if (!address) return;
    setError(null);
    setSigningIn(true);
    try {
      await signIn(address, ({ message }) => signMessageAsync({ message }));
      setSessionAddress(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleMarkRead(id: string) {
    await markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  if (!isConnected || !address) return null;

  if (!checkedSession) return null;

  if (!sessionAddress) {
    return (
      <div className="glass-panel rounded-lg p-6 flex flex-col gap-3">
        <h2 className="font-mono text-xs uppercase text-primary tracking-widest">Notifications</h2>
        <p className="font-mono text-xs text-on-surface-variant">
          Sign in with your wallet (a free signature, no transaction) to see notifications about your claims
          and evidence — verdicts, status changes, and slashes.
        </p>
        {error && <p className="font-mono text-xs text-challenge">{error}</p>}
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="self-start bg-primary-fixed-dim text-on-primary font-mono text-xs uppercase tracking-wider px-4 py-2 rounded hover:brightness-110 transition-colors disabled:opacity-50"
        >
          {signingIn ? "Signing…" : "Sign in with wallet"}
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-lg p-6 flex flex-col gap-3">
      <h2 className="font-mono text-xs uppercase text-primary tracking-widest">Notifications</h2>
      {notifications.length === 0 ? (
        <p className="font-mono text-xs text-on-surface-variant">No notifications yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`flex items-start justify-between gap-3 p-3 rounded border ${
                n.read ? "border-outline-variant/20 text-on-surface-variant" : "border-primary/40 text-on-surface"
              }`}
            >
              <div className="flex-1">
                <p className="font-mono text-xs">{n.message}</p>
                {n.claimId !== null && (
                  <Link href={`/claims/${n.claimId}`} className="font-mono text-[10px] text-primary hover:underline">
                    View claim #{n.claimId}
                  </Link>
                )}
              </div>
              {!n.read && (
                <button
                  onClick={() => handleMarkRead(n.id)}
                  className="font-mono text-[10px] text-on-surface-variant hover:text-primary uppercase"
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
