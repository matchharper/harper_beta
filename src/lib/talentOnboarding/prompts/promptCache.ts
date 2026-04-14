import { supabaseServer } from "@/lib/supabaseServer";

// Manual types for tables not yet in generated database.types.ts
// Remove these after running `supabase gen types` with the migration applied
type PromptTemplateRow = {
  id: string;
  slug: string;
  name: string;
  content: string;
  draft_content: string | null;
  required_sections: string[];
  updated_at: string;
  published_at: string | null;
  updated_by: string | null;
};

type PromptTestFlagRow = {
  user_id: string;
  template_slug: string;
  enabled_at: string;
};

type CacheEntry = {
  content: string;
  draftContent: string | null;
  fetchedAt: number;
};

type CacheState = {
  cache: Map<string, CacheEntry>;
  lastWarmAt: number;
  resetLazyPrompts: (() => void) | null;
};

const TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Use globalThis to share cache across all API routes in the same process.
 * In Next.js dev mode, module-level variables can be separate per route
 * due to HMR/webpack module scoping. globalThis persists across all routes.
 */
function getState(): CacheState {
  const g = globalThis as any;
  if (!g.__promptCacheState) {
    g.__promptCacheState = {
      cache: new Map<string, CacheEntry>(),
      lastWarmAt: 0,
      resetLazyPrompts: null,
    };
  }
  return g.__promptCacheState;
}

/** Warm cache from DB. No-op if TTL is still valid. */
export async function warmCache(): Promise<void> {
  const state = getState();
  const now = Date.now();
  if (now - state.lastWarmAt < TTL && state.cache.size > 0) return;

  try {
    const { data, error } = await (supabaseServer as any)
      .from("prompt_templates")
      .select("slug, content, draft_content") as { data: Pick<PromptTemplateRow, "slug" | "content" | "draft_content">[] | null; error: any };

    if (error) {
      console.warn("[promptCache] DB fetch failed, using fallback:", error.message);
      return;
    }

    if (data) {
      for (const row of data) {
        state.cache.set(row.slug, {
          content: row.content,
          draftContent: row.draft_content,
          fetchedAt: now,
        });
      }
      state.lastWarmAt = now;
    }
  } catch (err) {
    console.warn("[promptCache] warmCache error, using fallback:", err);
  }
}

/** Get cached published content. Returns null on cache miss. */
export function getCached(slug: string): string | null {
  const { cache } = getState();
  const entry = cache.get(slug);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL) return null;
  return entry.content;
}

/** Get cached draft content. Returns null if no draft. */
export function getDraftCached(slug: string): string | null {
  const { cache } = getState();
  const entry = cache.get(slug);
  if (!entry) return null;
  return entry.draftContent;
}

/** Clear all cache + reset lazy prompt getters. */
export function invalidateCache(): void {
  const state = getState();
  state.cache.clear();
  state.lastWarmAt = 0;
  if (state.resetLazyPrompts) state.resetLazyPrompts();
}

/** Hook for interviewSteps.ts to register its reset function. */
export function registerLazyReset(fn: () => void): void {
  getState().resetLazyPrompts = fn;
}

/** Check if user has an active draft test flag for a given prompt slug. */
export async function isTestUser(
  userId: string,
  slug: string
): Promise<boolean> {
  try {
    const { data } = await (supabaseServer as any)
      .from("prompt_test_flags")
      .select("user_id")
      .eq("user_id", userId)
      .eq("template_slug", slug)
      .maybeSingle() as { data: PromptTestFlagRow | null };
    return !!data;
  } catch {
    return false;
  }
}

/** Check if user has ANY active draft test flag. */
export async function hasAnyTestFlag(userId: string): Promise<boolean> {
  try {
    const { data } = await (supabaseServer as any)
      .from("prompt_test_flags")
      .select("template_slug")
      .eq("user_id", userId) as { data: Pick<PromptTestFlagRow, "template_slug">[] | null };
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/** Get all active test flag slugs for a user. */
export async function getTestFlagSlugs(userId: string): Promise<string[]> {
  try {
    const { data } = await (supabaseServer as any)
      .from("prompt_test_flags")
      .select("template_slug")
      .eq("user_id", userId) as { data: Pick<PromptTestFlagRow, "template_slug">[] | null };
    return (data ?? []).map((r: Pick<PromptTestFlagRow, "template_slug">) => r.template_slug);
  } catch {
    return [];
  }
}

/**
 * Load prompt content for a specific user.
 * If the user has a draft test flag for this slug, returns draft_content.
 * Otherwise returns published content from cache, or null.
 */
export function getContentForUser(
  slug: string,
  testSlugs: string[]
): string | null {
  if (testSlugs.includes(slug)) {
    const draft = getDraftCached(slug);
    if (draft) return draft;
  }
  return getCached(slug);
}
