"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { useState } from "react";

type CompanyWorkspaceComboboxProps = {
  companyNames: string[];
  disabled?: boolean;
  isLoading?: boolean;
  onValueChange: (value: string) => void;
  value: string;
};

export default function CompanyWorkspaceCombobox({
  companyNames,
  disabled = false,
  isLoading = false,
  onValueChange,
  value,
}: CompanyWorkspaceComboboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <div onMouseEnter={() => !disabled && setOpen(true)}>
      <Combobox
        items={companyNames}
        open={open}
        onOpenChange={setOpen}
        value={value || null}
        onValueChange={(nextValue) => onValueChange(nextValue ?? "")}
        autoHighlight
      >
        <ComboboxInput
          aria-label="Source company name"
          disabled={disabled}
          placeholder={isLoading ? "회사 목록 불러오는 중..." : "회사 검색"}
          showClear={Boolean(value)}
          onMouseEnter={(event) => event.currentTarget.focus()}
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {isLoading ? "불러오는 중..." : "일치하는 회사가 없습니다."}
          </ComboboxEmpty>
          <ComboboxList>
            {(companyName) => (
              <ComboboxItem key={companyName} value={companyName}>
                {companyName}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
