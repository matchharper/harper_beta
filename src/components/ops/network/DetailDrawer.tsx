import { cx, opsTheme } from "@/components/ops/theme";
import type {
  NetworkLeadDetailResponse,
  NetworkLeadMessage,
  NetworkLeadSummary,
  TalentInternalEntry,
} from "@/lib/opsNetwork";
import { motion } from "framer-motion";
import {
  Copy,
  FileText,
  LoaderCircle,
  X,
  Sparkles,
} from "lucide-react";
import InternalView from "./InternalView";
import MessagesView from "./MessagesView";
import ProfileView from "./ProfileView";
import {
  Badge,
  DETAIL_TABS,
  type DetailTab,
  getLeadProgressLabel,
  TabButton,
} from "./shared";
import WaitlistView from "./WaitlistView";

type DetailDrawerProps = {
  closeLeadDrawer: () => void;
  conversationContent: string;
  deletePendingEntryId: number | null;
  detail: NetworkLeadDetailResponse | undefined;
  detailError: string | null;
  detailLoading: boolean;
  detailTab: DetailTab;
  displayedLead: NetworkLeadSummary | null;
  editingEntryContent: string;
  editingEntryId: number | null;
  internalPending: boolean;
  isOpeningCv: number | null;
  isSelectedLeadIngesting: boolean;
  mailContent: string;
  mailFromEmail: string;
  mailPending: boolean;
  mailSubject: string;
  memoContent: string;
  messages: NetworkLeadMessage[];
  messagesError: string | null;
  messagesHasOlder: boolean;
  messagesLoading: boolean;
  messagesLoadingOlder: boolean;
  notificationContent: string;
  notificationPending: boolean;
  onConversationContentChange: (value: string) => void;
  onCopy: (value: string, label: string) => void;
  onDeleteEntry: (entry: TalentInternalEntry) => void;
  onEditCancel: () => void;
  onEditChange: (value: string) => void;
  onEditSave: (entry: TalentInternalEntry) => void;
  onEditStart: (entry: TalentInternalEntry) => void;
  onIngest: () => void;
  onLoadOlderMessages: () => void;
  onMailContentChange: (value: string) => void;
  onMailFromEmailChange: (value: string) => void;
  onMailSubjectChange: (value: string) => void;
  onMemoContentChange: (value: string) => void;
  onNotificationContentChange: (value: string) => void;
  onOpenCv: (lead: NetworkLeadSummary) => void;
  onSaveConversation: () => void;
  onSaveMemo: () => void;
  onSaveNotification: () => void;
  onSendMail: () => void;
  onSetDetailTab: (tab: DetailTab) => void;
  updatePendingEntryId: number | null;
};

