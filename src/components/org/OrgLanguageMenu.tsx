import { Globe2 } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgLocale, useOrgT } from "@/i18n/org/OrgLocaleProvider";
import type { OrgLocale } from "@/i18n/org/locale";
import { useToastStore } from "@/store/useToastStore";

export function OrgLanguageMenu() {
  const t = useOrgT();
  const { locale, setLocale } = useOrgLocale();
  const addToast = useToastStore((state) => state.add);
  const selectLocale = (next: OrgLocale) => {
    void setLocale(next).catch(() => {
      addToast({
        message: t(
          "profile.languageSaveFailed",
          "언어 설정을 저장하지 못했어요. 다시 시도해 주세요."
        ),
        variant: "error",
      });
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger variant="sm">
        <Globe2 className="h-4 w-4" />
        {t("profile.language", "언어")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem
          variant="sm"
          selected={locale === "ko"}
          onSelect={() => selectLocale("ko")}
        >
          {t("profile.korean", "한국어")}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="sm"
          selected={locale === "en"}
          onSelect={() => selectLocale("en")}
        >
          {t("profile.english", "English")}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
