import {
  MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES,
  MAX_TALENT_DOCUMENT_FILE_SIZE_LABEL,
} from "@/lib/talentOnboarding/documentUploadLimits";

type AuthenticatedFetch = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

type DocumentUploadPayload = {
  [key: string]: unknown;
  document?: ({ id?: unknown } & Record<string, unknown>) | null;
  requestCompleted?: unknown;
  resumeDownloadUrl?: unknown;
  resumeFileName?: unknown;
  resumeStoragePath?: unknown;
  resumeText?: unknown;
};

function payloadError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const error = (payload as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim()) return error.trim();
  }
  return fallback;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("The upload was aborted", "AbortError");
  }
}

export async function uploadTalentDocument(args: {
  fetchWithAuth: AuthenticatedFetch;
  file: File;
  kind?: "document" | "resume";
  resumeRequestToken?: string | null;
  signal?: AbortSignal;
  source?: "chat" | "profile";
}): Promise<DocumentUploadPayload> {
  if (args.file.size <= 0) throw new Error("The selected file is empty.");
  if (args.file.size > MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES) {
    throw new Error(
      `File size must not exceed ${MAX_TALENT_DOCUMENT_FILE_SIZE_LABEL}`
    );
  }
  throwIfAborted(args.signal);

  const formData = new FormData();
  formData.append("file", args.file);
  formData.append("kind", args.kind ?? "resume");
  formData.append("source", args.source ?? "profile");
  if (args.resumeRequestToken) {
    formData.append("resumeRequestToken", args.resumeRequestToken);
  }

  const response = await args.fetchWithAuth("/api/talent/documents/upload", {
    method: "POST",
    body: formData,
    signal: args.signal,
  });
  const payload = (await response
    .json()
    .catch(() => ({}))) as DocumentUploadPayload;
  if (!response.ok) {
    throw new Error(
      payloadError(payload, "Failed to upload document")
    );
  }
  return payload;
}
