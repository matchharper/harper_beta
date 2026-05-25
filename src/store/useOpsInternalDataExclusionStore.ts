import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const normalizeExclusionTerm = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

export function normalizeOpsInternalDataExclusionTerms(values: unknown[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  values.forEach((value) => {
    const term = normalizeExclusionTerm(value);
    if (!term || seen.has(term)) return;
    seen.add(term);
    normalized.push(term);
  });

  return normalized;
}

export function isEmailExcludedByOpsInternalTerms(
  email: string | null | undefined,
  terms: readonly string[]
) {
  const normalizedEmail = normalizeExclusionTerm(email);
  if (!normalizedEmail) return false;

  return terms.some((term) => {
    const normalizedTerm = normalizeExclusionTerm(term);
    return normalizedTerm.length > 0 && normalizedEmail.includes(normalizedTerm);
  });
}

type OpsInternalDataExclusionStoreState = {
  emailExclusionTerms: string[];
  addEmailExclusionTerm: (value: string) => void;
  clearEmailExclusionTerms: () => void;
  removeEmailExclusionTerm: (value: string) => void;
  setEmailExclusionTerms: (values: string[]) => void;
};

export const useOpsInternalDataExclusionStore =
  create<OpsInternalDataExclusionStoreState>()(
    persist(
      (set) => ({
        emailExclusionTerms: [],
        addEmailExclusionTerm: (value) =>
          set((state) => ({
            emailExclusionTerms: normalizeOpsInternalDataExclusionTerms([
              ...state.emailExclusionTerms,
              value,
            ]),
          })),
        clearEmailExclusionTerms: () =>
          set({
            emailExclusionTerms: [],
          }),
        removeEmailExclusionTerm: (value) => {
          const target = normalizeExclusionTerm(value);
          set((state) => ({
            emailExclusionTerms: state.emailExclusionTerms.filter(
              (term) => normalizeExclusionTerm(term) !== target
            ),
          }));
        },
        setEmailExclusionTerms: (values) =>
          set({
            emailExclusionTerms: normalizeOpsInternalDataExclusionTerms(values),
          }),
      }),
      {
        name: "ops-internal-data-exclusion",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          emailExclusionTerms: state.emailExclusionTerms,
        }),
      }
    )
  );
