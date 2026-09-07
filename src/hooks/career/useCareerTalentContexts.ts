import { useCallback, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerTalentContext,
  CareerTalentContextChange,
  CareerTalentContextCollection,
  SessionResponse,
} from "@/components/career/types";
import type { FetchWithAuth } from "./useCareerApi";
import { getErrorMessage } from "./careerHelpers";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";

type ContextPayload = {
  error?: string;
  hasMore?: unknown;
  nextCursor?: unknown;
  talentBrief?: unknown;
  talentContextsUpdatedAt?: unknown;
  talentMemories?: unknown;
};

const normalizeContextRows = (
  value: unknown,
  collection: CareerTalentContextCollection
): CareerTalentContext[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const id = Number(row.id);
    const ref = Number(row.ref);
    const revision = Number(row.revision);
    const content = typeof row.content === "string" ? row.content.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (
      row.collection !== collection ||
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !Number.isSafeInteger(ref) ||
      ref <= 0 ||
      !Number.isSafeInteger(revision) ||
      revision <= 0 ||
      !content ||
      (collection === "brief" && !label)
    ) {
      return [];
    }
    return [
      {
        collection,
        content,
        createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
        id,
        key: typeof row.key === "string" && row.key.trim() ? row.key : null,
        label: collection === "brief" ? label : null,
        ref,
        revision,
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
      },
    ];
  });
};

const normalizeUpdatedAt = (value: unknown) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;

