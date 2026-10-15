import { dayKey } from "@/lib/externalRecommendationsV2/calendar";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMessages } from "@/i18n/useMessage";
import { getCareerBrowserTimeZone } from "@/lib/career/requestTimeZone";
import { useCareerApi } from "./useCareerApi";

export type DailyExternalSnapshot = {
  day: string;
  timeZone: string;
  running: boolean;
  roles: Array<{
    roleId: string;
    companyName: string;
    companyLogoUrl: string | null;
    roleTitle: string;
  }>;
};
const queryKey = (
  userId: string | undefined,
  locale: string,
  timeZone: string,
  day: string
) => ["career-daily-external", userId, locale, timeZone, day] as const;
function useDailyRequest() {
  const { locale } = useMessages();
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const timeZone = getCareerBrowserTimeZone() ?? "Asia/Seoul";
  const day = dayKey(timeZone, clock);
  const url = `/api/talent/external-recommendations?${new URLSearchParams({ locale, timeZone })}`;
  return { locale, timeZone, day, url };
}
export function useDailyExternalRecommendations(
  userId?: string,
  enabled = true
) {
  const { fetchWithAuth } = useCareerApi();
  const { locale, timeZone, day, url } = useDailyRequest();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKey(userId, locale, timeZone, day),
    enabled: enabled && Boolean(userId),
    queryFn: async (): Promise<DailyExternalSnapshot> => {
      const response = await fetchWithAuth(url);
      if (!response.ok) throw new Error("Could not load daily recommendations");
      return response.json();
    },
    staleTime: 10000,
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const signature = query.data?.roles.map((r) => r.roleId).join(",") ?? "";
  useEffect(() => {
    if (signature)
      void client.invalidateQueries({
        queryKey: ["career-history-opportunities", userId],
      });
  }, [signature, userId, client]);
  // A cached yesterday response is never rendered during midnight rollover.
  return query.data && query.data.day === dayKey(query.data.timeZone)
    ? query.data
    : undefined;
}
export function useStartDailyExternalRecommendations(
  userId?: string,
  enabled = true
) {
  const { fetchWithAuth } = useCareerApi();
  const { locale, timeZone, day, url } = useDailyRequest();
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    void fetchWithAuth(url, { method: "POST" })
      .then(async (response) => {
        if (response.ok && !cancelled)
          client.setQueryData(
            queryKey(userId, locale, timeZone, day),
            await response.json()
          );
      })
      .catch(() => {
        /* Background recommendations never interrupt the chat. Server dispatch handles durable retries. */
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, locale, timeZone, day, url, fetchWithAuth, client]);
}
