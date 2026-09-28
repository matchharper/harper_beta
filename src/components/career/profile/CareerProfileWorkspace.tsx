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
import {
  CareerBlockedCompaniesSettingsSection,
  CareerProfileSharingSettingsSection,
} from "../CareerProfileSettingsSection";
import { CareerDocumentDetail } from "@/components/career/documents/CareerDocumentDetail";
import { getCareerDocumentHref } from "@/lib/career/documentLinks";
import CareerCallNoteDetail from "./CareerCallNoteDetail";
import CareerResumeLinksSettingsSection from "../settings/CareerResumeLinksSettingsSection";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import React from "react";
import { useCareerT } from "@/i18n/useCareerT";

type ProfileSectionId = "profile" | "links";

const isProfileSectionId = (
  value: string | null | undefined
): value is ProfileSectionId => value === "profile" || value === "links";

type ProfileSectionItem = {
  id: ProfileSectionId;
  label: string;
};

const getProfileSectionItems = (
  t: ReturnType<typeof useCareerT>
): ProfileSectionItem[] => [
  {
    id: "profile",
    label: t("career.common.career_workspace_screen.0b0v9cr", "프로필"),
  },
  {
    id: "links",
    label: t("career.profile.career_profile_workspace.14bifvm", "이력서/링크"),
  },
];

const CareerProfileWorkspace = ({
  onDetailOpen,
  view = "profile",
}: {
  onDetailOpen?: () => void;
  view?: "profile" | "brief";
}) => {
  const t = useCareerT();
  const router = useRouter();
  const logCareerEvent = useCareerLogEvent();
  const { workspaceDataLoading } = useCareerSidebarContext();
  const {
    loadTalentMemories,
    mutateTalentContexts,
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
  const sectionItems = useMemo(() => getProfileSectionItems(t), [t]);

  const requestedProfileSection =
    typeof router.query.profileSection === "string"
      ? router.query.profileSection
      : null;
  const requestedCallNoteId =
    typeof router.query.callNoteId === "string"
      ? router.query.callNoteId.trim()
      : null;

  const requestedDocumentId =
    typeof router.query.documentId === "string"
      ? router.query.documentId.trim()
      : null;

  useEffect(() => {
    if (view === "profile" && (requestedCallNoteId || requestedDocumentId)) {
      onDetailOpen?.();
    }
  }, [onDetailOpen, requestedCallNoteId, requestedDocumentId, view]);

  useEffect(() => {
    if (!router.isReady || requestedProfileSection !== "brief") return;

    const query = { ...router.query };
    delete query.profileSection;
    delete query.tab;
    const isPreview = router.pathname === "/career/preview";
    if (isPreview) query.tab = "brief";

    void router.replace(
      {
        pathname: isPreview ? router.pathname : "/career/brief",
        query,
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [requestedProfileSection, router]);

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

  const profileSection: ProfileSectionId =
    requestedProfileSection === "connections"
      ? "links"
      : isProfileSectionId(requestedProfileSection)
        ? requestedProfileSection
        : "profile";
  const activeSection = view === "brief" ? "brief" : profileSection;

  const callNoteDocument = useMemo(
    () =>
      talentDocuments.find(
        (document) =>
          document.id === requestedCallNoteId && document.kind === "call_note"
      ) ?? null,
    [requestedCallNoteId, talentDocuments]
  );

  const closeDocumentDetail = useCallback(() => {
    const query = { ...router.query };
    delete query.callNoteId;
    delete query.documentId;
    void router.replace(
      {
        pathname: router.pathname,
        query: { ...query, profileSection: "links" },
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [router]);

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
      delete query.documentId;
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
        onOpenDocument={(document) =>
          void router.push(getCareerDocumentHref(document.id))
        }
      />
    ) : activeSection === "brief" ? (
      <>
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
        <div className="mt-8 md:px-1">
          <CareerBlockedCompaniesSettingsSection />
        </div>
      </>
    ) : (
      <>
        <CareerProfileSharingSettingsSection
          showBlockedCompanies={false}
          showEngagementTypes={false}
          showLastUpdated={false}
        />
        <CareerTalentProfilePanel />
      </>
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

  if (view === "profile" && requestedDocumentId) {
    const document = talentDocuments.find(
      (item) => item.id === requestedDocumentId
    );
    return (
      <CareerDocumentDetail
        key={requestedDocumentId}
        document={{
          id: requestedDocumentId,
          title:
            document?.fileName ??
            t("career.profile.documents.title", "내 문서"),
        }}
        onBack={closeDocumentDetail}
      />
    );
  }

  if (view === "profile" && requestedCallNoteId) {
    return (
      <CareerCallNoteDetail
        documentId={requestedCallNoteId}
        document={callNoteDocument}
        onBack={closeDocumentDetail}
      />
    );
  }

  return (
    <>
      {view === "profile" ? (
        <CareerInPageTabs
          items={sectionItems}
          activeId={profileSection}
          onChange={handleChangeSection}
          mobileFloating
          className="md:my-4"
        />
      ) : null}

      <div
        className={`flex flex-col gap-4${view === "brief" ? " md:my-4" : ""}`}
      >
        <div className="w-full">{activeContent}</div>
      </div>
    </>
  );
};

export default React.memo(CareerProfileWorkspace);
