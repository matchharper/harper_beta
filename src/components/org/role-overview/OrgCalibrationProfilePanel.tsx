import Image from "next/image";
import { ChevronLeft, LoaderCircle } from "lucide-react";
import {
  TalentEducationSection,
  TalentExperienceSection,
  TalentExtraSection,
  TalentProfileDescriptionMarkdown,
} from "@/components/profile/TalentExperienceSection";
import { TalentProfileHeader } from "@/components/profile/TalentProfileHeader";
import { MuteButton } from "@/components/ui/button";
import { useOrgRoleCalibration } from "@/hooks/org/useOrgRoleCalibration";
import { OrgCalibrationReviewBadge } from "./OrgCalibrationReviewBadge";

export function OrgCalibrationProfilePanel({
  calibrationId,
  onClose,
  profileId,
  roleId,
  roleName,
  workspaceId,
}: {
  calibrationId: string;
  onClose: () => void;
  profileId: string;
  roleId: string;
  roleName: string;
  workspaceId: string;
}) {
  const query = useOrgRoleCalibration({
    calibrationId,
    profileId,
    roleId,
    workspaceId,
  });
  const profile = query.data?.calibration?.profiles[0] ?? null;

  return (
    <div className="absolute inset-0 z-40 flex min-h-0 flex-col bg-bg-default">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-1000-a05 px-2">
        <MuteButton
          aria-label="Calibration 목록으로 돌아가기"
          onClick={onClose}
          size="md"
          variant="transparent"
        >
          <ChevronLeft className="size-4" />
        </MuteButton>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-neutral-primary">
            Profile {profileId}
          </div>
          <div className="truncate text-[11px] text-neutral-muted">
            {roleName} Calibration
          </div>
        </div>
        {profile ? (
          <OrgCalibrationReviewBadge status={profile.review.status} />
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 pb-20 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10">
        {query.isLoading ? (
          <div
            className="flex min-h-56 items-center justify-center text-[13px] text-neutral-muted"
            role="status"
          >
            <LoaderCircle aria-hidden className="mr-2 size-4 animate-spin" />
            프로필을 불러오는 중
          </div>
        ) : query.isError ? (
          <div
            className="py-12 text-center text-[13px] leading-6 text-neutral-muted"
            role="alert"
          >
            <p>프로필을 불러오지 못했어요. 다시 시도해 주세요.</p>
            <MuteButton
              className="mt-3"
              onClick={() => void query.refetch()}
              variant="transparent"
            >
              다시 불러오기
            </MuteButton>
          </div>
        ) : !profile ? (
          <div className="py-12 text-center text-[13px] leading-6 text-neutral-muted">
            <p>이 프로필을 찾을 수 없어요. 목록에서 다시 선택해 주세요.</p>
            <MuteButton
              className="mt-3"
              onClick={onClose}
              variant="transparent"
            >
              목록으로 돌아가기
            </MuteButton>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-7 px-1">
            <TalentProfileHeader
              avatar={
                profile.display.profilePicture ? (
                  <Image
                    alt=""
                    className="size-12 rounded-full object-cover"
                    height={48}
                    src={profile.display.profilePicture}
                    width={48}
                  />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-full bg-bg-weak text-[15px] font-medium text-neutral-muted">
                    {profile.display.name.slice(0, 1)}
                  </div>
                )
              }
              headline={profile.display.headline}
              location={profile.display.location}
              name={profile.display.name}
            />

            <section className="border border-neutral-1000-a05 p-4 rounded-md">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[13px] font-medium text-neutral-primary">
                  평가
                </h3>
                <OrgCalibrationReviewBadge status={profile.review.status} />
              </div>
              {profile.review.status === "unreviewed" ? (
                <p className="mt-2 text-[13px] leading-6 text-neutral-muted">
                  채팅에 {profileId}의 Good / Bad 평가와 이유를 알려주세요.
                </p>
              ) : profile.review.reason ? (
                <p className="mt-3 whitespace-pre-wrap break-words border-l-2 border-neutral-1000-a10 pl-3 text-[13px] leading-6 text-neutral-primary">
                  {profile.review.reason}
                </p>
              ) : (
                <p className="mt-2 text-[13px] leading-6 text-neutral-muted">
                  평가 이유는 아직 없어요. 채팅에서 덧붙일 수 있어요.
                </p>
              )}
            </section>

            <section>
              <div className="text-[15px] font-medium text-neutral-primary">
                Harper가 고른 이유
              </div>
              <p className="mt-2 whitespace-pre-wrap border-l-2 border-primary px-3 text-[13px] leading-6 text-neutral-primary">
                {profile.selection.reason}
              </p>
              {profile.selection.hypothesis ? (
                <p className="mt-2 text-[12px] leading-5 text-neutral-muted">
                  확인하고 싶은 점: {profile.selection.hypothesis}
                </p>
              ) : null}
            </section>

            {profile.display.bio ? (
              <section>
                <div className="mb-2 text-[12px] text-neutral-muted">소개</div>
                <p className="whitespace-pre-wrap text-[13px] leading-6 text-neutral-primary">
                  {profile.display.bio}
                </p>
              </section>
            ) : null}

            <TalentExperienceSection
              experiences={profile.display.experiences}
            />
            <TalentEducationSection educations={profile.display.educations} />
            <TalentExtraSection extras={profile.display.extras} />

            {profile.display.profileMarkdown &&
            !profile.display.bio &&
            profile.display.experiences.length === 0 &&
            profile.display.educations.length === 0 &&
            profile.display.extras.length === 0 ? (
              <section>
                <div className="mb-2 text-[12px] text-neutral-muted">
                  프로필
                </div>
                <TalentProfileDescriptionMarkdown
                  value={profile.display.profileMarkdown}
                />
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
