import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { Loader2 } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
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
import React from "react";
import { useCareerT } from "@/i18n/useCareerT";

const CareerProfileWorkspace = ({
  onDetailOpen,
  view = "profile",
}: {
  onDetailOpen?: () => void;
  view?: "profile" | "brief" | "documents";
}) => {
  const t = useCareerT();
  const router = useRouter();
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
    if (view === "documents" && (requestedCallNoteId || requestedDocumentId)) {
      onDetailOpen?.();
    }
  }, [onDetailOpen, requestedCallNoteId, requestedDocumentId, view]);

  useEffect(() => {
    if (!router.isReady) return;
    const legacyView =
      requestedProfileSection === "brief"
        ? "brief"
        : requestedProfileSection === "links" ||
            requestedProfileSection === "connections" ||
            (view === "documents" &&
              router.asPath.split("?")[0] === "/career/profile")
          ? "documents"
          : null;
    if (!legacyView) return;

    const query = { ...router.query };
    delete query.profileSection;
    delete query.tab;
    const isPreview = router.pathname === "/career/preview";
    if (isPreview) query.tab = legacyView;

    void router.replace(
      {
        pathname: isPreview ? router.pathname : `/career/${legacyView}`,
        query,
      },
      undefined,
      { shallow: isPreview, scroll: false }
    );
  }, [requestedProfileSection, router, view]);

  const activeSection = view;
  const showLocalMemories =
    process.env.NODE_ENV === "development" && activeSection === "brief";

  useEffect(() => {
    if (
      showLocalMemories &&
      !workspaceDataLoading &&
      !talentMemoriesLoaded &&
      !talentMemoriesLoadPending &&
      !talentContextsSaveError
    ) {
      void loadTalentMemories?.();
    }
  }, [
    loadTalentMemories,
    showLocalMemories,
    talentContextsSaveError,
    talentMemoriesLoaded,
    talentMemoriesLoadPending,
    workspaceDataLoading,
  ]);

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
        query,
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
          },
        },
        undefined,
        { shallow: true, scroll: false }
      );
    },
    [router]
  );

  const activeContent =
    activeSection === "documents" ? (
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
        {showLocalMemories ? (
          <section
            aria-busy={talentMemoriesLoadPending}
            className="mt-8 space-y-3 rounded-[18px] border border-neutral-1000-a05 bg-bg-default p-4 md:p-5"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, transparent 0px, transparent 7px, var(--color-neutral-1000-a05) 7px, var(--color-neutral-1000-a05) 8px)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[14px] font-medium text-neutral-primary">
                {t("career.profile.context.memory_title", "Harper의 기억")}
                {talentMemoriesLoaded ? (
                  <span className="ml-1.5 font-normal text-neutral-muted">
                    {talentMemories.length}
                    {talentMemoriesHasMore ? "+" : ""}
                  </span>
                ) : null}
              </h3>
              <span className="text-[12px] text-neutral-muted">Local</span>
            </div>
            <p className="text-[12px] leading-5 text-neutral-muted">
              {t(
                "career.profile.context.memory_description",
                "다음 대화와 기회 판단에 도움이 되도록 기억해 둔 맥락이에요."
              )}
            </p>
            {!talentMemoriesLoaded ? (
              talentContextsSaveError ? (
                <MuteButton
                  disabled={talentMemoriesLoadPending}
                  onClick={() => void loadTalentMemories?.()}
                  size="sm"
                  type="button"
                >
                  {t("career.profile.context.retry", "다시 시도")}
                </MuteButton>
              ) : (
                <div
                  className="flex justify-center py-6 text-neutral-muted"
                  role="status"
                >
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="sr-only">
                    {t(
                      "career.common.career_history_panel.0s3czqf",
                      "저장된 정보를 불러오는 중입니다..."
                    )}
                  </span>
                </div>
              )
            ) : talentMemories.length > 0 ? (
              <ul className="divide-y divide-neutral-1000-a05">
                {talentMemories.map((row) => (
                  <li
                    className="whitespace-pre-wrap break-words py-3 text-[13px] leading-5 text-neutral-primary first:pt-0 last:pb-0"
                    key={row.id}
                  >
                    {row.content}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-neutral-muted">
                {t(
                  "career.profile.context.memory_empty",
                  "아직 저장된 기억이 없어요."
                )}
              </p>
            )}
            {talentMemoriesLoaded && talentMemoriesHasMore ? (
              <MuteButton
                disabled={talentMemoriesLoadPending}
                onClick={() => void loadTalentMemories?.({ append: true })}
                size="sm"
                type="button"
              >
                {talentMemoriesLoadPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t("career.profile.context.load_more", "더 보기")}
              </MuteButton>
            ) : null}
          </section>
        ) : null}
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

  if (view === "documents" && requestedDocumentId) {
    const document = talentDocuments.find(
      (item) => item.id === requestedDocumentId
    );
    return (
      <CareerDocumentDetail
        key={requestedDocumentId}
        updatedAt={document?.updatedAt}
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

  if (view === "documents" && requestedCallNoteId) {
    return (
      <CareerCallNoteDetail
        documentId={requestedCallNoteId}
        document={callNoteDocument}
        onBack={closeDocumentDetail}
      />
    );
  }

  return (
    <div className="my-4 flex flex-col gap-4">
      <div className="w-full">{activeContent}</div>
    </div>
  );
};

export default React.memo(CareerProfileWorkspace);
