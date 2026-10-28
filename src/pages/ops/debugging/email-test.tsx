import { useEffect, useState } from "react";
import {
  DebuggingPageShell,
  useCanFetchInternal,
} from "@/components/ops/debugging/shared";
import { EmailTestPanel } from "@/components/ops/debugging/EmailTestPanel";
import { opsTheme } from "@/components/ops/theme";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { MuteButton } from "@/components/ui/button";
import { useOpsCareerTalents } from "@/hooks/ops/useOpsCareer";
import type { CareerTalentSummary } from "@/lib/ops/careerServer";

const accountLabel = (account: CareerTalentSummary) =>
  [account.name, account.email].filter(Boolean).join(" · ") || account.userId;

export default function OpsEmailTestPage() {
  const canFetch = useCanFetchInternal();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CareerTalentSummary | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const accounts = useOpsCareerTalents(20, canFetch, search);
  const options = accounts.data?.pages.flatMap((page) => page.talents) ?? [];

  return (
    <DebuggingPageShell
      tab="emailTest"
      showContextLabel={false}
      showDescription={false}
      filters={
        <div className="mt-3 max-w-xl space-y-2">
          <label htmlFor="email-test-account" className={opsTheme.label}>
            계정
          </label>
          <Combobox<CareerTalentSummary>
            items={options}
            value={selected}
            filter={null}
            itemToStringLabel={accountLabel}
            itemToStringValue={(item) => item.userId}
            isItemEqualToValue={(a, b) => a.userId === b.userId}
            onValueChange={setSelected}
            onInputValueChange={(value, details) => {
              if (
                details.reason === "input-change" ||
                details.reason === "input-clear"
              )
                setQuery(value);
            }}
            disabled={!canFetch}
          >
            <ComboboxInput
              id="email-test-account"
              placeholder="이름 · 이메일 검색"
              showClear={Boolean(selected)}
              disabled={!canFetch}
            />
            <ComboboxContent>
              <ComboboxEmpty>
                {accounts.isFetching ? "검색 중" : "검색 결과 없음"}
              </ComboboxEmpty>
              <ComboboxList>
                {(item: CareerTalentSummary) => (
                  <ComboboxItem key={item.userId} value={item}>
                    {accountLabel(item)}
                  </ComboboxItem>
                )}
              </ComboboxList>
              {accounts.hasNextPage ? (
                <MuteButton
                  onClick={() => void accounts.fetchNextPage()}
                  disabled={accounts.isFetchingNextPage}
                >
                  더 보기
                </MuteButton>
              ) : null}
            </ComboboxContent>
          </Combobox>
          {accounts.error ? (
            <div role="alert" className={opsTheme.errorNotice}>
              {accounts.error.message}
            </div>
          ) : null}
        </div>
      }
    >
      {selected && canFetch ? (
        <div className={`${opsTheme.panel} p-4`}>
          <EmailTestPanel key={selected.userId} userId={selected.userId} />
        </div>
      ) : null}
    </DebuggingPageShell>
  );
}