export default function DetailDrawer({
  closeLeadDrawer,
  conversationContent,
  deletePendingEntryId,
  detail,
  detailError,
  detailLoading,
  detailTab,
  displayedLead,
  editingEntryContent,
  editingEntryId,
  internalPending,
  isOpeningCv,
  isSelectedLeadIngesting,
  mailContent,
  mailFromEmail,
  mailPending,
  mailSubject,
  memoContent,
  messages,
  messagesError,
  messagesHasOlder,
  messagesLoading,
  messagesLoadingOlder,
  notificationContent,
  notificationPending,
  onConversationContentChange,
  onCopy,
  onDeleteEntry,
  onEditCancel,
  onEditChange,
  onEditSave,
  onEditStart,
  onIngest,
  onLoadOlderMessages,
  onMailContentChange,
  onMailFromEmailChange,
  onMailSubjectChange,
  onMemoContentChange,
  onNotificationContentChange,
  onOpenCv,
  onSaveConversation,
  onSaveMemo,
  onSaveNotification,
  onSendMail,
  onSetDetailTab,
  updatePendingEntryId,
}: DetailDrawerProps) {
  return (
    <div className="fixed inset-0 z-[70]">
      <motion.button
        type="button"
        aria-label="Close candidate drawer"
        className="absolute inset-0 bg-beige900/28 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeLeadDrawer}
      />
      <motion.aside
        initial={{ opacity: 0, x: "100%" }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: "100%" }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="absolute inset-y-0 right-0 w-full max-w-[min(1080px,94vw)] overflow-hidden border-l border-beige900/10 bg-[#F4E8D8] shadow-[-24px_0_80px_rgba(46,23,6,0.18)]"
      >
        <div className="h-full overflow-y-auto">
          {!displayedLead ? (
            <div className="flex h-full items-center justify-center px-6 py-10 font-geist text-sm text-beige900/55">
              {detailError ? (
                <div className={opsTheme.errorNotice}>{detailError}</div>
              ) : (
                <LoaderCircle className="h-6 w-6 animate-spin text-beige900/45" />
              )}
            </div>
          ) : (
            <>
              <div className="px-5 py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className={opsTheme.eyebrow}>Candidate</div>
                    <h2 className={cx(opsTheme.titleSm, "mt-1")}>
                      {displayedLead.name ?? "이름 없음"}
                    </h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {displayedLead.careerMoveIntentLabel ? (
                        <Badge tone="strong">
                          {displayedLead.careerMoveIntentLabel}
                        </Badge>
                      ) : null}
                      <Badge>진행: {getLeadProgressLabel(displayedLead.progress.currentStep)}</Badge>
                      {displayedLead.hasCv ? <Badge>CV 업로드</Badge> : null}
                      {detail?.hasStructuredProfile ? <Badge>구조화 완료</Badge> : null}
                      {detail?.claimedTalentId ? <Badge>후보자 계정 연결됨</Badge> : null}
                      {displayedLead.selectedRole ? <Badge>{displayedLead.selectedRole}</Badge> : null}
                    </div>
                    <div className="mt-3 font-geist text-sm text-beige900/65">
                      {displayedLead.email ?? "이메일 없음"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={closeLeadDrawer}
                      className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                    >
                      <X className="h-4 w-4" />
                      닫기
                    </button>
                    {displayedLead.email ? (
                      <button
                        type="button"
                        onClick={() => onCopy(displayedLead.email ?? "", "이메일")}
                        className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                      >
                        <Copy className="h-4 w-4" />
                        이메일 복사
                      </button>
                    ) : null}
                    {displayedLead.hasCv ? (
                      <button
                        type="button"
                        onClick={() => onOpenCv(displayedLead)}
                        disabled={isOpeningCv === displayedLead.id}
                        className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                      >
                        {isOpeningCv === displayedLead.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                        CV 열기
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={onIngest}
                      disabled={isSelectedLeadIngesting}
                      className={cx(opsTheme.buttonSecondary, "h-10 px-3")}
                    >
                      {isSelectedLeadIngesting ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {detail?.hasStructuredProfile
                        ? "정보 다시 추출하기"
                        : "정보 추출하기"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-beige900/10 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  {DETAIL_TABS.map((tab) => (
                    <TabButton
                      key={tab.id}
                      active={detailTab === tab.id}
                      label={tab.label}
                      onClick={() => onSetDetailTab(tab.id)}
                    />
                  ))}
                </div>
              </div>

              {detailError && !detail ? (
                <div className="px-5 pb-5">
                  <div className={opsTheme.errorNotice}>{detailError}</div>
                </div>
              ) : detailLoading && !detail ? (
                <div className="flex min-h-[420px] items-center justify-center">
                  <LoaderCircle className="h-6 w-6 animate-spin text-beige900/45" />
                </div>
              ) : (
                <div className="px-5 pb-5">
                  {detailTab === "profile" ? (
                    <ProfileView
                      detail={detail}
                      displayedLead={displayedLead}
                      isOpeningCv={isOpeningCv}
                      onOpenCv={onOpenCv}
                    />
                  ) : null}

                  {detailTab === "waitlist" ? (
                    <WaitlistView detail={detail} displayedLead={displayedLead} />
                  ) : null}

                  {detailTab === "messages" ? (
                    <MessagesView
                      error={messagesError}
                      hasOlderMessages={messagesHasOlder}
                      isLoading={messagesLoading}
                      loadingOlderMessages={messagesLoadingOlder}
                      messages={messages}
                      onLoadOlderMessages={onLoadOlderMessages}
                    />
                  ) : null}

                  {detailTab === "internal" ? (
                    <InternalView
                      conversationContent={conversationContent}
                      deletePendingEntryId={deletePendingEntryId}
                      detail={detail}
                      detailError={detailError}
                      displayedLeadEmail={displayedLead.email}
                      editingEntryContent={editingEntryContent}
                      editingEntryId={editingEntryId}
                      internalPending={internalPending}
                      mailContent={mailContent}
                      mailFromEmail={mailFromEmail}
                      mailPending={mailPending}
                      mailSubject={mailSubject}
                      memoContent={memoContent}
                      notificationContent={notificationContent}
                      notificationPending={notificationPending}
                      onConversationContentChange={onConversationContentChange}
                      onDeleteEntry={onDeleteEntry}
                      onEditCancel={onEditCancel}
                      onEditChange={onEditChange}
                      onEditSave={onEditSave}
                      onEditStart={onEditStart}
                      onMailContentChange={onMailContentChange}
                      onMailFromEmailChange={onMailFromEmailChange}
                      onMailSubjectChange={onMailSubjectChange}
                      onMemoContentChange={onMemoContentChange}
                      onNotificationContentChange={onNotificationContentChange}
                      onSaveConversation={onSaveConversation}
                      onSaveMemo={onSaveMemo}
                      onSaveNotification={onSaveNotification}
                      onSendMail={onSendMail}
                      updatePendingEntryId={updatePendingEntryId}
                    />
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </motion.aside>
    </div>
  );
}
