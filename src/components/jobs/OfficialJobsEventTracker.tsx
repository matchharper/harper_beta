"use client";

import {
  postOfficialJobEvent,
  type OfficialJobEventType,
} from "@/lib/officialJobEvents";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect, useMemo, useRef } from "react";

type OfficialJobsEventTrackerProps = {
  eventType: OfficialJobEventType;
  jobSlug?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export default function OfficialJobsEventTracker({
  eventType,
  jobSlug,
  metadata,
}: OfficialJobsEventTrackerProps) {
  const authLoading = useAuthStore((state) => state.loading);
  const loggedKeysRef = useRef(new Set<string>());
  const metadataKey = useMemo(() => JSON.stringify(metadata ?? {}), [metadata]);

  useEffect(() => {
    if (authLoading) return;

    const eventKey = `${eventType}:${jobSlug ?? ""}:${metadataKey}`;
    if (loggedKeysRef.current.has(eventKey)) return;
    loggedKeysRef.current.add(eventKey);

    void postOfficialJobEvent({
      eventType,
      jobSlug,
      metadata: JSON.parse(
        metadataKey
      ) as OfficialJobsEventTrackerProps["metadata"],
    });
  }, [authLoading, eventType, jobSlug, metadataKey]);

  return null;
}
