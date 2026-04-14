import { cx, opsTheme } from "@/components/ops/theme";
import type { NetworkLeadDetailResponse, TalentInternalEntry } from "@/lib/opsNetwork";
import {
  FileText,
  LoaderCircle,
  MessageSquareText,
  NotebookPen,
  Send,
} from "lucide-react";
import { ActivityEntryCard, StructuredSection } from "./shared";

type InternalViewProps = {
  conversationContent: string;
  deletePendingEntryId: number | null;
  detail: NetworkLeadDetailResponse | undefined;
  detailError: string | null;
  displayedLeadEmail: string | null;
  editingEntryContent: string;
  editingEntryId: number | null;
  internalPending: boolean;
  mailContent: string;
  mailFromEmail: string;
  mailPending: boolean;
  mailSubject: string;
  memoContent: string;
  notificationContent: string;
  notificationPending: boolean;
  onConversationContentChange: (value: string) => void;
  onDeleteEntry: (entry: TalentInternalEntry) => void;
  onEditCancel: () => void;
  onEditChange: (value: string) => void;
  onEditSave: (entry: TalentInternalEntry) => void;
  onEditStart: (entry: TalentInternalEntry) => void;
  onMailContentChange: (value: string) => void;
  onMailFromEmailChange: (value: string) => void;
  onMailSubjectChange: (value: string) => void;
  onMemoContentChange: (value: string) => void;
  onNotificationContentChange: (value: string) => void;
  onSaveConversation: () => void;
  onSaveMemo: () => void;
  onSaveNotification: () => void;
  onSendMail: () => void;
  updatePendingEntryId: number | null;
};

export default function InternalView({
  conversationContent,
  deletePendingEntryId,
  detail,
  detailError,
  displayedLeadEmail,
  editingEntryContent,
  editingEntryId,
  internalPending,
  mailContent,
  mailFromEmail,
  mailPending,
  mailSubject,
  memoContent,
  notificationContent,
  notificationPending,
  onConversationContentChange,
  onDeleteEntry,
  onEditCancel,
  onEditChange,
  onEditSave,
  onEditStart,
  onMailContentChange,
  onMailFromEmailChange,
  onMailSubjectChange,
  onMemoContentChange,
  onNotificationContentChange,
  onSaveConversation,
  onSaveMemo,
  onSaveNotification,
  onSendMail,
  updatePendingEntryId,
}: InternalViewProps) {
  return (
    <div className="space-y-4">
      {detailError ? <div className={opsTheme.errorNotice}>{detailError}</div> : null}

      <StructuredSection icon={Send} title="메일 보내기">
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <label className={opsTheme.label}>보내는 사람</label>
              <input
                type="text"
                value={mailFromEmail}
                onChange={(event) => onMailFromEmailChange(event.target.value)}
                className={cx(opsTheme.input, "mt-2")}
                placeholder="team@matchharper.com"
              />
            </div>
            <div>
              <label className={opsTheme.label}>받는 사람</label>
              <div
                className={cx(
                  opsTheme.panelSoft,
                  "mt-2 flex h-11 items-center px-3 font-geist text-sm text-beige900/70"
                )}
              >
                {displayedLeadEmail ?? "이메일 없음"}
              </div>
            </div>
          </div>

          <div>
            <label className={opsTheme.label}>제목</label>
            <input
              type="text"
              value={mailSubject}
              onChange={(event) => onMailSubjectChange(event.target.value)}
              className={cx(opsTheme.input, "mt-2")}
              placeholder="후보자에게 보낼 메일 제목"
            />
          </div>

          <div>
            <label className={opsTheme.label}>본문</label>
            <textarea
              value={mailContent}
              onChange={(event) => onMailContentChange(event.target.value)}
              className={cx(opsTheme.textarea, "mt-2 min-h-[180px]")}
              placeholder="후보자에게 보낼 메일 내용을 작성하세요."
            />
          </div>

          <button
            type="button"
            onClick={onSendMail}
            disabled={
              mailPending ||
              !displayedLeadEmail ||
              !mailFromEmail.trim() ||
              !mailSubject.trim() ||
              !mailContent.trim()
            }
            className={cx(opsTheme.buttonPrimary, "h-11")}
          >
            {mailPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            메일 발송
          </button>
        </div>
      </StructuredSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <StructuredSection icon={NotebookPen} title="공용 메모">
          <textarea
            value={memoContent}
            onChange={(event) => onMemoContentChange(event.target.value)}
            className={cx(opsTheme.textarea, "min-h-[180px]")}
            placeholder="후보자에 대한 공용 메모를 남기세요."
          />
          <button
            type="button"
            onClick={onSaveMemo}
            disabled={internalPending || !memoContent.trim()}
            className={cx(opsTheme.buttonSoft, "mt-3 h-10")}
          >
            메모 저장
          </button>

          <div className="mt-5 border-t border-beige900/10 pt-5">
            <label className={opsTheme.label}>Candidate Notification</label>
            <p className="mt-2 font-geist text-sm leading-6 text-beige900/60">
              여기서 입력한 내용은 후보자의 `career` 페이지 Notification에
              표시됩니다. 아직 계정 연결 전이어도 이후 이어지도록 저장됩니다.
            </p>
            <textarea
              value={notificationContent}
              onChange={(event) => onNotificationContentChange(event.target.value)}
              className={cx(opsTheme.textarea, "mt-3 min-h-[120px]")}
              placeholder="후보자에게 보여줄 알림 내용을 입력하세요."
            />
            <button
              type="button"
              onClick={onSaveNotification}
              disabled={notificationPending || !notificationContent.trim()}
              className={cx(opsTheme.buttonSoft, "mt-3 h-10")}
            >
              {notificationPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              알림 저장
            </button>
          </div>
        </StructuredSection>

        <StructuredSection icon={MessageSquareText} title="직접 대화 기록">
          <textarea
            value={conversationContent}
            onChange={(event) => onConversationContentChange(event.target.value)}
            className={cx(opsTheme.textarea, "min-h-[180px]")}
            placeholder="전화나 미팅으로 직접 나눈 대화 내용을 기록하세요."
          />
          <button
            type="button"
            onClick={onSaveConversation}
            disabled={internalPending || !conversationContent.trim()}
            className={cx(opsTheme.buttonSoft, "mt-3 h-10")}
          >
            대화 기록 저장
          </button>
        </StructuredSection>
      </div>

      <StructuredSection icon={FileText} title="활동 타임라인">
        {(detail?.internalEntries ?? []).length > 0 ? (
          <div className="space-y-3">
            {(detail?.internalEntries ?? []).map((entry) => (
              <ActivityEntryCard
                key={entry.id}
                deletePending={deletePendingEntryId === entry.id}
                editPending={updatePendingEntryId === entry.id}
                editingValue={editingEntryId === entry.id ? editingEntryContent : ""}
                entry={entry}
                isEditing={editingEntryId === entry.id}
                onDelete={onDeleteEntry}
                onEditCancel={onEditCancel}
                onEditChange={onEditChange}
                onEditSave={onEditSave}
                onEditStart={onEditStart}
              />
            ))}
          </div>
        ) : (
          <div className="font-geist text-sm text-beige900/55">
            아직 저장된 내부 활동이 없습니다.
          </div>
        )}
      </StructuredSection>
    </div>
  );
}
