"use server";

import { generateObject } from "ai";
import { z } from "zod";
import { realtimeModel, summaryModel } from "@/lib/ai";
import { supabase } from "@/lib/supabase";
import type { FinalSummary } from "@/lib/types";

const CleanupSchema = z.object({
  transcript: z
    .string()
    .describe(
      "The cleaned-up transcript with proper punctuation, capitalization, and paragraph breaks. Every original word preserved.",
    ),
});

const CLEANUP_SYSTEM_PROMPT = `You clean up raw speech-to-text transcripts.

The input has every word the speaker said, but with no punctuation,
inconsistent capitalization, and no sentence breaks. Web Speech APIs do not
emit punctuation.

Your job:
- Add periods, commas, question marks where the speech clearly ends sentences
  or phrases.
- Capitalize the start of sentences and proper nouns.
- Break into paragraphs at natural topic shifts.
- Preserve EVERY word the speaker said. Do not paraphrase, condense, or
  add words. Do not add filler like "[inaudible]" or "..." — just clean
  punctuation and casing.

If the input is ambiguous, prefer fewer sentence breaks over too many.`;

export async function cleanUpTranscript(
  noteId: string,
  transcript: string,
): Promise<string | null> {
  const raw = transcript.trim();
  if (raw.length < 100) return null;

  const { object } = await generateObject({
    model: realtimeModel,
    schema: CleanupSchema,
    system: CLEANUP_SYSTEM_PROMPT,
    prompt: `Raw transcript:\n\n"""${raw}"""\n\nReturn the cleaned transcript.`,
    temperature: 0.1,
  });

  const cleaned = object.transcript.trim();
  if (!cleaned) return null;

  await supabase()
    .from("notes")
    .update({ transcript: cleaned })
    .eq("id", noteId);

  return cleaned;
}

const SummarySchema = z.object({
  executiveSummary: z
    .string()
    .min(1)
    .describe(
      "1-3 sentences. The single most important takeaway someone would want if they only read one paragraph. For short inputs, a single sentence is fine.",
    ),
  themes: z
    .array(
      z.object({
        title: z
          .string()
          .min(3)
          .max(80)
          .describe("Short, specific theme — not a generic category."),
        points: z
          .array(z.string().min(5))
          .min(1)
          .describe("Concrete bullets from the recording, in order of importance."),
      }),
    )
    .min(1)
    .max(6)
    .describe("Distinct themes that came up. Group what belongs together; don't pad."),
  nextSteps: z
    .array(z.string().min(5))
    .describe(
      "Concrete commitments, follow-ups, or decisions to act on. Empty array if none.",
    ),
});

const SYSTEM_PROMPT = `You are producing a structured briefing from a voice transcript. The
transcript might be a customer call, a meeting, a brainstorm, a personal voice
note, a list of errands, or stream-of-consciousness thinking. Treat whatever
you're given at face value.

Hard rules:
- NEVER comment on the format, length, or nature of the input.
- NEVER say things like "this isn't a typical meeting", "this appears to be a
  personal note", "the transcript is short", or anything similar.
- NEVER apologise for the input or explain what kind of artifact you produced.
- Just produce the briefing.

Principles:
- Substance over volume. Cut anything generic.
- Themes should be specific to THIS recording ("Onboarding friction in the
  mobile app", not "User feedback"; "Saturday errands", not "Personal tasks").
- Quote the speaker where it sharpens the point.
- Next steps are concrete actions, commitments, or decisions. Empty array if
  there genuinely aren't any.
- Executive summary is a short paragraph (2-3 sentences), not a list.
- If the input is a single-speaker note, themes can be loose groupings of what
  was said. Don't force "discussion" framing on monologue content.`;

export async function generateFinalSummary(
  noteId: string,
  customInstructions: string,
): Promise<FinalSummary> {
  const { data, error: readErr } = await supabase()
    .from("notes")
    .select("transcript")
    .eq("id", noteId)
    .single();
  if (readErr || !data) throw new Error(readErr?.message ?? "Not found");

  const transcript = (data.transcript ?? "").trim();
  if (!transcript) {
    throw new Error("Nothing recorded yet.");
  }

  const instructions = customInstructions.trim();
  const instructionsBlock = instructions
    ? `\n\nReader's instructions for this summary:\n"""${instructions}"""\nFollow these where they don't conflict with the principles above.`
    : "";

  const { object } = await generateObject({
    model: summaryModel,
    schema: SummarySchema,
    system: SYSTEM_PROMPT + instructionsBlock,
    prompt: `Full transcript:\n\n"""${transcript}"""\n\nWrite the briefing.`,
    temperature: 0.3,
  });

  const summary: FinalSummary = object;

  const { error: writeErr } = await supabase()
    .from("notes")
    .update({
      final_summary: summary,
      custom_instructions: instructions,
    })
    .eq("id", noteId);
  if (writeErr) throw new Error(writeErr.message);

  return summary;
}
