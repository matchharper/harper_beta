import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  normalizeUpdateNotesFeatureVoteContext,
  normalizeUpdateNotesFeatureVoteCustomResponse,
  normalizeUpdateNotesFeatureVoteOptionIds,
  type UpdateNotesFeatureVoteOptionId,
} from "@/lib/updateNotesFeatureVote";

export type SavedUpdateNotesFeatureVote = {
  context: string;
  customResponse: string;
  optionIds: UpdateNotesFeatureVoteOptionId[];
  submittedAt: string;
};

type UpdateNotesFeatureVoteStoreState = {
  hasHydrated: boolean;
  responsesByUserId: Record<string, SavedUpdateNotesFeatureVote>;
  saveResponse: (userId: string, response: SavedUpdateNotesFeatureVote) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
};

function normalizeSavedResponse(
  value: unknown
): SavedUpdateNotesFeatureVote | null {
  if (!value || typeof value !== "object") return null;

  const response = value as Partial<SavedUpdateNotesFeatureVote>;
  const optionIds = normalizeUpdateNotesFeatureVoteOptionIds(
    response.optionIds
  );
  const customResponse = normalizeUpdateNotesFeatureVoteCustomResponse(
    response.customResponse
  );
  if (optionIds.length === 0 && !customResponse) return null;

  return {
    context: normalizeUpdateNotesFeatureVoteContext(response.context),
    customResponse,
    optionIds,
    submittedAt:
      typeof response.submittedAt === "string" ? response.submittedAt : "",
  };
}

function normalizeSavedResponses(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, SavedUpdateNotesFeatureVote>;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(
      ([userId, response]) => {
        const normalizedUserId = userId.trim();
        const normalizedResponse = normalizeSavedResponse(response);
        return normalizedUserId && normalizedResponse
          ? [[normalizedUserId, normalizedResponse]]
          : [];
      }
    )
  );
}

export const useUpdateNotesFeatureVoteStore =
  create<UpdateNotesFeatureVoteStoreState>()(
    persist(
      (set) => ({
        hasHydrated: false,
        responsesByUserId: {},
        saveResponse: (userId, response) =>
          set((state) => ({
            responsesByUserId: {
              ...state.responsesByUserId,
              [userId]: response,
            },
          })),
        setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      }),
      {
        name: "harper-update-notes-feature-vote",
        version: 1,
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
        partialize: (state) => ({
          responsesByUserId: state.responsesByUserId,
        }),
        merge: (persistedState, currentState) => {
          const persisted =
            persistedState as Partial<UpdateNotesFeatureVoteStoreState> | null;

          return {
            ...currentState,
            responsesByUserId: normalizeSavedResponses(
              persisted?.responsesByUserId
            ),
          };
        },
        storage: createJSONStorage(() => localStorage),
      }
    )
  );
