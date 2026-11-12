// career-i18n-skip-file: Internal developer controls.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Typography } from "@/components/ui/typography";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerCheckpointBusy } from "./useCareerCheckpointBusy";

const endpoint = "/api/talent/dev-timed-checkpoint";
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Seoul",
});

type Action = { action: "save" } | { action: "restore"; time: string };

export default function CareerTimedCheckpointDevControls({ userId }: { userId: string }) {
  const { fetchWithAuth } = useCareerApi();
  const queryClient = useQueryClient();
  const busy = useCareerCheckpointBusy();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const queryKey = ["career-timed-checkpoints", userId];
  const snapshots = useQuery({
    queryKey,
    enabled: open,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetchWithAuth(endpoint, { signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "저장한 시점을 읽지 못했습니다.");
      return result.times as string[];
    },
  });
  const action = useMutation({
    mutationFn: async (input: Action) => {
      const response = await fetchWithAuth(endpoint, {
        method: "POST",
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "작업에 실패했습니다.");
      }
      return result.time as string;
    },
    onSuccess: async (time, input) => {
      if (input.action === "restore") {
        queryClient.clear();
        window.location.replace("/career");
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
      setSelected(time);
    },
  });
  const pending = action.isPending || (action.isSuccess && action.variables.action === "restore");
  const times = snapshots.data ?? [];
  const selectedTime = selected && times.includes(selected) ? selected : null;
  const items = times.map((time) => ({
    value: time,
    label: `${timeFormat.format(new Date(time))}.${time.slice(20, 23)} KST`,
  }));

  return (
    <>
      <MuteButton onClick={() => setOpen(true)}>
        <RotateCcw aria-hidden className="size-3.5" />
        Career 상태 시점 복원
      </MuteButton>
      <TalentCareerModal
        open={open}
        onClose={() => {
          if (pending) return;
          setOpen(false);
          setSelected(null);
          action.reset();
        }}
        title="Career 상태 시점 복원"
        description="선택한 시점의 메시지, 추천 공고, 프로필, 설정, 문서 기록으로 덮어씁니다. 실제 발송·제출과 Storage 파일은 복원 범위에서 제외됩니다."
        showCloseButton={!pending}
        closeOnBackdrop={!pending}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <MuteButton disabled={pending || busy} onClick={() => action.mutate({ action: "save" })}>
              현재 상태 저장
            </MuteButton>
            <MuteButton
              variant="warn"
              disabled={pending || busy || !selectedTime || snapshots.isError}
              onClick={() => {
                if (selectedTime) action.mutate({ action: "restore", time: selectedTime });
              }}
            >
              선택 시점으로 복원
            </MuteButton>
          </div>
        }
      >
        <div className="space-y-3">
          <Select value={selectedTime} onValueChange={setSelected} items={items} disabled={pending || !times.length}>
            <SelectTrigger aria-label="복원 시점">
              <SelectValue placeholder={snapshots.isFetching ? "시점을 불러오는 중…" : times.length ? "복원 시점 선택" : "저장된 시점 없음"} />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {items.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pending ? (
            <Typography variant="caption" role="status" className="flex items-center gap-2">
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
              {action.variables.action === "save" ? "저장 중…" : "복원 중…"}
            </Typography>
          ) : null}
          {busy ? <Typography variant="caption">진행 중인 대화·통화·추천 작업을 마친 뒤 사용해 주세요.</Typography> : null}
          {action.error || snapshots.error ? (
            <Typography variant="caption" role="alert" className="text-critical">
              {(action.error ?? snapshots.error)?.message}
            </Typography>
          ) : null}
        </div>
      </TalentCareerModal>
    </>
  );
}
