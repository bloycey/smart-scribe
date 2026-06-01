"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";

export async function createNote() {
  const { data, error } = await supabase()
    .from("notes")
    .insert({})
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Insert failed");
  revalidatePath("/");
  redirect(`/notes/${data.id}`);
}

export async function renameNote(id: string, title: string) {
  const next = title.trim().length > 0 ? title.trim() : "Untitled note";
  const { error } = await supabase()
    .from("notes")
    .update({ title: next })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteNote(id: string) {
  const { error } = await supabase().from("notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function appendTranscriptChunk(id: string, chunk: string) {
  if (!chunk.trim()) return;
  const { data, error: readErr } = await supabase()
    .from("notes")
    .select("transcript")
    .eq("id", id)
    .single();
  if (readErr || !data) throw new Error(readErr?.message ?? "Not found");
  const next = data.transcript ? `${data.transcript} ${chunk}` : chunk;
  const { error } = await supabase()
    .from("notes")
    .update({ transcript: next })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
