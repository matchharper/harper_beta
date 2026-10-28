import * as Popover from "@radix-ui/react-popover";
import { Columns3 } from "lucide-react";
import { useState } from "react";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { cn } from "@/lib/utils";
import {
  OrgListColumnAddForm,
  type OrgListColumnRequest,
} from "./OrgListColumnAdder";

export type OrgListColumnMenuItem = {
  id: string;
  label: string;
  /** A column Harper added: it can be deleted for the whole team. */
  removable: boolean;
};

/**
 * Column settings for the list: which columns show, and asking Harper for a
 * new one at the bottom. Hiding is for this viewer only; deleting a column
 * Harper added removes it for everyone on the Role, after a second click to
 * confirm.
 */
export function OrgListColumnMenu({
  addColumn,
  columns,
  hidden,
  onDelete,
  onHiddenChange,
  removing,
}: {
  /** Left out for people who can't change the Role's candidates. */
  addColumn?: {
    busy: boolean;
    onRequest: (request: OrgListColumnRequest) => void;
  };
  columns: OrgListColumnMenuItem[];
  hidden: ReadonlySet<string>;
  onDelete?: (id: string) => void;
  onHiddenChange: (next: Set<string>) => void;
  removing: boolean;
}) {
  const { c } = useOrgLocale();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const shown = columns.filter((column) => !hidden.has(column.id)).length;
  const toggle = (id: string, show: boolean) => {
    const next = new Set(hidden);
    if (show) next.delete(id);
    else next.add(id);
    onHiddenChange(next);
  };
  return (
    <Popover.Root
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirming(null);
      }}
      open={open}
    >
      <Popover.Trigger asChild>
        <MuteButton size="sm" type="button">
          <Columns3 aria-hidden className="size-3.5" />
          {c("열 설정", "Columns")}
          {hidden.size ? (
            <span className="text-neutral-muted">
              {c("{p0}/{p1}", "{p0}/{p1}", {
                p0: shown,
                p1: columns.length,
              })}
            </span>
          ) : null}
        </MuteButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          aria-label={c("열 설정", "Column settings")}
          className="z-[100] w-80 rounded-lg border border-neutral-1000-a10 bg-bg-floating py-2 shadow-lg"
          sideOffset={6}
        >
          <div className="flex items-center justify-between px-3 pb-1.5 text-[12px] text-neutral-muted">
            <span>{c("보이는 열", "Visible columns")}</span>
            {hidden.size ? (
              <button
                className="underline-offset-2 hover:underline"
                onClick={() => onHiddenChange(new Set())}
                type="button"
              >
                {c("모두 보이기", "Show all")}
              </button>
            ) : null}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {columns.map((column) => {
              const visible = !hidden.has(column.id);
              const asking = confirming === column.id;
              return (
                <li
                  className="flex min-h-9 items-center gap-2 px-3 text-[13px] text-neutral-primary hover:bg-bg-weak"
                  key={column.id}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5">
                    <Checkbox
                      checked={visible}
                      onChange={(event) =>
                        toggle(column.id, event.target.checked)
                      }
                    />
                    <span className="truncate">{column.label}</span>
                  </label>
                  {column.removable && onDelete ? (
                    <button
                      className={cn(
                        "shrink-0 rounded-sm px-1.5 py-0.5 text-[12px]",
                        asking
                          ? "bg-critical text-white"
                          : "text-neutral-muted hover:text-neutral-primary"
                      )}
                      disabled={removing}
                      onClick={() => {
                        if (!asking) return setConfirming(column.id);
                        setConfirming(null);
                        onDelete(column.id);
                      }}
                      type="button"
                    >
                      {asking
                        ? c("팀 전체에서 삭제", "Delete for the team")
                        : c("삭제", "Delete")}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="px-3 pt-1.5 text-[11px] leading-4 text-neutral-soft">
            {c(
              "숨기기는 나에게만 적용돼요. 하퍼가 추가한 열은 삭제하면 팀 전체에서 사라져요.",
              "Hiding applies only to you. Deleting a column Harper added removes it for the whole team."
            )}
          </p>
          {addColumn ? (
            <div className="mt-2 border-t border-neutral-1000-a05 px-3 pt-2.5">
              <OrgListColumnAddForm
                busy={addColumn.busy}
                onRequest={(request) => {
                  addColumn.onRequest(request);
                  setOpen(false);
                }}
              />
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
