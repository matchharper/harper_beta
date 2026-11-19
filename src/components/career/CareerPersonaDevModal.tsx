// career-i18n-skip-file: Internal developer persona viewer.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase";
import type { DevPersonaListResponse } from "@/lib/career/devPersonas";
import {
  enterDevPersona,
  leaveDevPersona,
  readDevPersonaOrigin,
} from "@/lib/career/devPersonaSession";

// Works signed out too: the local login page opens this modal.
async function personaFetch(init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch("/api/talent/dev-personas", {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

export default function CareerPersonaDevModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin = readDevPersonaOrigin();
  const query = useQuery({
    queryKey: ["career-dev-personas"],
    queryFn: async (): Promise<DevPersonaListResponse> => {
      const response = await personaFetch();
      if (!response.ok) throw new Error("페르소나 기록을 불러오지 못했어요.");
      return response.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const switchTo = async (runId: string) => {
    setPendingRunId(runId);
    setError(null);
    try {
      const response = await personaFetch({
        method: "POST",
        body: JSON.stringify({ runId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await enterDevPersona(body.tokenHash);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPendingRunId(null);
    }
  };

  return (
    <TalentCareerModal
      open
      onClose={onClose}
      title="페르소나"
      description="기록을 고르면 그 테스트 계정으로 로그인해 기회·대화·프로필을 그대로 봅니다. 대화도 이어서 할 수 있어요."
      closeButtonAriaLabel="닫기"
      panelClassName="max-w-[640px]"
      bodyClassName="px-4 pb-5 sm:px-5"
    >
      <div data-career-i18n-skip="true" className="space-y-5">
        {origin ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg-weak px-3 py-2.5">
            <Text type="subtle">
              원래 계정: {origin.email ?? "알 수 없음"}
            </Text>
            <MuteButton size="sm" onClick={() => void leaveDevPersona()}>
              원래 계정으로 돌아가기
            </MuteButton>
          </div>
        ) : null}
        {query.isPending ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            불러오는 중…
          </div>
        ) : null}
        {query.isError ? (
          <p role="alert" className="py-6 text-center text-sm text-critical">
            페르소나 기록을 불러오지 못했어요.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        ) : null}
        {query.data?.personas.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-muted">
            이 서버가 연결된 DB에는 페르소나 기록이 없어요.
          </p>
        ) : null}
        {query.data?.personas.map((persona) => (
          <section key={persona.key} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Text as="h3" type="title">
                {persona.name}
              </Text>
              {persona.linkedinUrl ? (
                <a
                  href={persona.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[13px] text-neutral-muted hover:text-neutral-primary"
                >
                  LinkedIn
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : null}
            </div>
            <ul className="divide-y divide-neutral-1000-a05 rounded-xl border border-neutral-1000-a05">
              {persona.runs.map((run) => {
                const current = run.id === query.data?.currentRunId;
                return (
                  <li
                    key={run.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[14px] text-neutral-primary">
                        {run.label || "기록"}
                      </div>
                      <div className="text-[12px] text-neutral-muted tabular-nums">
                        {dateFormatter.format(new Date(run.createdAt))}
                        {run.hasReport ? " · 평가 있음" : ""}
                      </div>
                    </div>
                    {current ? (
                      <Text type="subtle" className="shrink-0">
                        보는 중
                      </Text>
                    ) : (
                      <MuteButton
                        size="sm"
                        className="shrink-0"
                        disabled={pendingRunId !== null}
                        onClick={() => void switchTo(run.id)}
                      >
                        {pendingRunId === run.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : null}
                        이 기록 보기
                      </MuteButton>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </TalentCareerModal>
  );
}
