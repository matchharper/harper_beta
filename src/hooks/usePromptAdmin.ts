import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

async function authFetch(url: string, options?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// --- Types ---

export type PromptListItem = {
  id: string;
  slug: string;
  name: string;
  updated_at: string;
  published_at: string | null;
  has_draft: boolean;
  latest_version: number;
};

export type PromptVersion = {
  id: string;
  version_number: number;
  content: string;
  published_at: string;
  published_by: string | null;
};

export type PromptDetail = {
  id: string;
  slug: string;
  name: string;
  content: string;
  draft_content: string | null;
  required_sections: string[];
  updated_at: string;
  published_at: string | null;
};

// --- Queries ---

export function usePromptList() {
  return useQuery<PromptListItem[]>({
    queryKey: ["prompts"],
    queryFn: async () => {
      const res = await authFetch("/api/internal/prompts");
      return res.data;
    },
  });
}

export function usePromptDetail(slug: string) {
  return useQuery<{ data: PromptDetail; versions: PromptVersion[] }>({
    queryKey: ["prompts", slug],
    queryFn: () => authFetch(`/api/internal/prompts/${slug}`),
    enabled: !!slug,
  });
}

export function useTestFlags() {
  return useQuery<string[]>({
    queryKey: ["prompt-test-flags"],
    queryFn: async () => {
      const res = await authFetch("/api/internal/prompts/test-flag");
      return res.flags;
    },
  });
}

// --- Mutations ---

export function usePromptSaveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, draftContent }: { slug: string; draftContent: string }) =>
      authFetch(`/api/internal/prompts/${slug}`, {
        method: "PUT",
        body: JSON.stringify({ draft_content: draftContent }),
      }),
    onSuccess: (_, { slug }) => {
      qc.invalidateQueries({ queryKey: ["prompts", slug] });
      qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}

export function usePromptPublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) =>
      authFetch(`/api/internal/prompts/${slug}/publish`, { method: "POST" }),
    onSuccess: (_, slug) => {
      qc.invalidateQueries({ queryKey: ["prompts", slug] });
      qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}

export function usePromptRollback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, versionNumber }: { slug: string; versionNumber: number }) =>
      authFetch(`/api/internal/prompts/${slug}/rollback`, {
        method: "POST",
        body: JSON.stringify({ version_number: versionNumber }),
      }),
    onSuccess: (_, { slug }) => {
      qc.invalidateQueries({ queryKey: ["prompts", slug] });
    },
  });
}

export function useToggleTestFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, enabled }: { slug: string; enabled: boolean }) =>
      authFetch("/api/internal/prompts/test-flag", {
        method: "POST",
        body: JSON.stringify({ slug, enabled }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompt-test-flags"] });
    },
  });
}
