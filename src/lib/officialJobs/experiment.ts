import {
  getOfficialJobsApplyHelpAbtestType,
  OFFICIAL_JOBS_APPLY_HELP_CONTROL_ABTEST_TYPE,
  OFFICIAL_JOBS_APPLY_HELP_TREATMENT_ABTEST_TYPE,
  parseOfficialJobsApplyHelpVariant,
  type OfficialJobsApplyHelpVariant,
} from "@/lib/officialJobs/landingLogs";

export const OFFICIAL_JOBS_APPLY_HELP_STORAGE_KEY =
  "harper_official_jobs_apply_help_variant_v1";
export const OFFICIAL_JOBS_APPLY_HELP_DATA_ATTRIBUTE =
  "data-official-jobs-apply-help-variant";
export const OFFICIAL_JOBS_APPLY_HELP_CONTROL_COPY_CLASS =
  "official-jobs-apply-help-control-copy";
export const OFFICIAL_JOBS_APPLY_HELP_TREATMENT_COPY_CLASS =
  "official-jobs-apply-help-treatment-copy";
export const OFFICIAL_JOBS_APPLY_HELP_TREATMENT_ONLY_CLASS =
  "official-jobs-apply-help-treatment-only";

let memoryVariant: OfficialJobsApplyHelpVariant | null = null;

function readVariantFromUrl() {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const directVariant = parseOfficialJobsApplyHelpVariant(params.get("ab"));
  if (directVariant) return directVariant;

  const nextPath = params.get("next");
  if (!nextPath) return null;

  try {
    const nextUrl = new URL(nextPath, window.location.origin);
    return parseOfficialJobsApplyHelpVariant(nextUrl.searchParams.get("ab"));
  } catch {
    return null;
  }
}

function applyVariantToDocument(variant: OfficialJobsApplyHelpVariant) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(
    OFFICIAL_JOBS_APPLY_HELP_DATA_ATTRIBUTE,
    variant
  );
}

function persistVariant(variant: OfficialJobsApplyHelpVariant) {
  memoryVariant = variant;
  applyVariantToDocument(variant);

  try {
    window.localStorage.setItem(OFFICIAL_JOBS_APPLY_HELP_STORAGE_KEY, variant);
  } catch {
    // Keep the in-memory assignment when storage is unavailable.
  }
}

export function getOfficialJobsApplyHelpVariant(options = { create: true }) {
  if (typeof window === "undefined") return null;

  const urlVariant = readVariantFromUrl();
  if (urlVariant) {
    persistVariant(urlVariant);
    return urlVariant;
  }

  if (memoryVariant) {
    applyVariantToDocument(memoryVariant);
    return memoryVariant;
  }

  try {
    const storedVariant = parseOfficialJobsApplyHelpVariant(
      window.localStorage.getItem(OFFICIAL_JOBS_APPLY_HELP_STORAGE_KEY)
    );
    if (storedVariant) {
      memoryVariant = storedVariant;
      applyVariantToDocument(storedVariant);
      return storedVariant;
    }
  } catch {
    // Fall through to an in-memory assignment.
  }

  if (!options.create) return null;

  const variant: OfficialJobsApplyHelpVariant = Math.random() < 0.5 ? "a" : "b";
  persistVariant(variant);
  return variant;
}

export function getOfficialJobsApplyHelpExperimentAbtestType(
  options = { create: true }
) {
  const variant = getOfficialJobsApplyHelpVariant(options);
  return variant ? getOfficialJobsApplyHelpAbtestType(variant) : null;
}

const serializedStorageKey = JSON.stringify(
  OFFICIAL_JOBS_APPLY_HELP_STORAGE_KEY
);
const serializedDataAttribute = JSON.stringify(
  OFFICIAL_JOBS_APPLY_HELP_DATA_ATTRIBUTE
);
const serializedControlAbtestType = JSON.stringify(
  OFFICIAL_JOBS_APPLY_HELP_CONTROL_ABTEST_TYPE
);
const serializedTreatmentAbtestType = JSON.stringify(
  OFFICIAL_JOBS_APPLY_HELP_TREATMENT_ABTEST_TYPE
);

export const OFFICIAL_JOBS_APPLY_HELP_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var storageKey = ${serializedStorageKey};
    var dataAttribute = ${serializedDataAttribute};
    var controlAbtestType = ${serializedControlAbtestType};
    var treatmentAbtestType = ${serializedTreatmentAbtestType};
    var params = new URLSearchParams(window.location.search);
    var source = params.get("source");
    var nextPath = params.get("next");
    var isRelevant = /^\\/jobs(?:\\/|$)/.test(window.location.pathname) || source === "official_jobs";

    if (!isRelevant && nextPath) {
      try {
        isRelevant = new URL(nextPath, window.location.origin).searchParams.get("source") === "official_jobs";
      } catch (_) {}
    }
    if (!isRelevant) return;

    function parseVariant(value) {
      var normalized = String(value || "").trim().toLowerCase();
      if (normalized === "a" || normalized === controlAbtestType) return "a";
      if (normalized === "b" || normalized === treatmentAbtestType) return "b";
      return null;
    }

    var variant = parseVariant(params.get("ab"));
    if (!variant && nextPath) {
      try {
        variant = parseVariant(new URL(nextPath, window.location.origin).searchParams.get("ab"));
      } catch (_) {}
    }
    if (!variant) {
      variant = parseVariant(window.localStorage.getItem(storageKey));
    }
    if (!variant) {
      variant = Math.random() < 0.5 ? "a" : "b";
    }

    window.localStorage.setItem(storageKey, variant);
    document.documentElement.setAttribute(dataAttribute, variant);
  } catch (_) {}
})();
`;

export const OFFICIAL_JOBS_APPLY_HELP_EXPERIMENT_CSS = `
  .${OFFICIAL_JOBS_APPLY_HELP_CONTROL_COPY_CLASS} {
    display: inline;
  }

  .${OFFICIAL_JOBS_APPLY_HELP_TREATMENT_COPY_CLASS},
  .${OFFICIAL_JOBS_APPLY_HELP_TREATMENT_ONLY_CLASS} {
    display: none;
  }

  html[${OFFICIAL_JOBS_APPLY_HELP_DATA_ATTRIBUTE}="b"]
    .${OFFICIAL_JOBS_APPLY_HELP_CONTROL_COPY_CLASS} {
    display: none;
  }

  html[${OFFICIAL_JOBS_APPLY_HELP_DATA_ATTRIBUTE}="b"]
    .${OFFICIAL_JOBS_APPLY_HELP_TREATMENT_COPY_CLASS} {
    display: inline;
  }

  html[${OFFICIAL_JOBS_APPLY_HELP_DATA_ATTRIBUTE}="b"]
    .${OFFICIAL_JOBS_APPLY_HELP_TREATMENT_ONLY_CLASS} {
    display: contents;
  }
`;
