"use server";

import { generateObject } from "ai";
import { z } from "zod";
import { realtimeModel } from "@/lib/ai";
import { supabase } from "@/lib/supabase";
import type { RealtimeInsight } from "@/lib/types";

const RealtimeSchema = z.object({
  newInsights: z
    .array(z.string().min(3).max(280))
    .describe(
      "Sharp, specific, NET-NEW insights from this transcript chunk. Empty array if there is nothing worth flagging.",
    ),
  suggestedTitle: z
    .string()
    .min(3)
    .max(60)
    .nullable()
    .describe(
      "A specific 3-7 word title for this recording based on what you've heard so far. Lead with the noun. No 'Discussion of', 'About', filler. Null if the chunk doesn't reveal enough to name it yet.",
    ),
});

const SYSTEM_PROMPT = `You are a sharp listener reading a fresh chunk of a voice transcript. The
transcript could be anything someone speaks aloud — a customer call, a
brainstorm, a personal voice memo, a list of errands, stream of consciousness.
Treat whatever you're given at face value. Never comment on what kind of
content it is.

Your job: emit only genuinely NEW, specific things worth flagging from THIS
chunk.

What counts as worth flagging (across any kind of voice input):
- A concrete pain point, blocker, or frustration
- A specific requirement, idea, or intention
- A surprising opinion, reaction, or realisation
- A commitment, decision, or action item
- A workflow detail or concrete fact that reveals something specific

What does NOT count (do NOT emit):
- Pleasantries, filler ("yeah", "okay", "right"), or off-topic chatter
- Vague restatements of prior items
- Generic observations a careful listener would already know
- Meta-commentary about the recording itself

Style:
- Each item is a single sentence — specific and concrete, in the speaker's words where possible.
- Lead with the noun. No preamble. No "the speaker says…".
- If the chunk has nothing sharp, return an empty array. Empty is fine — better than noise.

You are NEVER shown previously-emitted items. Do not try to summarise or
de-duplicate against earlier chunks — just emit what is new in THIS chunk.

Also: emit a short, specific title for this recording if the chunk reveals
enough about what it's about. 3-7 words, lead with the noun, no filler. The
title gets refined on each tick. Null is fine when there's not enough yet.`;

const DEFAULT_TITLE = "Untitled note";

export type RealtimeExtractionResult = {
  newInsights: RealtimeInsight[];
  titleUpdate: string | null;
};

export async function extractRealtimeInsights(
  noteId: string,
  chunk: string,
): Promise<RealtimeExtractionResult> {
  const text = chunk.trim();
  if (text.length < 40) return { newInsights: [], titleUpdate: null };

  const { object } = await generateObject({
    model: realtimeModel,
    schema: RealtimeSchema,
    system: SYSTEM_PROMPT,
    prompt: `Transcript chunk:\n\n"""${text}"""\n\nEmit only NEW, sharp insights from this chunk. Return an empty array if nothing qualifies.`,
    temperature: 0.2,
  });

  // Read current state so we can append insights AND only set title if it's
  // still the default.
  const { data, error: readErr } = await supabase()
    .from("notes")
    .select("realtime_insights, title")
    .eq("id", noteId)
    .single();
  if (readErr || !data) throw new Error(readErr?.message ?? "Not found");

  let titleUpdate: string | null = null;
  if (
    object.suggestedTitle &&
    object.suggestedTitle.trim() &&
    data.title === DEFAULT_TITLE
  ) {
    titleUpdate = object.suggestedTitle.trim();
  }

  if (object.newInsights.length === 0 && !titleUpdate) {
    return { newInsights: [], titleUpdate: null };
  }

  const now = new Date().toISOString();
  const newInsights: RealtimeInsight[] = object.newInsights.map((t) => ({
    text: t,
    created_at: now,
  }));

  const existing = (data.realtime_insights ?? []) as RealtimeInsight[];
  const merged = existing.concat(newInsights);

  const update: Record<string, unknown> = { realtime_insights: merged };
  if (titleUpdate) update.title = titleUpdate;

  const { error: writeErr } = await supabase()
    .from("notes")
    .update(update)
    .eq("id", noteId);
  if (writeErr) throw new Error(writeErr.message);

  return { newInsights, titleUpdate };
}
