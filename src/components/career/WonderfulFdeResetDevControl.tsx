// career-i18n-skip-file: Internal developer controls.
import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MuteButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import {
  canResetWonderfulFde,
  WONDERFUL_FDE_TEST_ACCOUNTS,
  type WonderfulFdeResetPreview,
} from "@/lib/career/devWonderfulFdeResetContract";

export default function WonderfulFdeResetDevControl({
  user,
}: {
  user: { id: string; email?: string | null } | null;
}) {
  const { fetchWithAuth } = useCareerApi();
  const client = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const submitting = React.useRef(false);
  const [preview, setPreview] = React.useState<WonderfulFdeResetPreview | null>(
    null
  );
  const [status, setStatus] = React.useState("");
  if (!canResetWonderfulFde(user)) return null;
  const run = async (execute: boolean) => {
    if (submitting.current || (execute && !preview)) return;
    submitting.current = true;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetchWithAuth(
        "/api/talent/dev-reset-wonderful-fde-tests",
        execute
          ? {
              method: "POST",
              body: JSON.stringify({
                confirm: "wonderful-fde-test-reset",
                fingerprint: preview!.fingerprint,
              }),
            }
          : { method: "GET" }
      );
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(result.error || "초기화에 실패했습니다.");
      if (execute) {
        setPreview(null);
        setOpen(false);
        await client.invalidateQueries();
        setStatus(
          "세 계정의 FDE 테스트 기록을 삭제했습니다. 화면을 새로고침한 뒤 ‘Wonderful Korea FDE 초기화 · 다시 추천’으로 시작할 수 있습니다."
        );
      } else {
        setPreview(result.preview);
        setOpen(true);
      }
    } catch (error) {
      setPreview(null);
      setStatus(
        error instanceof Error ? error.message : "초기화에 실패했습니다."
      );
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  };
  return (
    <>
      <MuteButton disabled={busy} onClick={() => void run(false)}>
        {busy
          ? "FDE 테스트 기록 처리 중…"
          : "Wonderful FDE · 테스트 3계정 기록 삭제"}
      </MuteButton>
      {status && (
        <Text as="div" type="caption" role="status">
          {status}
        </Text>
      )}
      <TalentCareerModal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        bodyClassName="px-5 py-3"
        title="Wonderful FDE 테스트 기록 삭제"
        footer={
          <div className="flex justify-end gap-2">
            <MuteButton disabled={busy} onClick={() => setOpen(false)}>
              취소
            </MuteButton>
            <MuteButton disabled={busy} onClick={() => void run(false)}>
              대상 새로고침
            </MuteButton>
            <MuteButton
              variant="dark"
              disabled={busy || !preview}
              onClick={() => void run(true)}
            >
              {busy ? "처리 중…" : "세 계정의 FDE 기록 삭제"}
            </MuteButton>
          </div>
        }
      >
        <div className="space-y-3">
          <ul>
            {WONDERFUL_FDE_TEST_ACCOUNTS.map((a) => (
              <li key={a.id}>{a.email}</li>
            ))}
          </ul>
          <Text as="p" type="caption">
            로그인 계정·프로필·다른 역할 기록은 유지합니다. 다른 지원과 섞인
            답변, 사람이 쓴 Slack 메시지와 이미 수신된 이메일은 남습니다. 삭제한
            기록은 되돌릴 수 없습니다.
          </Text>
          {preview && (
            <>
              <Text as="p" type="caption">
                인터뷰 {preview.meetings}건 · Harper Slack 메시지{" "}
                {preview.slackMessages}건 · 보존할 혼합 대화{" "}
                {preview.retainedSharedReplies}건
              </Text>
              <details>
                <summary>
                  삭제 대상 {preview.counts.reduce((n, c) => n + c.count, 0)}건
                </summary>
                <ul>
                  {preview.counts.map((c) => (
                    <li key={c.table}>
                      {c.table}: {c.count}
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
          {status && (
            <Text as="p" type="caption" role="alert">
              {status}
            </Text>
          )}
        </div>
      </TalentCareerModal>
    </>
  );
}
