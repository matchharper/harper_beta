export const LEGAL_ACCEPTANCE_QUERY_KEYS = {
  acceptanceType: "legal_acceptance_type",
  documentLocale: "legal_document_locale",
  documentSlug: "legal_document_slug",
  documentVersion: "legal_document_version",
  source: "legal_acceptance_source",
} as const;

export type LegalDocumentAcceptanceType = "acknowledgement" | "consent";

export type LegalDocumentAcceptance = {
  acceptanceType: LegalDocumentAcceptanceType;
  context?: Record<string, unknown>;
  contextKey?: string;
  documentLocale: "ko" | "en";
  documentSlug: string;
  documentVersion: string;
  source: string;
};

export const PRIVACY_POLICY_SLUG = "privacy-policy";
export const PRIVACY_POLICY_VERSION = "1.1.0";

export function buildPrivacyPolicyAcknowledgement(
  locale: "ko" | "en"
): LegalDocumentAcceptance {
  return {
    acceptanceType: "acknowledgement",
    documentLocale: locale,
    documentSlug: PRIVACY_POLICY_SLUG,
    documentVersion: PRIVACY_POLICY_VERSION,
    source: "career_signup",
  };
}

export function appendLegalAcceptanceQuery(
  url: URL,
  acceptance: LegalDocumentAcceptance
) {
  url.searchParams.set(
    LEGAL_ACCEPTANCE_QUERY_KEYS.acceptanceType,
    acceptance.acceptanceType
  );
  url.searchParams.set(
    LEGAL_ACCEPTANCE_QUERY_KEYS.documentLocale,
    acceptance.documentLocale
  );
  url.searchParams.set(
    LEGAL_ACCEPTANCE_QUERY_KEYS.documentSlug,
    acceptance.documentSlug
  );
  url.searchParams.set(
    LEGAL_ACCEPTANCE_QUERY_KEYS.documentVersion,
    acceptance.documentVersion
  );
  url.searchParams.set(LEGAL_ACCEPTANCE_QUERY_KEYS.source, acceptance.source);
}

export function parseLegalAcceptanceQuery(
  readValue: (key: string) => string
): LegalDocumentAcceptance | null {
  const acceptanceType = readValue(LEGAL_ACCEPTANCE_QUERY_KEYS.acceptanceType);
  const documentLocale = readValue(LEGAL_ACCEPTANCE_QUERY_KEYS.documentLocale);
  const documentSlug = readValue(LEGAL_ACCEPTANCE_QUERY_KEYS.documentSlug);
  const documentVersion = readValue(
    LEGAL_ACCEPTANCE_QUERY_KEYS.documentVersion
  );
  const source = readValue(LEGAL_ACCEPTANCE_QUERY_KEYS.source);

  if (
    (acceptanceType !== "acknowledgement" && acceptanceType !== "consent") ||
    (documentLocale !== "ko" && documentLocale !== "en") ||
    !documentSlug ||
    !documentVersion ||
    !source
  ) {
    return null;
  }

  return {
    acceptanceType,
    documentLocale,
    documentSlug,
    documentVersion,
    source,
  };
}

export async function recordLegalDocumentAcceptance(args: {
  acceptance: LegalDocumentAcceptance;
  accessToken: string;
}) {
  const response = await fetch("/api/legal/acceptances", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.acceptance),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Failed to record legal acceptance");
  }
}
