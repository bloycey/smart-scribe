"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "recording" | "unsupported";

export type SpeechRecognitionState = {
  status: Status;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
};

// Backoff schedule for restart attempts when Web Speech ends unexpectedly.
// Chrome rejects back-to-back start() calls, and "network"-style failures
// often recover after a beat. We retry indefinitely until the user calls
// stop() — they explicitly want recording to feel uninterruptible.
const RESTART_DELAYS_MS = [120, 250, 500, 1000, 2000, 4000];

export function useSpeechRecognition(opts: {
  onFinalChunk: (text: string) => void;
}): SpeechRecognitionState {
  // Stash the callback in a ref so the setup effect can stay mount-only.
  // If we depended on the callback in the effect's deps array, any time it
  // re-created (even from a parent re-render that *should* have been
  // referentially stable) we'd tear down recognition and silently fail to
  // restart it.
  const onFinalRef = useRef(opts.onFinalChunk);
  useEffect(() => {
    onFinalRef.current = opts.onFinalChunk;
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wantRecordingRef = useRef(false);
  const restartAttemptRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor =
      window.SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    function clearScheduledRestart() {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
    }

    function scheduleRestart() {
      if (!wantRecordingRef.current) return;
      const idx = Math.min(
        restartAttemptRef.current,
        RESTART_DELAYS_MS.length - 1,
      );
      const delay = RESTART_DELAYS_MS[idx];
      clearScheduledRestart();
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (!wantRecordingRef.current) return;
        try {
          rec.start();
          // start() succeeded — but onstart will confirm. Reset attempts on
          // the next successful result.
        } catch {
          restartAttemptRef.current += 1;
          scheduleRestart();
        }
      }, delay);
    }

    rec.onstart = () => {
      setStatus("recording");
      setError(null);
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      // Any result means recognition is alive and well — reset backoff.
      restartAttemptRef.current = 0;
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0]?.transcript ?? "";
        if (res.isFinal) {
          const trimmed = transcript.trim();
          if (trimmed) onFinalRef.current(trimmed);
        } else {
          interimText += transcript;
        }
      }
      setInterim(interimText);
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      // Surface the error string but do NOT flip status. onend will fire
      // immediately after, and the restart loop will keep us trying.
      setError(e.error);
    };

    rec.onend = () => {
      setInterim("");
      if (!wantRecordingRef.current) {
        setStatus("idle");
        return;
      }
      scheduleRestart();
    };

    recognitionRef.current = rec;
    return () => {
      wantRecordingRef.current = false;
      clearScheduledRestart();
      try {
        rec.stop();
      } catch {
        // noop
      }
      recognitionRef.current = null;
    };
    // Mount-only — onFinal is read via ref so this doesn't need to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    setError(null);
    restartAttemptRef.current = 0;
    wantRecordingRef.current = true;
    try {
      rec.start();
      setStatus("recording");
    } catch {
      // Already started — onstart will (or has) set status.
      setStatus("recording");
    }
  }, []);

  const stop = useCallback(() => {
    wantRecordingRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // noop
    }
    setStatus("idle");
    setInterim("");
  }, []);

  return { status, interim, error, start, stop };
}
