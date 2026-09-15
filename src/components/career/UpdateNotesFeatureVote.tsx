import { useState } from "react";
import { Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { MuteButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/components/toast/toast";
import { useCareerT } from "@/i18n/useCareerT";
import type { Locale } from "@/i18n/useMessage";
import {
  areUpdateNotesFeatureVotesEqual,
  normalizeUpdateNotesFeatureVoteContext,
  normalizeUpdateNotesFeatureVoteCustomResponse,
  shouldSubmitUpdateNotesFeatureVoteDirectly,
  UPDATE_NOTES_FEATURE_VOTE_CONTEXT_MAX_LENGTH,
  UPDATE_NOTES_FEATURE_VOTE_CUSTOM_RESPONSE_MAX_LENGTH,
  UPDATE_NOTES_FEATURE_VOTE_OPTIONS,
  type UpdateNotesFeatureVoteOptionId,
} from "@/lib/updateNotesFeatureVote";
import { useAuthStore } from "@/store/useAuthStore";
import { useUpdateNotesFeatureVoteStore } from "@/store/useUpdateNotesFeatureVoteStore";
import type { SavedUpdateNotesFeatureVote } from "@/store/useUpdateNotesFeatureVoteStore";

type VoteCopy = {
  contextLabel: string;
  contextPlaceholder: string;
  customLabel: string;
  customPlaceholder: string;
  edit: string;
  error: string;
  saved: string;
  selectionComplete: string;
  submit: string;
  submitting: string;
  subtitle: string;
  title: string;
  unchanged: string;
};

function useUpdateNotesFeatureVoteCopy(): VoteCopy {
  const t = useCareerT();

  return {
    contextLabel: t(
      "career.update_notes_feature_vote.context_label",
      "언제, 왜 필요하신가요? (optional)"
    ),
    contextPlaceholder: t(
      "career.update_notes_feature_vote.context_placeholder",
      "선택한 이유나 관련 맥락을 알려주세요."
    ),
    customLabel: t(
      "career.update_notes_feature_vote.custom_label",
      "그 외 바라는 점 (주관식)"
    ),
    customPlaceholder: t(
      "career.update_notes_feature_vote.custom_placeholder",
      "Harper가 더 도와줬으면 하는 일을 자유롭게 알려주세요."
    ),
    edit: t("career.update_notes_feature_vote.edit", "응답 수정하기"),
    error: t(
      "career.update_notes_feature_vote.error",
      "의견을 보내지 못했어요. 잠시 후 다시 시도해 주세요."
    ),
    saved: t(
      "career.update_notes_feature_vote.saved",
      "피드백을 주셔서 감사합니다."
    ),
    selectionComplete: t(
      "career.update_notes_feature_vote.selection_complete",
      "선택 완료"
    ),
    submit: t("career.update_notes_feature_vote.submit", "제출하기"),
    submitting: t("career.update_notes_feature_vote.submitting", "제출 중"),
    subtitle: t(
      "career.update_notes_feature_vote.subtitle",
      "앞으로 Harper가 더 도와줬으면 하는 일을 모두 골라주세요."
    ),
    title: t("career.update_notes_feature_vote.title", "Harper에게 바라는 점"),
    unchanged: t(
      "career.update_notes_feature_vote.unchanged",
      "수정할 내용을 먼저 바꿔주세요."
    ),
  };
}

export default function UpdateNotesFeatureVote({ locale }: { locale: Locale }) {
  const authLoading = useAuthStore((state) => state.loading);
  const accessToken = useAuthStore(
    (state) => state.session?.access_token ?? null
  );
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const hasHydrated = useUpdateNotesFeatureVoteStore(
    (state) => state.hasHydrated
  );
  const savedResponse = useUpdateNotesFeatureVoteStore((state) =>
    userId ? state.responsesByUserId[userId] : undefined
  );
  const saveResponse = useUpdateNotesFeatureVoteStore(
    (state) => state.saveResponse
  );

  if (authLoading || !userId || !hasHydrated) return null;

  return (
    <UpdateNotesFeatureVoteForm
      key={`${userId}:${locale}`}
      accessToken={accessToken}
      initialSavedResponse={savedResponse}
      locale={locale}
      onSave={(response) => saveResponse(userId, response)}
    />
  );
}

function UpdateNotesFeatureVoteForm({
  accessToken,
  initialSavedResponse,
  locale,
  onSave,
}: {
  accessToken: string | null;
  initialSavedResponse?: SavedUpdateNotesFeatureVote;
  locale: Locale;
  onSave: (response: SavedUpdateNotesFeatureVote) => void;
}) {
  const copy = useUpdateNotesFeatureVoteCopy();
  const [savedResponse, setSavedResponse] = useState(initialSavedResponse);
  const [selectedOptionIds, setSelectedOptionIds] = useState<
    UpdateNotesFeatureVoteOptionId[]
  >(initialSavedResponse?.optionIds ?? []);
  const [customResponse, setCustomResponse] = useState(
    initialSavedResponse?.customResponse ?? ""
  );
  const [context, setContext] = useState(initialSavedResponse?.context ?? "");
  const [contextOpen, setContextOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(
    initialSavedResponse ? { kind: "success", text: copy.saved } : null
  );

  const hasChanged = savedResponse
    ? !areUpdateNotesFeatureVotesEqual(
        { context, customResponse, optionIds: selectedOptionIds },
        {
          context: savedResponse.context,
          customResponse: savedResponse.customResponse,
          optionIds: savedResponse.optionIds,
        }
      )
    : selectedOptionIds.length > 0 ||
      normalizeUpdateNotesFeatureVoteCustomResponse(customResponse).length > 0;

  const canSubmit =
    selectedOptionIds.length > 0 ||
    normalizeUpdateNotesFeatureVoteCustomResponse(customResponse).length > 0;
  const submitDirectly = shouldSubmitUpdateNotesFeatureVoteDirectly({
    customResponse,
    optionIds: selectedOptionIds,
  });
  const showContext = contextOpen && selectedOptionIds.length > 0;

  const toggleOption = (optionId: UpdateNotesFeatureVoteOptionId) => {
    setSelectedOptionIds((current) =>
      current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId]
    );
    setMessage(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;

    if (!contextOpen && !submitDirectly) {
      setContextOpen(true);
      setMessage(null);
      return;
    }

    if (savedResponse && !hasChanged) {
      setMessage({ kind: "error", text: copy.unchanged });
      return;
    }

    if (!accessToken) {
      setMessage({ kind: "error", text: copy.error });
      return;
    }

    const normalizedContext = submitDirectly
      ? ""
      : normalizeUpdateNotesFeatureVoteContext(context);
    const normalizedCustomResponse =
      normalizeUpdateNotesFeatureVoteCustomResponse(customResponse);
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/feedback/update-notes-feature-vote", {
        body: JSON.stringify({
          context: normalizedContext,
          customResponse: normalizedCustomResponse,
          optionIds: selectedOptionIds,
          revision: Boolean(savedResponse),
        }),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok)
        throw new Error(`Feature vote failed: ${response.status}`);

      const submittedResponse = {
        context: normalizedContext,
        customResponse: normalizedCustomResponse,
        optionIds: selectedOptionIds,
        submittedAt: new Date().toISOString(),
      };
      onSave(submittedResponse);
      setSavedResponse(submittedResponse);
      setContext(normalizedContext);
      setCustomResponse(normalizedCustomResponse);
      setContextOpen(false);
      setMessage({ kind: "success", text: copy.saved });
      showToast({ message: copy.saved });
    } catch (error) {
      console.error("update notes feature vote failed:", error);
      setMessage({ kind: "error", text: copy.error });
    } finally {
      setIsSubmitting(false);
    }
  };

  const buttonLabel = isSubmitting
    ? copy.submitting
    : showContext || (submitDirectly && (!savedResponse || hasChanged))
      ? copy.submit
      : savedResponse
        ? copy.edit
        : copy.selectionComplete;

  return (
    <section className="rounded-sm border border-neutral-1000-a05 bg-bg-basement p-3">
      <Text type="subtle" className="text-primary">
        {copy.title}
      </Text>
      <Text type="caption" className="mt-1 text-neutral-soft">
        {copy.subtitle}
      </Text>

      <div className="mt-4 grid gap-2">
        {UPDATE_NOTES_FEATURE_VOTE_OPTIONS.map((option) => {
          const selected = selectedOptionIds.includes(option.id);
          return (
            <Checkbox
              key={option.id}
              checked={selected}
              disabled={isSubmitting}
              label={locale === "ko" ? option.ko : option.en}
              onChange={() => toggleOption(option.id)}
              size="medium"
              className={`w-full rounded-md border bg-bg-floating px-2 py-1.5 transition-colors ${
                selected
                  ? "border-neutral-800"
                  : "border-neutral-1000-a05 hover:border-neutral-1000-a10"
              }`}
            />
          );
        })}
      </div>

      <div className="mt-4">
        <label
          htmlFor="update-notes-feature-vote-custom-response"
          className="text-[13px] font-medium text-neutral-primary"
        >
          {copy.customLabel}
        </label>
        <Textarea
          id="update-notes-feature-vote-custom-response"
          value={customResponse}
          maxLength={UPDATE_NOTES_FEATURE_VOTE_CUSTOM_RESPONSE_MAX_LENGTH}
          disabled={isSubmitting}
          onChange={(event) => {
            setCustomResponse(event.target.value);
            setMessage(null);
          }}
          placeholder={copy.customPlaceholder}
          rows={3}
          className="mt-2 min-h-[96px] p-2 text-sm leading-5"
        />
      </div>

      <MuteButton
        type="button"
        variant="primary"
        size="md"
        className="mt-4 w-full"
        disabled={!canSubmit || isSubmitting}
        onClick={handleSubmit}
      >
        {savedResponse && !showContext && !hasChanged ? (
          <Check className="h-4 w-4" />
        ) : null}
        {buttonLabel}
      </MuteButton>

      {showContext ? (
        <div className="mt-4">
          <label
            htmlFor="update-notes-feature-vote-context"
            className="text-[13px] font-medium text-neutral-primary"
          >
            {copy.contextLabel}
          </label>
          <Textarea
            id="update-notes-feature-vote-context"
            aria-describedby="update-notes-feature-vote-context-help"
            value={context}
            maxLength={UPDATE_NOTES_FEATURE_VOTE_CONTEXT_MAX_LENGTH}
            onChange={(event) => {
              setContext(event.target.value);
              setMessage(null);
            }}
            placeholder={copy.contextPlaceholder}
            rows={3}
            className="mt-2 min-h-[112px] leading-5 p-2 text-sm"
          />
        </div>
      ) : null}

      {message ? (
        <Text
          role={message.kind === "error" ? "alert" : "status"}
          type="caption"
          className={`mt-3 ${
            message.kind === "error" ? "text-critical" : "text-positive"
          }`}
        >
          {message.text}
        </Text>
      ) : null}
    </section>
  );
}
