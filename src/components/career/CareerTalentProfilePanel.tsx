import React, { useMemo, useState } from "react";
import {
  AwardIcon,
  Building2,
  ChevronDown,
  FileText,
  MapPin,
  LinkIcon,
  SchoolIcon,
} from "lucide-react";
import { initials } from "@/components/NameProfile";
import { locationEnToKo } from "@/utils/language_map";
import { dateToFormat } from "@/utils/textprocess";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import type { CareerTalentExtra } from "./types";
import { Tooltips } from "../ui/tooltip";
import LinkPills from "../information/LinkPills";

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

const TimelineItem = ({
  title,
  subtitle,
  dateLabel,
  description,
  memo,
  type,
  isLast,
  isContinued,
}: {
  title: string;
  subtitle: string;
  dateLabel: string;
  description: string;
  memo: string;
  type: "experience" | "education" | "extra";
  isLast: boolean;
  isContinued?: boolean;
}) => {
  const hasDescription = Boolean(description);
  const hasMemo = Boolean(memo);
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="relative">
      {!isLast ? (
        <div className="absolute left-[15px] top-0 h-full w-[2px] bg-hblack200" />
      ) : null}

      <div
        className={`relative flex items-start justify-between gap-3 pb-12 ${
          isContinued ? "mt-[-20px] pb-12" : "mt-0"
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`min-w-8 ${isContinued ? "opacity-0" : "opacity-100"}`}
          >
            <div className="mt-[1px] flex h-10 w-10 items-center justify-center rounded-full border border-hblack200 bg-hblack50">
              {type === "education" ? (
                <SchoolIcon
                  size={16}
                  strokeWidth={1.4}
                  className="text-hblack700"
                />
              ) : type === "extra" ? (
                <AwardIcon
                  size={16}
                  strokeWidth={1.4}
                  className="text-hblack700"
                />
              ) : (
                <Building2
                  size={16}
                  strokeWidth={1.4}
                  className="text-hblack700"
                />
              )}
            </div>
          </div>

          <div className="mt-[-3px] flex min-w-0 flex-col gap-[2px]">
            <div className="truncate text-[15px] font-medium text-hblack900">
              {title}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] font-normal text-hblack600">
              {subtitle ? <span>{subtitle}</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] font-normal text-hblack600">
              {dateLabel ? <span>{dateLabel}</span> : null}
            </div>

            {(hasDescription || hasMemo) && isOpen ? (
              <div className="mt-2 space-y-2 text-sm font-light text-hblack700">
                {hasDescription ? (
                  <div className="whitespace-pre-wrap break-words">
                    {description}
                  </div>
                ) : null}
                {hasMemo ? (
                  <div className="whitespace-pre-wrap break-words bg-beige900/10 text-beige900">
                    Harper 메모: {memo}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {hasDescription || hasMemo ? (
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="absolute right-0 top-[-4px] inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-hblack50"
            aria-expanded={isOpen}
            aria-label={isOpen ? "접기" : "펼치기"}
          >
            <ChevronDown
              size={18}
              strokeWidth={1.4}
              className={`text-hblack800 transition-transform duration-200 ${
                isOpen ? "rotate-180" : "rotate-0"
              }`}
            />
          </button>
        ) : null}
      </div>
    </div>
  );
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="w-full flex flex-col gap-4 border-t border-hblack100 pt-5">
    <div className="col-span-1">
      <div className="text-sm font-normal text-hblack900">{title}</div>
    </div>
    <div className="col-span-5">{children}</div>
  </div>
);

const CareerTalentProfilePanel = () => {
  const { talentProfile, profileLinks } = useCareerSidebarContext();
  const { talentUser, talentExperiences, talentEducations, talentExtras } =
    talentProfile;
  const { onOpenSettings } = useCareerSidebarContext();
  const [bioOpen, setBioOpen] = useState(false);

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
      if (aStartDate && bStartDate)
        return bStartDate.getTime() - aStartDate.getTime();
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
      <div className="mt-4 rounded-2xl border border-hblack200 bg-hblack000 p-5">
        <h2 className="text-base font-normal text-hblack1000">프로필</h2>
        <div className="mt-3 rounded-xl border border-dashed border-hblack200 bg-hblack100 px-4 py-8 text-center text-sm text-hblack600">
          LinkedIn/이력서 제출 후 프로필이 자동으로 표시됩니다.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-hblack200 bg-hblack000">
      <div className="max-h-[calc(100vh-170px)] space-y-5 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        <div className="flex flex-row w-full gap-3 relative">
          <div className="h-12 w-12 overflow-hidden rounded-full border border-hblack200 bg-hblack100">
            {talentUser?.profile_picture &&
            !talentUser.profile_picture.includes("media.licdn.com") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={talentUser.profile_picture}
                alt={talentUser?.name ?? "profile"}
                className="h-12 w-12 object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-hblack100 text-xl font-normal text-hblack700">
                {initials(talentUser?.name)}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <div className="text-xl font-normal text-hblack1000">
              {talentUser?.name ?? "Unknown"}
            </div>

            {talentUser?.headline ? (
              <div className="text-sm font-light text-hblack700">
                {talentUser.headline}
              </div>
            ) : null}

            {talentUser?.location ? (
              <div className="flex items-center gap-1 text-xs font-normal text-hblack600">
                <MapPin className="h-3.5 w-3.5" />
                <span>{locationEnToKo(talentUser.location)}</span>
              </div>
            ) : null}

            <div className="mt-1">
              <LinkPills links={links} />
            </div>
          </div>
          <div className="absolute right-0 top-0">
            <Tooltips text="이력서 / 링크 관리">
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex flex-row cursor-pointer items-center justify-center gap-1 rounded-md bg-hblack50 px-2 py-1.5 text-hblack500 hover:bg-hblack100"
                aria-label="이력서 및 링크 관리 열기"
              >
                <FileText className="h-3.5 w-3.5" />
                /
                <LinkIcon className="h-3.5 w-3.5" />
              </button>
            </Tooltips>
          </div>
        </div>

        {talentUser?.bio ? (
          <Section title="요약">
            <div className="mb-2 flex w-full items-center justify-end">
              <button
                type="button"
                className="text-xs font-normal text-hblack600 transition-all duration-200 hover:text-hblack900"
                onClick={() => setBioOpen((prev) => !prev)}
                aria-expanded={bioOpen}
              >
                {bioOpen ? "접기" : "더보기"}
              </button>
            </div>
            <div
              className={`text-sm leading-relaxed text-hblack700 ${
                bioOpen ? "whitespace-pre-wrap" : "line-clamp-2"
              }`}
            >
              {talentUser.bio}
            </div>
          </Section>
        ) : null}

        {mergedExperience.length > 0 ? (
          <Section title="경력/학력">
            <div>
              {mergedExperience.map((entry, index) => {
                if (entry.kind === "exp") {
                  const exp = entry.item;
                  const prevEntry =
                    index > 0 ? mergedExperience[index - 1] : null;
                  const isContinued =
                    prevEntry?.kind === "exp" &&
                    prevEntry.item.company_name === exp.company_name;
                  const subtitleParts = [
                    exp.company_name,
                    exp.company_location,
                  ].filter(Boolean);
                  const dateLabel = [
                    formatRange(exp.start_date, exp.end_date),
                    formatMonth(exp.months),
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <TimelineItem
                      key={`exp-${exp.id}-${index}`}
                      type="experience"
                      title={exp.role ?? "Employee"}
                      subtitle={subtitleParts.join(" · ")}
                      dateLabel={dateLabel}
                      description={exp.description ?? ""}
                      memo={exp.memo ?? ""}
                      isLast={index === mergedExperience.length - 1}
                      isContinued={isContinued}
                    />
                  );
                }

                const edu = entry.item;
                return (
                  <TimelineItem
                    key={`edu-${edu.id}-${index}`}
                    type="education"
                    title={edu.school ?? "Student"}
                    subtitle={[edu.field, edu.degree]
                      .filter(Boolean)
                      .join(", ")}
                    dateLabel={formatRange(edu.start_date, edu.end_date)}
                    description={edu.description ?? ""}
                    memo={edu.memo ?? ""}
                    isLast={index === mergedExperience.length - 1}
                  />
                );
              })}
            </div>
          </Section>
        ) : null}

        {talentExtras.length > 0 ? (
          <Section title="추가 정보">
            <div>
              {talentExtras.map((extra: CareerTalentExtra, index) => (
                <TimelineItem
                  key={`extra-${index}-${extra.title ?? "untitled"}`}
                  type="extra"
                  title={extra.title ?? "기타"}
                  subtitle={extra.date ?? ""}
                  dateLabel=""
                  description={extra.description ?? ""}
                  memo={extra.memo ?? ""}
                  isLast={index === talentExtras.length - 1}
                />
              ))}
            </div>
          </Section>
        ) : null}
      </div>
    </div>
  );
};

export default React.memo(CareerTalentProfilePanel);
