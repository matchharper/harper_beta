import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";

export type OrgListColumnRequest = { label: string; message: string };

/**
 * Asks Harper, in the Role chat, to add a comparison column to the inbox
 * list. Harper reads the candidates' profiles and fills the cells. Shown at
 * the bottom of the column settings menu.
 */
export function OrgListColumnAddForm({
  busy,
  onRequest,
}: {
  /** Harper is answering in this Role's chat; one request at a time. */
  busy: boolean;
  onRequest: (request: OrgListColumnRequest) => void;
}) {
  const { c } = useOrgLocale();
  const [text, setText] = useState("");
  const suggestions = [
    {
      label: c("대학교", "University"),
      message: c(
        "후보자들의 대학교를 비교할 수 있는 열을 리스트에 추가해 줘.",
        "Add a column to the list that compares the candidates' universities."
      ),
    },
    {
      label: c("총 경력 연차", "Years of experience"),
      message: c(
        "후보자별 총 경력 연차를 보여주는 열을 리스트에 추가해 줘.",
        "Add a column to the list with each candidate's total years of experience."
      ),
    },
    {
      label: c("현재 회사 규모", "Current company size"),
      message: c(
        "후보자의 현재 회사 규모를 비교하는 열을 리스트에 추가해 줘.",
        "Add a column to the list comparing the size of each candidate's current company."
      ),
    },
    {
      label: c("최근 이직 시점", "Last job change"),
      message: c(
        "후보자별 마지막 이직 시점을 보여주는 열을 리스트에 추가해 줘.",
        "Add a column to the list showing when each candidate last changed jobs."
      ),
    },
  ];
  const request = (next: OrgListColumnRequest) => {
    onRequest(next);
    setText("");
  };
  return (
    <div>
      <div className="flex items-center gap-1.5 pb-1.5 text-[12px] text-neutral-muted">
        {busy ? (
          <>
            <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
            {c(
              "하퍼가 답하는 중이에요. 끝나면 열을 더 추가할 수 있어요.",
              "Harper is replying. You can add another column when it's done."
            )}
          </>
        ) : (
          c(
            "열 추가 · 하퍼가 프로필을 읽고 채워요",
            "Add a column · Harper fills it from profiles"
          )
        )}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          const label = text.trim();
          if (!label || busy) return;
          request({
            label,
            message: c(
              "인박스 리스트에 이 항목을 비교하는 열을 추가해 줘: {p0}",
              "Add a column to the inbox list that compares: {p0}",
              { p0: label }
            ),
          });
        }}
      >
        <Input
          aria-label={c("비교할 항목", "What to compare")}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          placeholder={c("비교할 항목", "What to compare")}
          value={text}
        />
        <MuteButton
          disabled={busy || !text.trim()}
          type="submit"
          variant="dark"
        >
          {c("추가", "Add")}
        </MuteButton>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <MuteButton
            disabled={busy}
            key={suggestion.label}
            onClick={() => request(suggestion)}
            size="sm"
            type="button"
          >
            {suggestion.label}
          </MuteButton>
        ))}
      </div>
    </div>
  );
}
