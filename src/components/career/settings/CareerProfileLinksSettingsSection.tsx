import * as Popover from "@radix-ui/react-popover";
import { Cable, Globe2, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import Image from "next/image";
import { useMemo, useState, type FormEvent } from "react";
import { useCareerProfileContext } from "@/components/career/CareerSidebarContext";
import { getCareerLinkLabels } from "@/components/career/constants";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/panel";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";
import CareerGmailSettingsRow from "./CareerGmailSettingsRow";
import CareerProfileSourceCard from "./CareerProfileSourceCard";

const CAREER_LINK_ITEMS = [
  {
    iconSrc: "/images/logos/linkedin.svg",
    placeholder: "https://linkedin.com/in/username",
  },
  {
    iconSrc: "/images/logos/github.svg",
    placeholder: "https://github.com/username",
  },
  {
    iconSrc: "/images/logos/scholar.png",
    placeholder: "https://scholar.google.com/citations?user=",
  },
  { iconSrc: null, placeholder: "https://yourname.com" },
  {
    iconSrc: "/images/logos/xcom.png",
    placeholder: "https://x.com/username",
  },
] as const;

const LINKEDIN_LINK_INDEX = 0;

type LinkEditorAnchor = number | "add";

type LinkEditorState = {
  anchor: LinkEditorAnchor;
  index: number;
} | null;

const LinkItemIcon = ({ index }: { index: number }) => {
  const item = CAREER_LINK_ITEMS[index];
  if (!item?.iconSrc) {
    return <Globe2 className="h-5 w-5" aria-hidden="true" />;
  }
  return (
    <Image
      src={item.iconSrc}
      alt=""
      width={22}
      height={22}
      className="h-[22px] w-[22px] object-contain"
    />
  );
};

const getLinkHost = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
};

type CareerProfileLinksSettingsSectionProps = {
  hasUnsavedChanges: boolean;
  onLinkedinRefresh: () => void;
  onSave: () => Promise<boolean>;
};

