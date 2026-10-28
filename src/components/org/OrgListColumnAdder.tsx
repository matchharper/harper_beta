import * as Popover from "@radix-ui/react-popover";
import { Plus } from "lucide-react";
import { useState } from "react";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";

/**
 * Asks Harper, in the Role chat, to add a comparison column to the inbox
 * list. Harper reads the candidates' profiles and fills the cells.
 */
export function OrgListColumnAdder({
  busy,
  onRequest,
}: {
  /** Harper is answering in this Role's chat; one request at a time. */
  busy: boolean;
  onRequest: (request: { label: string; message: string }) => void;
}) {
  const { c } = useOrgLocale();
  const [open, setOpen] = useState(false);
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
  const request = (next: { label: string; message: string }) => {
    onRequest(next);
    setText("");
    setOpen(false);
  };
  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>
        <MuteButton disabled={busy} size="sm" type="button">
          <Plus className="size-3.5" />
          {c("열 추가", "Add column")}
        </MuteButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          aria-label={c("비교 열 추가", "Add a comparison column")}
          className="z-[100] w-80 rounded-lg border border-neutral-1000-a10 bg-bg-floating p-3 shadow-lg"
          sideOffset={6}
        >
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
              autoFocus
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
          <div className="mt-3 flex flex-wrap gap-1.5">
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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
