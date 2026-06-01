export type RealtimeInsight = {
  text: string;
  created_at: string;
};

export type FinalSummary = {
  executiveSummary: string;
  themes: Array<{ title: string; points: string[] }>;
  nextSteps: string[];
};

export type Note = {
  id: string;
  title: string;
  created_at: string;
  transcript: string;
  realtime_insights: RealtimeInsight[];
  final_summary: FinalSummary | null;
  custom_instructions: string;
};
