"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { FinalSummary, Note, RealtimeInsight } from "@/lib/types";
import { useRouter } from "next/navigation";
import {
  appendTranscriptChunk,
  deleteNote,
  renameNote,
} from "@/app/actions";
import { extractRealtimeInsights } from "./realtime.actions";
import { cleanUpTranscript, generateFinalSummary } from "./summary.actions";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { InsightToasts, type Toast } from "@/components/InsightToasts";
import { downloadMarkdown, slugify, summaryToMarkdown } from "@/lib/markdown";

type Tab = "transcript" | "insights";
type StoredInsight = RealtimeInsight & { id: string };

const EXTRACTION_INTERVAL_MS = 15_000;
const MIN_CHUNK_CHARS = 40;
const TOAST_STAGGER_MS = 800;
const FRESH_MS = 2200;

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function NoteClient({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);
  const [tab, setTab] = useState<Tab>("transcript");
  const [transcript, setTranscript] = useState(note.transcript ?? "");
  const [insights, setInsights] = useState<StoredInsight[]>(() =>
    (note.realtime_insights ?? []).map((i) => ({ ...i, id: makeId() })),
  );
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [finalSummary, setFinalSummary] = useState<FinalSummary | null>(
    note.final_summary,
  );
  const [customInstructions, setCustomInstructions] = useState(
    note.custom_instructions ?? "",
  );
  const [generating, setGenerating] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState(
    note.custom_instructions ?? "",
  );
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click + close anything on Escape.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!menuOpen) return;
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (instructionsOpen) setInstructionsOpen(false);
      else if (menuOpen) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, instructionsOpen]);

  function openInstructions() {
    setInstructionsDraft(customInstructions);
    setInstructionsOpen(true);
    setMenuOpen(false);
  }

  function saveInstructions() {
    setCustomInstructions(instructionsDraft);
    setInstructionsOpen(false);
  }

  function cancelInstructions() {
    setInstructionsDraft(customInstructions);
    setInstructionsOpen(false);
  }
  const [, startTransition] = useTransition();

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteNote(note.id);
      router.push("/");
    } catch {
      setDeleting(false);
    }
  }

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const surfaceInsights = useCallback((arrived: RealtimeInsight[]) => {
    const withIds: StoredInsight[] = arrived.map((i) => ({
      ...i,
      id: makeId(),
    }));
    setInsights((prev) => prev.concat(withIds));
    setFreshIds((prev) => {
      const next = new Set(prev);
      withIds.forEach((i) => next.add(i.id));
      return next;
    });
    withIds.forEach((i) => {
      setTimeout(() => {
        setFreshIds((prev) => {
          if (!prev.has(i.id)) return prev;
          const next = new Set(prev);
          next.delete(i.id);
          return next;
        });
      }, FRESH_MS);
    });
    withIds.forEach((i, idx) => {
      setTimeout(() => {
        setToasts((prev) => prev.concat({ id: i.id, text: i.text }));
      }, idx * TOAST_STAGGER_MS);
    });
  }, []);

  const extractedOffsetRef = useRef(note.transcript?.length ?? 0);
  const transcriptRef = useRef(transcript);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const pendingChunks = useRef<string[]>([]);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (pendingChunks.current.length > 0) {
        const next = pendingChunks.current.shift()!;
        await appendTranscriptChunk(note.id, next);
      }
    } finally {
      flushing.current = false;
    }
  }, [note.id]);

  const handleFinalChunk = useCallback(
    (text: string) => {
      setTranscript((prev) => (prev ? `${prev} ${text}` : text));
      pendingChunks.current.push(text);
      void flush();
    },
    [flush],
  );

  const { status, interim, error, start, stop } = useSpeechRecognition({
    onFinalChunk: handleFinalChunk,
  });

  const isRecording = status === "recording";

  const runExtraction = useCallback(async () => {
    const full = transcriptRef.current;
    const offset = extractedOffsetRef.current;
    if (full.length - offset < MIN_CHUNK_CHARS) return;
    const chunk = full.slice(offset).trim();
    extractedOffsetRef.current = full.length;
    setExtracting(true);
    try {
      const result = await extractRealtimeInsights(note.id, chunk);
      if (result.newInsights.length > 0) {
        surfaceInsights(result.newInsights);
      }
      if (result.titleUpdate) {
        setTitle(result.titleUpdate);
      }
    } catch (err) {
      extractedOffsetRef.current = offset;
      console.error("extraction failed", err);
    } finally {
      setExtracting(false);
    }
  }, [note.id, surfaceInsights]);

  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(runExtraction, EXTRACTION_INTERVAL_MS);
    return () => clearInterval(t);
  }, [isRecording, runExtraction]);

  function commitTitle() {
    if (title === note.title) return;
    startTransition(() => {
      renameNote(note.id, title).catch(() => setTitle(note.title));
    });
  }

  async function handleStop() {
    stop();
    void runExtraction();
    await flush();

    const currentTranscript = transcriptRef.current;
    if (!currentTranscript.trim()) return;

    // Polish the transcript before summarising. Skip the AI call for very
    // short transcripts — there's nothing to clean.
    if (currentTranscript.trim().length >= 40) {
      setPolishing(true);
      try {
        const cleaned = await cleanUpTranscript(note.id, currentTranscript);
        if (cleaned) setTranscript(cleaned);
      } catch (err) {
        console.error("transcript cleanup failed", err);
      } finally {
        setPolishing(false);
      }
    }

    // Auto-generate the final summary as part of the stop flow.
    await handleGenerate();
  }

  useEffect(() => {
    if (isRecording) setTab("transcript");
  }, [isRecording]);

  // Used by the UI button to decide its disabled state. handleGenerate
  // itself reads the transcript via ref so it never trips on stale closures
  // (e.g. when called from handleStop right after stop() flips isRecording).
  const canGenerateSummary = !isRecording && transcript.trim().length > 0;

  async function handleGenerate() {
    if (generating) return;
    if (!transcriptRef.current.trim()) return;
    setSummaryError(null);
    setGenerating(true);
    try {
      const summary = await generateFinalSummary(note.id, customInstructions);
      setFinalSummary(summary);
      setTab("insights");
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Failed to generate summary.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
    <InsightToasts toasts={toasts} onDismiss={dismissToast} />
    <div className="mx-auto max-w-3xl pt-8 sm:pt-12">
      <div className="flex items-start gap-3">
        <label className="group relative flex-1 cursor-text rounded-lg px-2 -mx-2 py-2 hover:bg-foreground/[0.03] focus-within:bg-foreground/[0.04] transition">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Untitled note"
            className="peer w-full font-serif text-4xl tracking-tight leading-[1.2] pb-1 bg-transparent outline-none focus:outline-none placeholder:text-muted/60"
            aria-label="Note title"
          />
          <PencilIcon className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted/0 group-hover:text-muted/70 peer-focus:text-muted/0 transition" />
        </label>
        <div ref={menuRef} className="relative mt-2">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Note actions"
            className={`size-9 grid place-items-center rounded-full border transition ${
              menuOpen
                ? "border-foreground/40 bg-foreground/[0.04] text-foreground"
                : "border-transparent text-muted hover:text-foreground hover:border-subtle"
            }`}
          >
            <CogIcon className="size-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 z-30 w-60 rounded-xl border border-subtle bg-background shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)] overflow-hidden"
            >
              <button
                type="button"
                role="menuitem"
                onClick={openInstructions}
                className="block w-full text-left px-4 py-3 text-sm hover:bg-foreground/[0.04] transition"
              >
                {customInstructions.trim()
                  ? "Edit custom instructions"
                  : "Add custom instructions"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void handleDelete();
                }}
                disabled={deleting}
                className="block w-full text-left px-4 py-3 text-sm text-red-700 hover:bg-red-50 transition disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete this note"}
              </button>
            </div>
          )}
        </div>
      </div>
      <p
        className="mt-2 px-2 -mx-2 text-xs text-muted"
        suppressHydrationWarning
      >
        {new Date(note.created_at).toLocaleString(undefined, {
          dateStyle: "long",
          timeStyle: "short",
        })}
      </p>


      <div className="mt-10 flex items-center gap-4 flex-wrap">
        {status === "unsupported" ? (
          <p className="text-sm text-red-700">
            This browser doesn&apos;t support the Web Speech API. Try Chrome,
            Edge, or Safari.
          </p>
        ) : isRecording ? (
          <button
            type="button"
            onClick={handleStop}
            className="rounded-full border border-foreground px-5 py-2.5 text-sm font-medium hover:bg-foreground hover:text-background transition"
          >
            Stop recording
          </button>
        ) : transcript.trim().length === 0 ? (
          <button
            type="button"
            onClick={start}
            className="rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium hover:opacity-85 transition"
          >
            Start recording
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-foreground/40" />
            Recording complete
          </span>
        )}
        {isRecording && (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <span className="size-2 rounded-full bg-accent pulse-soft" />
            Listening
          </span>
        )}
        {error && (
          <span className="text-xs text-red-700">
            Speech error: {error}
          </span>
        )}
      </div>

      {(extracting || polishing || generating) && (
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted">
          <span className="size-1.5 rounded-full bg-foreground/60 pulse-soft" />
          {polishing
            ? "Polishing the transcript…"
            : generating
              ? "Drawing it all together…"
              : "The scribe is thinking…"}
        </p>
      )}

      {!isRecording && (finalSummary || summaryError) && (
        <div className="mt-8 flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerateSummary || generating || polishing}
            className="rounded-full border border-foreground px-5 py-2.5 text-sm font-medium hover:bg-foreground hover:text-background transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating ? "Considering…" : "Regenerate summary"}
          </button>
          {customInstructions.trim() && (
            <button
              type="button"
              onClick={openInstructions}
              className="text-xs text-muted hover:text-foreground transition"
              title="Edit custom instructions"
            >
              With custom instructions
            </button>
          )}
          {summaryError && (
            <span className="text-xs text-red-700">{summaryError}</span>
          )}
        </div>
      )}

      <div className="mt-12 border-b border-subtle flex gap-8">
        {(["transcript", "insights"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`pb-3 text-sm tracking-wide -mb-px border-b transition ${
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t === "transcript" ? "Transcript" : `Insights${insights.length ? ` · ${insights.length}` : ""}`}
          </button>
        ))}
      </div>

      <section className="pt-8 min-h-[40vh]">
        {tab === "transcript" ? (
          <TranscriptView transcript={transcript} interim={interim} />
        ) : (
          <InsightsView
            insights={insights}
            freshIds={freshIds}
            finalSummary={finalSummary}
            noteTitle={title}
            noteDate={note.created_at}
          />
        )}
      </section>
    </div>
    {instructionsOpen && (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center px-4"
        onClick={cancelInstructions}
      >
        <div
          className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
          aria-hidden
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="instructions-heading"
          className="relative w-full max-w-lg rounded-2xl border border-subtle bg-background shadow-[0_20px_60px_-20px_rgba(0,0,0,0.3)] p-5 sm:p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="instructions-heading"
            className="font-serif text-2xl tracking-tight"
          >
            Custom instructions
          </h2>
          <p className="mt-1 text-sm text-muted">
            Steer the final summary. Tone, focus, audience — whatever helps.
          </p>
          <textarea
            value={instructionsDraft}
            onChange={(e) => setInstructionsDraft(e.target.value)}
            placeholder="Focus on technical decisions and commitments. Address the engineering team."
            rows={6}
            autoFocus
            className="mt-5 w-full rounded-lg border border-subtle bg-background/60 px-3 py-2.5 text-sm leading-6 outline-none resize-none focus:border-foreground/40 placeholder:text-muted/60"
          />
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={cancelInstructions}
              className="text-sm text-muted hover:text-foreground transition px-3 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveInstructions}
              className="rounded-full bg-foreground text-background px-5 py-2 text-sm font-medium hover:opacity-85 transition"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function TranscriptView({
  transcript,
  interim,
}: {
  transcript: string;
  interim: string;
}) {
  if (!transcript && !interim) {
    return (
      <p className="text-sm text-muted italic">
        Transcript will appear here when you start recording.
      </p>
    );
  }
  return (
    <div className="text-[15px] leading-7 text-foreground/90 whitespace-pre-wrap">
      {transcript}
      {interim && (
        <span className="ml-1 italic text-muted">{interim}</span>
      )}
    </div>
  );
}

function InsightsView({
  insights,
  freshIds,
  finalSummary,
  noteTitle,
  noteDate,
}: {
  insights: StoredInsight[];
  freshIds: Set<string>;
  finalSummary: FinalSummary | null;
  noteTitle: string;
  noteDate: string;
}) {
  if (finalSummary) {
    return (
      <SummaryView
        summary={finalSummary}
        insights={insights}
        noteTitle={noteTitle}
        noteDate={noteDate}
      />
    );
  }
  if (insights.length === 0) {
    return (
      <p className="text-sm text-muted italic">
        Live insights will appear here as the scribe listens.
      </p>
    );
  }
  return <LiveInsightsList insights={insights} freshIds={freshIds} />;
}

function LiveInsightsList({
  insights,
  freshIds,
}: {
  insights: StoredInsight[];
  freshIds: Set<string>;
}) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-widest text-muted mb-4">
        Live insights
      </h3>
      <ul className="space-y-3">
        {insights.map((ins) => {
          const fresh = freshIds.has(ins.id);
          return (
            <li
              key={ins.id}
              className={`text-[15px] leading-7 text-foreground/90 flex gap-3 rounded-md -mx-2 px-2 ${
                fresh ? "glow-once" : ""
              }`}
            >
              <span className="text-accent shrink-0 select-none" aria-hidden>
                ✦
              </span>
              <span>{ins.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SummaryView({
  summary,
  insights,
  noteTitle,
  noteDate,
}: {
  summary: FinalSummary;
  insights: StoredInsight[];
  noteTitle: string;
  noteDate: string;
}) {
  const [showLive, setShowLive] = useState(false);

  function handleDownload() {
    const md = summaryToMarkdown(noteTitle, noteDate, summary);
    downloadMarkdown(`${slugify(noteTitle)}.md`, md);
  }

  return (
    <article className="space-y-10">
      <section>
        <div className="flex items-center justify-between gap-4 mb-3">
          <h3 className="text-xs uppercase tracking-widest text-muted">
            Executive summary
          </h3>
          <button
            type="button"
            onClick={handleDownload}
            className="text-xs text-muted hover:text-foreground transition"
          >
            Download as markdown
          </button>
        </div>
        <p className="text-[17px] leading-8 text-foreground/95 font-serif">
          {summary.executiveSummary}
        </p>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-widest text-muted mb-4">
          Themes
        </h3>
        <div className="space-y-7">
          {summary.themes.map((theme, i) => (
            <div key={i}>
              <h4 className="font-serif text-xl tracking-tight mb-2">
                {theme.title}
              </h4>
              <ul className="space-y-2">
                {theme.points.map((p, j) => (
                  <li
                    key={j}
                    className="text-[15px] leading-7 text-foreground/90 flex gap-3"
                  >
                    <span className="text-muted shrink-0 select-none">—</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {summary.nextSteps.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-widest text-muted mb-4">
            Next steps
          </h3>
          <ul className="space-y-2">
            {summary.nextSteps.map((s, i) => (
              <li
                key={i}
                className="text-[15px] leading-7 text-foreground/90 flex gap-3"
              >
                <span className="text-accent shrink-0 select-none">→</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {insights.length > 0 && (
        <section className="border-t border-subtle pt-6">
          <button
            type="button"
            onClick={() => setShowLive((s) => !s)}
            className="text-xs uppercase tracking-widest text-muted hover:text-foreground transition"
          >
            {showLive ? "Hide" : "Show"} {insights.length} live insight
            {insights.length === 1 ? "" : "s"} captured during recording
          </button>
          {showLive && (
            <ul className="mt-4 space-y-2">
              {insights.map((ins) => (
                <li
                  key={ins.id}
                  className="text-sm leading-6 text-muted flex gap-3"
                >
                  <span className="text-accent/70 shrink-0 select-none">✦</span>
                  <span>{ins.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </article>
  );
}

function CogIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
