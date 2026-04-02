import React, { useMemo } from "react";
import {
  AwardIcon,
  Building2,
  ExternalLink,
  FileText,
  MapPin,
  SchoolIcon,
} from "lucide-react";
import { initials } from "@/components/NameProfile";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import type { CareerTalentExtra } from "./types";
import { locationEnToKo } from "@/utils/language_map";
import { dateToFormat } from "@/utils/textprocess";
import {
  CareerSectionHeader,
  CareerSecondaryButton,
  CareerSurface,
  careerCx,
} from "./ui/CareerPrimitives";

const parseDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeLink = (raw: string) => {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const formatRange = (startDate?: string | null, endDate?: string | null) => {
  const start = dateToFormat(startDate);
  const end = dateToFormat(endDate);
  if (!start && !end) return "";
  if (start && !end) return `${start} - 현재`;
  if (!start && end) return end;
  return `${start} - ${end}`;
};

const formatMonth = (months?: number | null) => {
  if (!months || months <= 0) return "";
  const years = Math.floor(months / 12);
  const remain = months % 12;
  return `${years > 0 ? `${years}년 ` : ""}${remain}개월`;
};

const TimelineBlock = ({
  title,
  subtitle,
  description,
  memo,
  meta,
  icon,
  isLast,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  memo?: string;
  meta?: string;
  icon: React.ReactNode;
  isLast?: boolean;
}) => (
  <div className={careerCx("relative pl-11", !isLast && "pb-6")}>
    {!isLast ? (
      <div className="absolute bottom-0 left-[14px] top-[30px] w-px bg-beige900/10" />
    ) : null}
    <div className="absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-[8px] border border-beige900/15 bg-white/45 text-beige900/70">
      {icon}
    </div>
    <div>
      <div className="text-[16px] font-medium leading-6 text-beige900">
        {title}
      </div>
      {subtitle ? (
        <div className="mt-1 text-[14px] text-beige900/55">{subtitle}</div>
      ) : null}
      {meta ? (
        <div className="mt-1 text-[13px] text-beige900/40">{meta}</div>
      ) : null}
      {description ? (
        <div className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-beige900/55">
          {description}
        </div>
      ) : null}
      {memo ? (
        <div className="mt-2 border-l border-beige900/20 pl-3 text-[13px] leading-6 text-beige900/50">
          {memo}
        </div>
      ) : null}
    </div>
  </div>
);

const ProfileSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="first:border-t-0 first:pt-0">
    <div className="text-[14px] font-medium text-beige900/45">{title}</div>
    <div className="mt-3">{children}</div>
  </section>
);

