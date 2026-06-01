import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Note } from "@/lib/types";
import NoteClient from "./NoteClient";

export const dynamic = "force-dynamic";

export default async function NotePage(props: PageProps<"/notes/[id]">) {
  const { id } = await props.params;
  const { data, error } = await supabase()
    .from("notes")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  const note = data as Note;
  return <NoteClient note={note} />;
}
