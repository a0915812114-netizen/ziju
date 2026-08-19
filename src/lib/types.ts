export type Word = {
  text: string;
  startMs: number;
  endMs: number;
};

export type Cue = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words: Word[];
};

export type JobPhase =
  | "idle"
  | "extracting"
  | "transcribing"
  | "exporting"
  | "ready"
  | "error";

export type JobStatus = {
  phase: JobPhase;
  progress: number;
  message: string;
};

export type AsrStatus = {
  configured: boolean;
  provider: "groq" | "openai" | null;
  owner: boolean;
  remaining: number | null;
};

export type SeekOpts = {
  play?: boolean;
  pause?: boolean;
};
