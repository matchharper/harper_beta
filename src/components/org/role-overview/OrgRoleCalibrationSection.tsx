import Image from "next/image";
import { ChevronRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/router";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgRoleCalibration } from "@/hooks/org/useOrgRoleCalibration";
import type {
  CompanyRoleCalibrationPublicProfile,
  CompanyRoleCalibrationResponse,
  CompanyRoleCalibrationReviewStatus,
} from "@/lib/org/roleCalibration";
import { OrgCalibrationReviewBadge } from "./OrgCalibrationReviewBadge";
import { RoleSectionHeading } from "./RoleOverviewShared";

const reviewGroups: CompanyRoleCalibrationReviewStatus[] = [
  "unreviewed",
  "good",
  "bad",
];

function CalibrationProfileRow({
  onOpen,
  profile,
}: {
  onOpen: () => void;
  profile: CompanyRoleCalibrationPublicProfile;
}) {
  return (
    <CardButton
      aria-label={`${profile.profileId} ${profile.display.name} 프로필 보기`}
      className="group items-start gap-2 rounded-md border-neutral-1000-a05 bg-bg-floating p-3 font-normal hover:border-neutral-1000-a10 hover:bg-none"
      onClick={onOpen}
    >
      {profile.display.profilePicture ? (
        <Image
          alt=""
          className="size-7 shrink-0 rounded-full object-cover"
          height={28}
          src={profile.display.profilePicture}
          width={28}
        />
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[12px] font-normal text-neutral-muted">
          {profile.display.name.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="inline-flex min-w-5 shrink-0 justify-center rounded border border-neutral-1000-a10 px-1 text-[10px] font-medium leading-4 text-neutral-muted">
            {profile.profileId}
          </span>
          <span className="truncate text-[14px] font-medium leading-5 text-neutral-primary">
            {profile.display.name}
          </span>
        </span>
        {profile.display.headline ? (
          <span className="mt-2 line-clamp-2 font-light text-[13px] leading-4.5 text-neutral-800">
            {profile.display.headline}
          </span>
        ) : null}
      </span>
      <ChevronRight
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-neutral-soft transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-primary"
      />
    </CardButton>
  );
}

function CalibrationProfiles({
  calibration,
}: {
  calibration: NonNullable<CompanyRoleCalibrationResponse["calibration"]>;
}) {
  const router = useRouter();
  const groups = reviewGroups
    .map((status) => ({
      status,
      profiles: calibration.profiles.filter(
        (profile) => profile.review.status === status
      ),
    }))
    .filter((group) => group.profiles.length > 0);

  if (groups.length === 0) {
    return (
      <p className="mt-5 py-6 text-center text-[13px] text-neutral-muted">
        아직 예시 프로필이 없어요.
      </p>
    );
  }

  return (
    <div aria-label="Calibration 프로필 목록" className="mt-5 space-y-6">
      {groups.map((group) => (
        <section
          aria-label={`${group.status === "good" ? "Good" : group.status === "bad" ? "Bad" : "미평가"} 프로필 그룹`}
          key={group.status}
        >
          <div className="mb-2">
            <OrgCalibrationReviewBadge status={group.status} />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {group.profiles.map((profile) => (
              <li key={profile.profileId}>
                <CalibrationProfileRow
                  onOpen={() => {
                    void router.push(
                      {
                        pathname: router.pathname,
                        query: {
                          ...router.query,
                          calibration: calibration.calibrationId,
                          profile: profile.profileId,
                        },
                      },
                      undefined,
                      { shallow: true, scroll: false }
                    );
                  }}
                  profile={profile}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function OrgRoleCalibrationSection({
  roleId,
  workspaceId,
}: {
  roleId: string;
  workspaceId: string;
}) {
  const calibrationQuery = useOrgRoleCalibration({ roleId, workspaceId });
  const response = calibrationQuery.data;

  if (
    !calibrationQuery.isLoading &&
    !calibrationQuery.isError &&
    (!response || response.state === "none")
  )
    return null;

  return (
    <div className="mt-12 pb-6">
      <RoleSectionHeading size="large" title="Calibration" />
      <p className="mt-1 text-[13px] leading-6 text-neutral-muted">
        예시 프로필을 살펴보고, 우리 팀의 채용 기준과 맞는지 알려주세요.
      </p>
      <p className="mt-1 text-[12px] leading-5 text-neutral-soft">
        채팅에 <span className="text-neutral-muted">“A는 Good”</span>,{" "}
        <span className="text-neutral-muted">“C는 경력이 짧아서 Bad”</span>처럼
        이유와 함께 말씀해 주세요.
      </p>

      {calibrationQuery.isLoading ? (
        <div
          aria-label="예시 프로필을 불러오는 중"
          className="mt-5 space-y-5"
          role="status"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <div
                aria-hidden
                className="flex gap-2 rounded-sm border border-neutral-1000-a05 p-3"
                key={index}
              >
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : calibrationQuery.isError ? (
        <div
          className="mt-5 text-[13px] leading-6 text-neutral-muted"
          role="alert"
        >
          <p>예시 프로필을 불러오지 못했어요. 다시 시도해 주세요.</p>
          <MuteButton
            className="mt-2"
            onClick={() => void calibrationQuery.refetch()}
            variant="transparent"
          >
            다시 불러오기
          </MuteButton>
        </div>
      ) : response?.state === "preparing" ? (
        <div
          className="mt-5 flex items-center gap-2 py-4 text-[13px] text-neutral-muted"
          role="status"
        >
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          Harper가 예시 프로필을 준비하고 있어요.
        </div>
      ) : response?.state === "unavailable" ? (
        <p className="mt-5 py-4 text-[13px] leading-5 text-neutral-muted">
          이번에는 예시 프로필을 준비하지 못했어요.
        </p>
      ) : response?.calibration ? (
        <CalibrationProfiles
          calibration={response.calibration}
          key={response.calibration.calibrationId}
        />
      ) : null}
    </div>
  );
}