const CareerProfileLinksSettingsSection = ({
  hasUnsavedChanges,
  onLinkedinRefresh,
  onSave,
}: CareerProfileLinksSettingsSectionProps) => {
  const t = useCareerT();
  const careerLinkLabels = useMemo(() => getCareerLinkLabels(t), [t]);
  const logCareerEvent = useCareerLogEvent();
  const [editor, setEditor] = useState<LinkEditorState>(null);
  const {
    profileLinks,
    profileSavePending,
    onProfileLinkChange,
    onAddProfileLink,
    onRemoveProfileLink,
  } = useCareerProfileContext();
  const editingIndex = editor?.index ?? null;
  const editingValue =
    editingIndex === null ? "" : (profileLinks[editingIndex] ?? "");
  const editingLabel =
    editingIndex === null
      ? ""
      : (careerLinkLabels[editingIndex] ??
        t("career.chat.career_timeline_section.0ong27a", "추가 링크"));

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasUnsavedChanges) {
      setEditor(null);
      return;
    }
    if (await onSave()) setEditor(null);
  };

  const handlePopoverOpenChange = (anchor: LinkEditorAnchor, open: boolean) => {
    if (open) return;
    setEditor((current) => (current?.anchor === anchor ? null : current));
  };

  const discardAddedLinkDraft = () => {
    if (editor?.anchor !== "add") return;
    onRemoveProfileLink(editor.index);
  };

  const editorContent =
    editingIndex === null ? null : (
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={{
            top: -10000,
            right: 16,
            bottom: -10000,
            left: 16,
          }}
          onEscapeKeyDown={discardAddedLinkDraft}
          onInteractOutside={discardAddedLinkDraft}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="z-10050 w-[min(360px,calc(100vw-32px))] rounded-[10px] border border-neutral-1000-a05 bg-bg-floating p-3 text-neutral-primary shadow-[0_18px_40px_rgba(31,28,26,0.14)] outline-none"
        >
          <form onSubmit={(event) => void handleSave(event)}>
            <label
              htmlFor={`career-profile-link-${editingIndex}`}
              className="text-[12px] font-medium text-neutral-primary"
            >
              {editingLabel}
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                id={`career-profile-link-${editingIndex}`}
                autoFocus
                value={editingValue}
                disabled={profileSavePending}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) =>
                  onProfileLinkChange(
                    editingIndex,
                    event.target.value.replace(/[\r\n]+/g, "")
                  )
                }
                placeholder={
                  CAREER_LINK_ITEMS[editingIndex]?.placeholder ?? "https://"
                }
                className="h-9 min-w-0 flex-1 text-sm"
              />
              {editingIndex === LINKEDIN_LINK_INDEX && editingValue.trim() ? (
                <MuteButton
                  type="button"
                  aria-label={t(
                    "career.profile.resume_links.linkedin_refresh_label",
                    "링크드인 정보 새로고침"
                  )}
                  onClick={onLinkedinRefresh}
                  disabled={profileSavePending}
                >
                  <RefreshCw className="h-4 w-4" />
                </MuteButton>
              ) : null}
              {editingIndex >= CAREER_LINK_ITEMS.length ? (
                <MuteButton
                  type="button"
                  aria-label={t(
                    "career.settings.career_resume_links_settings_section.114mcb5",
                    "링크 삭제"
                  )}
                  onClick={() => {
                    logCareerEvent("click_resume_links_remove_link");
                    onRemoveProfileLink(editingIndex);
                    setEditor(null);
                  }}
                  disabled={profileSavePending}
                >
                  <Trash2 className="h-4 w-4" />
                </MuteButton>
              ) : null}
              <MuteButton
                type="submit"
                variant="dark"
                size="sm"
                disabled={profileSavePending || !hasUnsavedChanges}
              >
                {profileSavePending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t("career.profile.context.save", "저장")}
              </MuteButton>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    );

  return (
    <section>
      <FieldLabel
        icon={<Cable className="h-4 w-4" />}
        label={t("career.common.career.1ominm4", "내 정보")}
      />
      <div className="mt-3 flex flex-wrap gap-3">
        {profileLinks.map((link, index) => {
          if (editor?.anchor === "add" && editor.index === index) return null;

          const label =
            careerLinkLabels[index] ??
            t("career.chat.career_timeline_section.0ong27a", "추가 링크");
          const hasLink = Boolean(link.trim());
          const open = editor?.anchor === index;
          return (
            <Popover.Root
              key={`settings-profile-link-${index}`}
              open={open}
              onOpenChange={(nextOpen) =>
                handlePopoverOpenChange(index, nextOpen)
              }
            >
              <Popover.Anchor asChild>
                <div className="w-fit">
                  <CareerProfileSourceCard
                    icon={<LinkItemIcon index={index} />}
                    title={label}
                    meta={
                      hasLink
                        ? getLinkHost(link)
                        : t("career.profile.sources.link_empty", "링크 추가")
                    }
                    muted={!hasLink}
                    onActivate={() => setEditor({ anchor: index, index })}
                    ariaLabel={t(
                      "career.profile.sources.edit_link",
                      "{label} 링크 편집",
                      { values: { label } }
                    )}
                  />
                </div>
              </Popover.Anchor>
              {open ? editorContent : null}
            </Popover.Root>
          );
        })}
        <CareerGmailSettingsRow />
        <Popover.Root
          open={editor?.anchor === "add"}
          onOpenChange={(open) => handlePopoverOpenChange("add", open)}
        >
          <Popover.Anchor asChild>
            <div className="w-fit">
              <CareerProfileSourceCard
                icon={<Plus className="h-5 w-5" aria-hidden="true" />}
                title={t(
                  "career.chat.career_timeline_section.1gvzqes",
                  "링크 추가"
                )}
                meta={t("career.profile.sources.custom_link", "직접 입력")}
                className="border-dashed shadow-none"
                onActivate={() => {
                  if (editor?.anchor === "add") return;
                  logCareerEvent("click_resume_links_add_link");
                  const index = profileLinks.length;
                  onAddProfileLink();
                  setEditor({ anchor: "add", index });
                }}
              />
            </div>
          </Popover.Anchor>
          {editor?.anchor === "add" ? editorContent : null}
        </Popover.Root>
      </div>

      {!editor && hasUnsavedChanges ? (
        <div className="mt-3">
          <MuteButton
            type="button"
            variant="dark"
            disabled={profileSavePending}
            onClick={() => void onSave()}
          >
            {profileSavePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {t("career.profile.context.save", "저장")}
          </MuteButton>
        </div>
      ) : null}
    </section>
  );
};

export default CareerProfileLinksSettingsSection;
