"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteNote } from "./actions";

type Props = {
  id: string;
  title: string;
  createdAt: string;
  snippet: string | null;
};

export default function NoteListItem({ id, title, createdAt, snippet }: Props) {
  const [pending, startTransition] = useTransition();
  const [gone, setGone] = useState(false);

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      try {
        await deleteNote(id);
        setGone(true);
      } catch {
        // silently fail — the row stays
      }
    });
  }

  if (gone) return null;

  return (
    <li className="group relative">
      <Link href={`/notes/${id}`} className="block py-5 transition">
        <div className="flex items-baseline justify-between gap-4 pr-12">
          <h2 className="font-serif text-xl group-hover:underline underline-offset-4 decoration-1">
            {title}
          </h2>
          <time
            className="text-xs text-muted tabular-nums shrink-0"
            suppressHydrationWarning
          >
            {new Date(createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </div>
        {snippet ? (
          <p className="mt-1 text-sm text-muted line-clamp-2 pr-12">{snippet}</p>
        ) : (
          <p className="mt-1 text-sm text-muted/70 italic">No summary yet</p>
        )}
      </Link>

      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        aria-label={`Delete ${title}`}
        className="absolute top-5 right-0 size-7 grid place-items-center rounded-full text-muted/0 group-hover:text-muted hover:!text-red-700 hover:bg-foreground/[0.05] transition disabled:opacity-50"
      >
        <TrashIcon className="size-4" />
      </button>
    </li>
  );
}

function TrashIcon({ className }: { className?: string }) {
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
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
