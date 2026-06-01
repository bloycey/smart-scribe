import "server-only";
import { anthropic } from "@ai-sdk/anthropic";

// Layer 1: realtime, additive, cheap. Runs every ~20s during recording.
export const realtimeModel = anthropic("claude-haiku-4-5");

// Layer 2: final summary, considered, expensive. Runs once when the user
// asks for the summary.
export const summaryModel = anthropic("claude-sonnet-4-6");
