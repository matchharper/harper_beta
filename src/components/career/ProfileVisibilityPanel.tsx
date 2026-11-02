import { Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { SelectBox } from "@/components/ui/select-box";
import { ConversationExamples } from "@/components/ui/conversation-examples";
import type { CareerProfileVisibility } from "@/hooks/career/useCareerTalentSettings";
import { useCareerT } from "@/i18n/useCareerT";

export const profileVisibilityLabels: Record<CareerProfileVisibility, string> =
  {
    open_to_matches: "Open to matches",
    exceptional_only: "Exceptional only",
    dont_share: "Don't share",
  };

export function ProfileVisibilityPanel({
  value,
  saving,
  error,
  onValueChange,
  onClose,
}: {
  value: CareerProfileVisibility | null;
  saving: boolean;
  error: string;
  onValueChange: (value: CareerProfileVisibility) => void;
  onClose: () => void;
}) {
  const t = useCareerT();
  const summaries = {
    open_to_matches: t(
      "career.profile.visibility_panel.open_summary",
      "회원님이 좋아할만한 회사가 채용을 요청했을 때, Harper가 먼저 회원님을 소개해요. 제한된 정보만 공유됩니다. 평균적으로 68% 더 많은 기회를 받아요."
    ),
    exceptional_only: t(
      "career.profile.visibility_panel.exceptional_summary",
      "회원님이 좋아할만한 회사가 채용을 요청했을 때, 회원님을 소개하기 전에 먼저 허락을 받아요."
    ),
    dont_share: t(
      "career.profile.visibility_panel.private_summary",
      "모든 곳에 프로필을 공유하지 않아요. 모든 매칭이 중지됩니다."
    ),
  };
  const descriptions = {
    open_to_matches: t(
      "career.profile.visibility_panel.open_description",
      "경력과 희망 조건에 맞는 회사에 Harper가 먼저 회원님을 추천하고, 좋은 조건으로 연락해보도록 말해요. 채용 검토에 필요한 정보만 공유하고, 회사에서 관심을 보이면 알려드려요. 제안을 받아본 뒤 연결할지 결정하면 돼요. 차단한 회사에는 정보를 공유하지 않아요."
    ),
    exceptional_only: t(
      "career.profile.visibility_panel.exceptional_description",
      "회원님이 좋아할만한 회사가 채용을 요청했을 때, 회원님을 소개하기 전에 먼저 허락을 받아요. 대신 회사에게서 먼저 조건을 받아본 뒤 결정을 하지는 못합니다."
    ),
    dont_share: t(
      "career.profile.visibility_panel.private_description",
      "모든 매칭을 중단해요. 이미 소개된 회사는 계속 프로필을 볼 수 있어요."
    ),
  };
  const conversations = {
    open_to_matches: [
      {
        role: "assistant",
        text: t(
          "career.profile.visibility_panel.open_assistant",
          "프로필을 보낸 회사에서 만나보고 싶다고 연락이 왔어요. 어떤 회사인지 알려드릴까요?"
        ),
      },
      {
        role: "user",
        text: t(
          "career.profile.visibility_panel.open_user",
          "응, 회사랑 포지션 알려줘."
        ),
      },
    ],
    exceptional_only: [
      {
        role: "assistant",
        text: t(
          "career.profile.visibility_panel.exceptional_assistant",
          "지금까지 해오신 일과 잘 맞는 포지션이 있어요. 어떤 회사인지 먼저 살펴보실래요?"
        ),
      },
      {
        role: "user",
        text: t(
          "career.profile.visibility_panel.exceptional_user",
          "응, 어떤 곳인지 보고 결정할게."
        ),
      },
    ],
    dont_share: [
      {
        role: "user",
        text: t(
          "career.profile.visibility_panel.private_user",
          "다음 주 인터뷰 준비 좀 도와줘."
        ),
      },
      {
        role: "assistant",
        text: t(
          "career.profile.visibility_panel.private_assistant",
          "물론이죠. 어느 회사의 어떤 포지션인가요?"
        ),
      },
    ],
  } as const;
  const title = t(
    "career.profile.career_profile_settings_section.1tnqucg",
    "프로필 공개"
  );
  return (
    <TalentCareerModal
      open={value !== null}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          {title}
          {saving ? (
            <Loader2
              className="h-3.5 w-3.5 animate-spin"
              aria-label={t(
                "career.profile.career_profile_settings_section.08zy6at_2",
                "저장 중..."
              )}
            />
          ) : null}
        </span>
      }
      closeOnBackdrop={!saving}
      showCloseButton={!saving}
      overlayClassName="items-stretch justify-end p-0 sm:p-0"
      panelClassName="h-dvh max-h-dvh max-w-[520px] rounded-none border-0 border-l border-neutral-1000-a05 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 motion-reduce:animate-none"
      headerClassName="px-5 py-6"
      bodyClassName="flex-1 px-5 pb-6"
    >
      {value !== null ? (
        <div className="space-y-5">
          <SelectBox<CareerProfileVisibility>
            aria-label={title}
            options={(
              Object.keys(profileVisibilityLabels) as CareerProfileVisibility[]
            ).map((key) => ({
              value: key,
              title: profileVisibilityLabels[key],
              description: summaries[key],
            }))}
            value={value}
            onValueChange={onValueChange}
            disabled={saving}
          />
          <p className="text-sm leading-5.5 px-2 text-neutral-muted mb-8">
            {descriptions[value]}
          </p>
          <ConversationExamples
            key={value}
            examples={[{ id: value, messages: conversations[value] }]}
            navigationLabel={t(
              "career.integrations.carousel.navigation",
              "좌우로 넘겨 대화 예시 보기"
            )}
            getPageLabel={(number) =>
              t(
                "career.integrations.carousel.go_to",
                "대화 예시 {number} 보기",
                { values: { number } }
              )
            }
          />
          {error ? (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </TalentCareerModal>
  );
}
