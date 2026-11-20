// career-i18n-skip-file: Internal developer persona test report.
import { useQuery } from "@tanstack/react-query";
import RichText from "@/components/ui/rich-text";
import { MuteButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import type { DevPersonaCurrentResponse } from "@/lib/career/devPersonas";
import {
  leaveDevPersona,
  readDevPersonaOrigin,
} from "@/lib/career/devPersonaSession";

/** Shows the saved evaluation when the signed-in account is a persona test run. */
export default function CareerPersonaReport({ userId }: { userId: string }) {
  const { fetchWithAuth } = useCareerApi();
  const query = useQuery({
    queryKey: ["career-dev-persona-current", userId],
    queryFn: async (): Promise<DevPersonaCurrentResponse> => {
      const response = await fetchWithAuth(
        "/api/talent/dev-personas?current=1"
      );
      if (!response.ok) return { current: null };
      return response.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
  const current = query.data?.current;
  if (!current) return null;
  const origin = readDevPersonaOrigin();

  return (
    <section
      data-career-i18n-skip="true"
      className="mt-5 rounded-2xl border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-4 shadow-(--shadow-sm)"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Text as="div" type="eyebrow">
            페르소나 테스트 기록
          </Text>
          <Text as="div" type="title" className="mt-1">
            {current.personaName} · {current.label || "기록"}
          </Text>
        </div>
        {origin ? (
          <MuteButton size="sm" onClick={() => void leaveDevPersona()}>
            원래 계정으로 돌아가기
          </MuteButton>
        ) : null}
      </div>
      <div className="mt-4 min-w-0 overflow-x-auto">
        {current.reportMarkdown ? (
          <RichText variant="career" responsiveTables>
            {current.reportMarkdown}
          </RichText>
        ) : (
          <Text type="subtle">아직 평가를 저장하지 않았어요.</Text>
        )}
      </div>
    </section>
  );
}
