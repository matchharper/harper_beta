import "server-only";
import type { User } from "@supabase/supabase-js";

/** Trusted server entrypoints supply identity; every handler retains ownership checks. */
export type CareerRequestRuntime = {
  getUser: () => Promise<User | null>;
  scheduleAfter: (task: () => Promise<void>) => void;
};
