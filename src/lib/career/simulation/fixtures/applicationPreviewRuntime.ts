import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/** Local transport fixtures; the production UI and its event handlers are reused. */
export function installApplicationPreviewRuntime() {
  const originalFetch = window.fetch;
  const originalSession = supabase.auth.getSession;
  const session: Session = {
    access_token: "local-preview-no-access",
    token_type: "bearer",
    refresh_token: "",
    expires_in: 3600,
    user: {
      id: "application-preview-user",
      aud: "authenticated",
      email: "preview@example.invalid",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-10-26T03:00:00Z",
    },
  };
  const documents = [
    {
      id: "preview-resume",
      kind: "resume",
      fileName: "김하퍼 이력서.pdf",
      isPrimary: true,
    },
    {
      id: "preview-resume-en",
      kind: "resume",
      fileName: "Harper Kim Resume.pdf",
      isPrimary: false,
    },
  ];
  supabase.auth.getSession = async () => ({ data: { session }, error: null });
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      window.location.origin
    );
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (
      url.origin === window.location.origin &&
      ["/api/talent/documents", "/api/talent/documents/upload"].includes(
        url.pathname
      )
    ) {
      if (method === "GET") return Response.json({ documents });
      if (method === "POST" && init?.body instanceof FormData) {
        const file = init.body.get("file");
        const document = {
          id: `preview-upload-${documents.length}`,
          kind: "resume",
          fileName: file instanceof File ? file.name : "Preview.pdf",
          isPrimary: false,
        };
        documents.push(document);
        return Response.json({ document });
      }
    }
    // Only static dev resources and the read-only local font/pagination endpoint
    // reach the network. No production API, analytics, uploads or application runs.
    if (
      url.origin === window.location.origin &&
      method === "GET" &&
      (!url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/api/resume-assets/"))
    ) {
      return originalFetch(input, init);
    }
    return Response.json({ error: "Local preview only" }, { status: 403 });
  };
  return () => {
    window.fetch = originalFetch;
    supabase.auth.getSession = originalSession;
  };
}
