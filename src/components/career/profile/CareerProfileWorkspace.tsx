import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { Loader2 } from "lucide-react";
import CareerInPageTabs from "../CareerInPageTabs";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "../CareerSidebarContext";
import CareerTalentContextSection from "./CareerTalentContextSection";
import CareerTalentProfilePanel from "./CareerTalentProfilePanel";
import CareerCallNoteDetail from "./CareerCallNoteDetail";
import CareerResumeLinksSettingsSection from "../settings/CareerResumeLinksSettingsSection";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import React from "react";
import { useCareerT } from "@/i18n/useCareerT";

type ProfileSectionId = "profile" | "brief" | "links";

const isProfileSectionId = (
  value: string | null | undefined
): value is ProfileSectionId =>
  value === "profile" || value === "brief" || value === "links";

type ProfileSectionItem = {
  id: ProfileSectionId;
  label: string;
  title: string;
  description: string[];
};

const getProfileSectionItems = (
  t: ReturnType<typeof useCareerT>
): ProfileSectionItem[] => [
    {
      id: "profile",
      label: t("career.common.career_workspace_screen.0b0v9cr", "프로필"),
      title: t("career.common.career_workspace_screen.0b0v9cr", "프로필"),
      description: [
        t(
          "career.profile.career_profile_workspace.16e35ps",
          "입력하신 정보와 대화내용을 바탕으로 Harper가 구성한 프로필입니다."
        ),
        t(
          "career.profile.career_profile_workspace.116ofw4",
          "이대로 회사 측에 전달되지는 않지만, 변경하고 싶으신 사항이 있는지 확인할 수 있습니다."
        ),
      ],
    },
    {
      id: "brief",
      label: t(
        "career.profile.career_profile_workspace.search_brief_tab",
        "선호 기준"
      ),
      title: t(
        "career.profile.career_profile_workspace.search_brief_tab",
        "선호 기준"
      ),
      description: [
        t(
          "career.profile.context.brief_description",
          "Harper가 기회를 찾고 판단할 때 적용하는 현재 기준이에요. 회사에 직접적으로 공개되지않고 선호하시는 기회를 찾기 위해 사용되며, 사용해서 회원님을 더 잘 소개할 수 있을 때 일부 언급될 수 있습니다."
        ),
      ],
    },
    {
      id: "links",
      label: t("career.profile.career_profile_workspace.14bifvm", "이력서/링크"),
      title: t("career.profile.career_profile_workspace.14bifvm", "이력서/링크"),
      description: [
        t(
          "career.profile.career_profile_workspace.11os0vs",
          "이력서와 나와 관련된 링크를 확인하고 수정할 수 있습니다."
        ),
      ],
    },
  ];

const CareerProfileWorkspace = () => {
  const t = useCareerT();
  const router = useRouter();
  const logCareerEvent = useCareerLogEvent();
  const { workspaceDataLoading } = useCareerSidebarContext();
  const {
    loadTalentMemories,
    mutateTalentContexts,
    savedResumeFileName,
    savedResumeStoragePath,
    talentBrief = [],
    talentDocuments,
    talentContextsSaveError,
    talentContextsSaveInfo,
    talentContextsSavePending,
    talentMemories = [],
    talentMemoriesHasMore,
    talentMemoriesLoaded,
    talentMemoriesLoadPending,
  } = useCareerProfileContext();
  const hasSavedResume = Boolean(savedResumeFileName || savedResumeStoragePath);

  const sectionItems = useMemo(
    () =>
      getProfileSectionItems(t).map((item) =>
        item.id === "links"
          ? {
              ...item,
              attention: !hasSavedResume,
              attentionLabel: t(
                "career.profile.career_profile_workspace.0pv1jmq",
                "저장된 이력서가 없습니다"
              ),
            }
          : item
      ),
    [hasSavedResume, t]
  );

  const requestedProfileSection =
    typeof router.query.profileSection === "string"
      ? router.query.profileSection
      : null;
  const requestedCallNoteId =
    typeof router.query.callNoteId === "string"
      ? router.query.callNoteId.trim()
      : null;

  useEffect(() => {
    if (!router.isReady || requestedProfileSection !== "connections") return;

    void router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, profileSection: "links" },
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [requestedProfileSection, router]);

  const activeSection: ProfileSectionId =
    requestedProfileSection === "connections"
      ? "links"
      : isProfileSectionId(requestedProfileSection)
        ? requestedProfileSection
        : "profile";

  const callNoteDocument = useMemo(
    () =>
      talentDocuments.find(
        (document) =>
          document.id === requestedCallNoteId && document.kind === "call_note"
      ) ?? null,
    [requestedCallNoteId, talentDocuments]
  );

  const closeCallNote = useCallback(() => {
    const query = { ...router.query };
    delete query.callNoteId;
    void router.replace(
      {
        pathname: router.pathname,
        query: { ...query, profileSection: "links" },
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [router]);

  useEffect(() => {
    if (
      !router.isReady ||
      workspaceDataLoading ||
      !requestedCallNoteId ||
      callNoteDocument
    ) {
      return;
    }
    closeCallNote();
  }, [
    callNoteDocument,
    closeCallNote,
    requestedCallNoteId,
    router.isReady,
    workspaceDataLoading,
  ]);

  const openCallNote = useCallback(
    (documentId: string) => {
      void router.push(
        {
          pathname: router.pathname,
          query: {
            ...router.query,
            callNoteId: documentId,
            profileSection: "links",
          },
        },
        undefined,
        { shallow: true, scroll: false }
      );
    },
    [router]
  );

  const handleChangeSection = useCallback(
    (next: ProfileSectionId) => {
      logCareerEvent(`click_profile_section_${next}`);
      const query = { ...router.query };
      delete query.callNoteId;
      void router.replace(
        {
          pathname: router.pathname,
          query: { ...query, profileSection: next },
        },
        undefined,
        { shallow: true }
      );
    },
    [logCareerEvent, router]
  );

  const activeContent =
    activeSection === "links" ? (
      <CareerResumeLinksSettingsSection
        onOpenCallNote={(document) => openCallNote(document.id)}
      />
    ) : activeSection === "brief" ? (
      <CareerTalentContextSection
        brief={talentBrief}
        error={talentContextsSaveError}
        info={talentContextsSaveInfo}
        loadMemories={loadTalentMemories}
        memoryHasMore={talentMemoriesHasMore}
        memoryLoaded={talentMemoriesLoaded}
        memoryLoadPending={talentMemoriesLoadPending}
        memories={talentMemories}
        mutate={mutateTalentContexts}
        pending={talentContextsSavePending}
      />
    ) : (
      <CareerTalentProfilePanel />
    );

  if (workspaceDataLoading) {
    return (
      <section aria-busy="true" aria-live="polite" className="px-5 py-6">
        <div className="flex items-center gap-2 text-[15px] leading-6 text-neutral-muted">
          <Loader2 className="h-4 w-4 animate-spin text-neutral-primary" />
          {t(
            "career.common.career_history_panel.0s3czqf",
            "저장된 정보를 불러오는 중입니다..."
          )}
        </div>
      </section>
    );
  }

  if (callNoteDocument) {
    return (
      <CareerCallNoteDetail
        document={callNoteDocument}
        onBack={closeCallNote}
      />
    );
  }

  return (
    <>
      <CareerInPageTabs
        items={sectionItems}
        activeId={activeSection}
        onChange={handleChangeSection}
        mobileFloating
        className="md:my-4"
      />

      <div className="flex flex-col gap-4">
        <div className="w-full">{activeContent}</div>
      </div>
    </>
  );
};

export default React.memo(CareerProfileWorkspace);
