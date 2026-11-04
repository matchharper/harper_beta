import { after } from "next/server";
import { setTimeout as delay } from "node:timers/promises";

// The same retention used by the durable Career queue messages.
const RETENTION_MS = 86_400_000;
const localState = globalThis as typeof globalThis & {
  harperCareerDevelopmentJobs?: Set<string>;
};
const jobs = (localState.harperCareerDevelopmentJobs ??= new Set<string>());

/** Local Next servers have no Vercel queue identity. Keep the shared processors
 * alive after the response; durable reply claims still own execution deduplication. */
export function scheduleCareerDevelopmentJob(
  key: string,
  processJob: () => Promise<boolean | void>,
  runtime: {
    schedule: (callback: () => Promise<void>) => void;
    wait: (milliseconds: number) => Promise<unknown>;
    now: () => number;
  } = { schedule: after, wait: delay, now: Date.now }
) {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL)
    return false;
  if (jobs.has(key)) return true;
  jobs.add(key);
  const expiresAt = runtime.now() + RETENTION_MS;
  try {
    runtime.schedule(async () => {
      try {
        while (runtime.now() < expiresAt) {
          let waitMs = 5000;
          try {
            if ((await processJob()) !== false) return;
          } catch (error) {
            console.error("[career-background] Local job will retry", {
              key,
              error: error instanceof Error ? error.message : String(error),
            });
            waitMs = 60_000;
          }
          await runtime.wait(waitMs);
        }
        console.error("[career-background] Local job retention expired", {
          key,
        });
      } finally {
        jobs.delete(key);
      }
    });
  } catch (error) {
    jobs.delete(key);
    throw error;
  }
  return true;
}
