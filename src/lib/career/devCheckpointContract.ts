// This is an explicitly requested, fixed checkpoint, never a capture-on-click.
export const CAREER_CHECKPOINT_USER_ID = "2c3a9d50-d392-4764-8bd1-6d9c036ddc87";
export const CAREER_CHECKPOINT_EMAIL = "daniel@matchharper.com";
export const CAREER_CHECKPOINT_LABEL = "2026-10-28 16:17:11 KST";

export type CareerCheckpointStatus = {
  available: boolean;
  capturedAt: string;
  message?: string;
  tables?: {
    name: string;
    baseline: number;
    current: number;
    changed: boolean;
  }[];
};

export const CAREER_CHECKPOINT_SHA256 =
  "bf3ebdad0f8a9261affb280bc140953719fe8fd04f676a79f6363ce74da40b85";
