import { Globe2 } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgLocale } from "@/i18n/org/locale";
import { useToastStore } from "@/store/useToastStore";

export function OrgLanguageMenu() {
  const { locale, setLocale, c } = useOrgLocale();
  const addToast = useToastStore((state) => state.add);
  const selectLocale = (next: OrgLocale) => {
    void setLocale(next).catch(() => {
      addToast({
        message: c(
          "언어 설정을 저장하지 못했어요. 다시 시도해 주세요.",
          "Couldn't save language. Try again."
        ),
        variant: "error",
      });
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger variant="sm">
        <Globe2 className="h-4 w-4" />
        {c("언어", "Language")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem
          variant="sm"
          selected={locale === "ko"}
          onSelect={() => selectLocale("ko")}
        >
          {c("한국어", "Korean")}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="sm"
          selected={locale === "en"}
          onSelect={() => selectLocale("en")}
        >
          {c("English", "English")}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
