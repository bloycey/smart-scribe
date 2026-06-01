import { supabase } from "@/lib/supabase";
import { createNote } from "./actions";
import NoteListItem from "./NoteListItem";
import type { Note } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { data: notes, error } = await supabase()
    .from("notes")
    .select("id, title, created_at, final_summary")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="mx-auto max-w-2xl pt-24">
        <p className="text-sm text-red-700">
          Supabase error: {error.message}. Check your env vars and that the
          <code className="px-1">notes</code> table exists.
        </p>
      </div>
    );
  }

  const rows = (notes ?? []) as Array<
    Pick<Note, "id" | "title" | "created_at" | "final_summary">
  >;

  return (
    <div className="mx-auto max-w-2xl pt-16">
      <div className="flex items-end justify-between mb-12">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">Notes</h1>
          <p className="mt-2 text-muted text-sm">
            A considered scribe for anything you can say out loud.
          </p>
        </div>
        <form action={createNote}>
          <button
            type="submit"
            className="rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium hover:opacity-85 transition"
          >
            + New note
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="mt-24 text-center">
          <p className="font-serif text-2xl text-foreground/80 mb-3">
            Nothing yet.
          </p>
          <p className="text-sm text-muted mb-8">
            Start your first note and the scribe will listen.
          </p>
          <form action={createNote}>
            <button
              type="submit"
              className="rounded-full border border-subtle px-5 py-2.5 text-sm font-medium hover:bg-foreground hover:text-background transition"
            >
              Start a note
            </button>
          </form>
        </div>
      ) : (
        <ul className="divide-y divide-subtle">
          {rows.map((n) => (
            <NoteListItem
              key={n.id}
              id={n.id}
              title={n.title}
              createdAt={n.created_at}
              snippet={n.final_summary?.executiveSummary ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
