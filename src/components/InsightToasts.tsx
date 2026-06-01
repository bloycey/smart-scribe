"use client";

import { useEffect, useState } from "react";

export type Toast = { id: string; text: string };

const HOLD_MS = 5000;
const EXIT_MS = 280;

export function InsightToasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-3 w-[min(92vw,420px)]">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const holdTimer = setTimeout(() => setExiting(true), HOLD_MS);
    return () => clearTimeout(holdTimer);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const exitTimer = setTimeout(() => onDismiss(toast.id), EXIT_MS);
    return () => clearTimeout(exitTimer);
  }, [exiting, onDismiss, toast.id]);

  return (
    <div
      className={`${exiting ? "toast-out" : "toast-in"} pointer-events-auto rounded-xl border border-accent-soft bg-background/95 backdrop-blur shadow-[0_8px_28px_-12px_rgba(245,158,11,0.45)] px-4 py-3 flex items-start gap-3`}
    >
      <LightbulbIcon className="size-5 text-accent shrink-0 mt-0.5 bulb-ding" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-widest text-accent font-medium">
          Key insight discovered
        </p>
        <p className="mt-0.5 text-sm text-foreground/90 leading-snug">
          {toast.text}
        </p>
      </div>
    </div>
  );
}

export function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1.5 1.6 1.7 2.5h4.6c.2-.9.9-1.7 1.7-2.5A6 6 0 0 0 12 3Z" />
    </svg>
  );
}