export function useCareerTalentContexts(args: {
  fetchWithAuth: FetchWithAuth;
  user: User | null;
}) {
  const { fetchWithAuth, user } = args;
  const tCareer = useCareerMessageFormatter();
  const [talentBrief, setTalentBrief] = useState<CareerTalentContext[]>([]);
  const [talentMemories, setTalentMemories] = useState<CareerTalentContext[]>(
    []
  );
  const [talentContextsUpdatedAt, setTalentContextsUpdatedAt] = useState<
    string | null
  >(null);
  const [talentContextsSavePending, setTalentContextsSavePending] =
    useState(false);
  const [talentMemoriesLoadPending, setTalentMemoriesLoadPending] =
    useState(false);
  const [talentMemoriesLoaded, setTalentMemoriesLoaded] = useState(false);
  const [talentMemoriesHasMore, setTalentMemoriesHasMore] = useState(false);
  const [talentMemoriesNextCursor, setTalentMemoriesNextCursor] = useState<
    number | null
  >(null);
  const [talentContextsSaveError, setTalentContextsSaveError] = useState("");
  const [talentContextsSaveInfo, setTalentContextsSaveInfo] = useState("");

  const applyPersistedTalentContexts = useCallback(
    (payload: ContextPayload) => {
      if (payload.talentBrief !== undefined) {
        setTalentBrief(normalizeContextRows(payload.talentBrief, "brief"));
      }
      if (payload.talentMemories !== undefined) {
        setTalentMemories(
          normalizeContextRows(payload.talentMemories, "memory")
        );
        setTalentMemoriesHasMore(payload.hasMore === true);
        const nextCursor = Number(payload.nextCursor);
        setTalentMemoriesNextCursor(
          Number.isSafeInteger(nextCursor) && nextCursor > 0 ? nextCursor : null
        );
        setTalentMemoriesLoaded(true);
      } else if (payload.talentContextsUpdatedAt !== undefined) {
        setTalentMemoriesLoaded(false);
      }
      if (payload.talentContextsUpdatedAt !== undefined) {
        setTalentContextsUpdatedAt(
          normalizeUpdatedAt(payload.talentContextsUpdatedAt)
        );
      }
    },
    []
  );

  const loadTalentMemories = useCallback(
    async (options?: { append?: boolean }) => {
      if (!user || talentMemoriesLoadPending) return false;
      const append = options?.append === true;
      if (append && !talentMemoriesNextCursor) return false;
      setTalentMemoriesLoadPending(true);
      setTalentContextsSaveError("");
      try {
        const params = new URLSearchParams({
          collection: "memory",
          limit: "50",
        });
        if (append && talentMemoriesNextCursor) {
          params.set("cursor", String(talentMemoriesNextCursor));
        }
        const response = await fetchWithAuth(
          `/api/talent/contexts?${params.toString()}`
        );
        const payload = (await response
          .json()
          .catch(() => ({}))) as ContextPayload;
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.settingsLoadFailed))
          );
        }
        const page = normalizeContextRows(payload.talentMemories, "memory");
        setTalentMemories((current) => {
          if (!append) return page;
          const byId = new Map(current.map((row) => [row.id, row]));
          for (const row of page) byId.set(row.id, row);
          return Array.from(byId.values());
        });
        setTalentMemoriesHasMore(payload.hasMore === true);
        const nextCursor = Number(payload.nextCursor);
        setTalentMemoriesNextCursor(
          Number.isSafeInteger(nextCursor) && nextCursor > 0 ? nextCursor : null
        );
        setTalentMemoriesLoaded(true);
        return true;
      } catch (error) {
        setTalentContextsSaveError(
          error instanceof Error ? error.message : tCareer(H.settingsLoadFailed)
        );
        return false;
      } finally {
        setTalentMemoriesLoadPending(false);
      }
    },
    [
      fetchWithAuth,
      tCareer,
      talentMemoriesLoadPending,
      talentMemoriesNextCursor,
      user,
    ]
  );

  const applySessionTalentContexts = useCallback(
    (payload: SessionResponse) => {
      applyPersistedTalentContexts({
        talentBrief: payload.talentBrief,
        talentContextsUpdatedAt:
          payload.profileSettingsMeta?.talentContextsUpdatedAt ??
          payload.profileSettingsMeta?.talentInsightsUpdatedAt,
        ...(Object.prototype.hasOwnProperty.call(payload, "talentMemories")
          ? { talentMemories: payload.talentMemories }
          : {}),
      });
      setTalentContextsSaveError("");
      setTalentContextsSaveInfo("");
    },
    [applyPersistedTalentContexts]
  );

  const mutateTalentContexts = useCallback(
    async (changes: CareerTalentContextChange[]) => {
      if (!user || talentContextsSavePending || changes.length === 0) {
        return false;
      }
      setTalentContextsSavePending(true);
      setTalentContextsSaveError("");
      setTalentContextsSaveInfo("");
      try {
        const response = await fetchWithAuth("/api/talent/contexts", {
          body: JSON.stringify({
            changes,
            requestId: crypto.randomUUID(),
          }),
          method: "POST",
        });
        const payload = (await response
          .json()
          .catch(() => ({}))) as ContextPayload;
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.harperInsightSaveFailed))
          );
        }
        applyPersistedTalentContexts(payload);
        const memoryChanged = changes.some((change) => {
          if (change.op === "add") return change.collection === "memory";
          return talentMemories.some((row) => row.id === change.id);
        });
        if (memoryChanged) {
          await loadTalentMemories();
        }
        setTalentContextsSaveInfo(tCareer(H.harperInsightSaved));
        return true;
      } catch (error) {
        setTalentContextsSaveError(
          error instanceof Error
            ? error.message
            : tCareer(H.harperInsightSaveFailed)
        );
        return false;
      } finally {
        setTalentContextsSavePending(false);
      }
    },
    [
      applyPersistedTalentContexts,
      fetchWithAuth,
      loadTalentMemories,
      tCareer,
      talentMemories,
      talentContextsSavePending,
      user,
    ]
  );

  const resetTalentContextsState = useCallback(() => {
    setTalentBrief([]);
    setTalentMemories([]);
    setTalentContextsUpdatedAt(null);
    setTalentContextsSavePending(false);
    setTalentMemoriesLoadPending(false);
    setTalentMemoriesLoaded(false);
    setTalentMemoriesHasMore(false);
    setTalentMemoriesNextCursor(null);
    setTalentContextsSaveError("");
    setTalentContextsSaveInfo("");
  }, []);

  return useMemo(
    () => ({
      applyPersistedTalentContexts,
      applySessionTalentContexts,
      loadTalentMemories,
      mutateTalentContexts,
      resetTalentContextsState,
      talentBrief,
      talentContextsSaveError,
      talentContextsSaveInfo,
      talentContextsSavePending,
      talentContextsUpdatedAt,
      talentMemories,
      talentMemoriesHasMore,
      talentMemoriesLoaded,
      talentMemoriesLoadPending,
    }),
    [
      applyPersistedTalentContexts,
      applySessionTalentContexts,
      loadTalentMemories,
      mutateTalentContexts,
      resetTalentContextsState,
      talentBrief,
      talentContextsSaveError,
      talentContextsSaveInfo,
      talentContextsSavePending,
      talentContextsUpdatedAt,
      talentMemories,
      talentMemoriesHasMore,
      talentMemoriesLoaded,
      talentMemoriesLoadPending,
    ]
  );
}
