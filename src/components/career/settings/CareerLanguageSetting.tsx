import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { GroupedListRow, GroupedListText } from "@/components/ui/grouped-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { CareerSettingRow } from "./CareerSettingRow";

export default function CareerLanguageSetting({
  grouped = false,
}: {
  grouped?: boolean;
}) {
  const t = useCareerT();
  const { fetchWithAuth } = useCareerApi();
  const logCareerEvent = useCareerLogEvent();
  const { locale, setLocale } = useMessages();
  const [languageError, setLanguageError] = useState("");
  const [languagePending, setLanguagePending] = useState<Locale | null>(null);
  const label = t("career.profile.language_selector.menu_label", "언어 설정");
  const options = [
    { value: "ko", label: "한국어" },
    { value: "en", label: "English" },
  ];

  const handleLocaleSelect = async (nextLocale: Locale) => {
    if (languagePending) return;
    if (nextLocale === locale) {
      return;
    }

    const previousLocale = locale;
    setLanguagePending(nextLocale);
    setLanguageError("");
    setLocale(nextLocale);
    logCareerEvent(`click_settings_language_${nextLocale}`);

    try {
      const response = await fetchWithAuth("/api/talent/settings", {
        method: "POST",
        body: JSON.stringify({ preferredLocale: nextLocale }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ||
            t(
              "career.profile.language_selector.save_failed",
              "언어 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
            )
        );
      }
    } catch (error) {
      setLocale(previousLocale);
      setLanguageError(
        error instanceof Error
          ? error.message
          : t(
              "career.profile.language_selector.save_failed",
              "언어 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
            )
      );
    } finally {
      setLanguagePending((current) =>
        current === nextLocale ? null : current
      );
    }
  };

  if (grouped) {
    return (
      <GroupedListRow
        asChild
        className="focus-within:ring-2 focus-within:ring-focus-ring"
      >
        <label>
          <GroupedListText
            title={label}
            description={
              languageError ? (
                <span role="alert" className="text-critical">
                  {languageError}
                </span>
              ) : undefined
            }
          />
          <span
            aria-hidden="true"
            className="flex items-center gap-2 text-neutral-muted"
          >
            {options.find((option) => option.value === locale)?.label}
            <ChevronRight className="size-4 text-neutral-soft" />
          </span>
          <select
            aria-label={label}
            aria-busy={Boolean(languagePending)}
            disabled={Boolean(languagePending)}
            value={locale}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "ko" || value === "en")
                void handleLocaleSelect(value);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </GroupedListRow>
    );
  }

  return (
    <CareerSettingRow
      title={label}
      action={
        <div className="w-full sm:w-44">
          <Select
            value={locale}
            items={options}
            disabled={Boolean(languagePending)}
            onValueChange={(value) => {
              if (value === "ko" || value === "en")
                void handleLocaleSelect(value);
            }}
          >
            <SelectTrigger
              aria-label={label}
              aria-busy={Boolean(languagePending)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="end">
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {languageError ? (
            <p role="alert" className="mt-2 text-sm text-critical">
              {languageError}
            </p>
          ) : null}
        </div>
      }
    />
  );
}