const CareerTalentProfilePanel = ({
  className = "",
  showManageButton = true,
}: {
  className?: string;
  showManageButton?: boolean;
}) => {
  const { talentProfile, profileLinks, onOpenSettings } =
    useCareerSidebarContext();
  const { talentUser, talentExperiences, talentEducations, talentExtras } =
    talentProfile;

  const links = useMemo(() => {
    const unique = new Set<string>();
    for (const raw of profileLinks) {
      const normalized = normalizeLink(raw);
      if (!normalized) continue;
      unique.add(normalized.replace(/\/+$/, ""));
    }
    return Array.from(unique);
  }, [profileLinks]);

  const mergedExperience = useMemo(() => {
    const expItems = talentExperiences.map((item) => ({
      kind: "exp" as const,
      item,
    }));
    const eduItems = talentEducations.map((item, index) => ({
      kind: "edu" as const,
      item,
      index,
    }));

    const datedItems = [
      ...expItems,
      ...eduItems.filter((edu) => Boolean(parseDate(edu.item.start_date))),
    ];

    datedItems.sort((a, b) => {
      const aIsOngoing = !parseDate(a.item.end_date);
      const bIsOngoing = !parseDate(b.item.end_date);
      if (aIsOngoing !== bIsOngoing) return aIsOngoing ? -1 : 1;

      const aStartDate = parseDate(a.item.start_date);
      const bStartDate = parseDate(b.item.start_date);
      if (aStartDate && bStartDate) {
        return bStartDate.getTime() - aStartDate.getTime();
      }
      if (aStartDate && !bStartDate) return -1;
      if (!aStartDate && bStartDate) return 1;
      return 0;
    });

    const undatedEdu = eduItems.filter(
      (edu) => !parseDate(edu.item.start_date)
    );

    if (undatedEdu.length === 0) return datedItems;

    const merged = [...datedItems];
    undatedEdu.forEach((edu) => {
      const nextDatedEdu = eduItems
        .slice(edu.index + 1)
        .find((next) => Boolean(parseDate(next.item.start_date)));

      if (!nextDatedEdu) {
        merged.push(edu);
        return;
      }

      const insertAt = merged.findIndex(
        (entry) => entry.kind === "edu" && entry.item === nextDatedEdu.item
      );

      if (insertAt === -1) merged.push(edu);
      else merged.splice(insertAt, 0, edu);
    });

    return merged;
  }, [talentEducations, talentExperiences]);

  const hasAnyProfileData =
    Boolean(talentUser?.name || talentUser?.headline || talentUser?.bio) ||
    mergedExperience.length > 0 ||
    talentExtras.length > 0 ||
    links.length > 0;

  if (!hasAnyProfileData) {
    return (
      <CareerSurface className={className}>
        <div></div>
      </CareerSurface>
    );
  }

  return (
    <div className="space-y-5">
      <ProfileSection title="">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[8px] border border-beige900/10 bg-white/45 text-[24px] text-beige900/70">
            {talentUser?.profile_picture &&
            !talentUser.profile_picture.includes("media.licdn.com") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={talentUser.profile_picture}
                alt={talentUser?.name ?? "profile"}
                className="h-[72px] w-[72px] rounded-[8px] object-cover"
              />
            ) : (
              initials(talentUser?.name)
            )}
          </div>

          <div className="min-w-0 flex flex-col gap-2">
            <div className="font-halant text-[28px] leading-[1] text-beige900">
              {talentUser?.name ?? "Unknown"}
            </div>

            {talentUser?.headline && (
              <div className="text-[15px] leading-6 text-beige900/55">
                {talentUser.headline}
              </div>
            )}

            {talentUser?.location && (
              <div className="flex items-center gap-2 text-[14px] text-beige900/50">
                <MapPin className="h-4 w-4" />
                <span>{locationEnToKo(talentUser.location)}</span>
              </div>
            )}
          </div>
        </div>
      </ProfileSection>

      {talentUser?.bio ? (
        <ProfileSection title="요약">
          <div className="whitespace-pre-wrap text-[14px] leading-6 text-beige900/60">
            {talentUser.bio}
          </div>
        </ProfileSection>
      ) : null}

      {mergedExperience.length > 0 ? (
        <ProfileSection title="경력 및 학력">
          <div>
            {mergedExperience.map((entry, index) => {
              if (entry.kind === "exp") {
                const exp = entry.item;
                const subtitle = [exp.company_name, exp.company_location]
                  .filter(Boolean)
                  .join(" · ");
                const meta = [
                  formatRange(exp.start_date, exp.end_date),
                  formatMonth(exp.months),
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <TimelineBlock
                    key={`exp-${exp.id}-${index}`}
                    title={exp.role ?? "Employee"}
                    subtitle={subtitle}
                    meta={meta}
                    description={exp.description ?? ""}
                    memo={exp.memo ?? ""}
                    icon={<Building2 className="h-4 w-4" />}
                    isLast={index === mergedExperience.length - 1}
                  />
                );
              }

              const edu = entry.item;

              return (
                <TimelineBlock
                  key={`edu-${edu.id}-${index}`}
                  title={edu.school ?? "Student"}
                  subtitle={[edu.field, edu.degree].filter(Boolean).join(" · ")}
                  meta={formatRange(edu.start_date, edu.end_date)}
                  description={edu.description ?? ""}
                  memo={edu.memo ?? ""}
                  icon={<SchoolIcon className="h-4 w-4" />}
                  isLast={index === mergedExperience.length - 1}
                />
              );
            })}
          </div>
        </ProfileSection>
      ) : null}

      {talentExtras.length > 0 && (
        <ProfileSection title="추가 정보">
          <div>
            {talentExtras.map((extra: CareerTalentExtra, index) => (
              <TimelineBlock
                key={`extra-${index}-${extra.title ?? "untitled"}`}
                title={extra.title ?? "기타"}
                subtitle={extra.date ?? ""}
                description={extra.description ?? ""}
                memo={extra.memo ?? ""}
                icon={<AwardIcon className="h-4 w-4" />}
                isLast={index === talentExtras.length - 1}
              />
            ))}
          </div>
        </ProfileSection>
      )}
    </div>
  );
};

export default React.memo(CareerTalentProfilePanel);
