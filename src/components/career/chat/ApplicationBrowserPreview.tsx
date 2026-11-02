"use client";

import { useQuery } from "@tanstack/react-query";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { applicationBrowserPreviewSession } from "@/lib/career/simulation/applicationBrowserPreview";
import { BrowserPreviewFrame } from "../BrowserPreviewFrame";
import { useApplicationPreparation } from "./ApplicationPreparationContext";

export function ApplicationBrowserPreview() {
  const { record } = useApplicationPreparation();
  const sessionId = applicationBrowserPreviewSession(record?.state);
  return record && sessionId ? (
    <ActiveBrowserPreview
      key={sessionId}
      messageId={record.messageId}
      sessionId={sessionId}
    />
  ) : null;
}

function ActiveBrowserPreview({
  messageId,
  sessionId,
}: {
  messageId: number;
  sessionId: string;
}) {
  const { fetchWithAuth } = useCareerApi();
  const { data } = useQuery({
    queryKey: ["application-browser-preview", messageId, sessionId],
    queryFn: async ({ signal }) => {
      const response = await fetchWithAuth(
        `/api/talent/simulation?messageId=${messageId}&browserPreview=true`,
        { signal }
      );
      if (!response.ok) throw new Error("Browser preview unavailable");
      const preview: { sessionId: string | null; liveUrl: string | null } =
        await response.json();
      return preview.sessionId === sessionId ? preview.liveUrl : null;
    },
    // Discover once; the iframe owns the live stream thereafter.
    refetchInterval: (query) => (query.state.data ? false : 3000),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return <BrowserPreviewFrame liveUrl={data ?? null} />;
}
