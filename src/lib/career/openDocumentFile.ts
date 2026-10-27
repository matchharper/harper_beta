import { fetchWithInternalAuth } from "@/lib/internalApiClient";

/** Resolve a fresh file URL on click, never reuse the session's expiring URL. */
export async function openDocumentFile(documentId: string) {
  // Reserve the tab during the click so awaiting the request cannot block it.
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try {
    const result = await fetchWithInternalAuth<{
      documents: { id: string; downloadUrl: string | null }[];
    }>(`/api/talent/documents?documentId=${encodeURIComponent(documentId)}`, {
      cache: "no-store",
    });
    const url = result.documents.find((document) => document.id === documentId)?.downloadUrl;
    if (!url) throw new Error("Document file unavailable");
    if (tab) {
      if (!tab.closed) tab.location.replace(url);
    } else {
      window.location.assign(url);
    }
  } catch (error) {
    tab?.close();
    throw error;
  }
}
