import React, { useMemo } from "react";

type ExperienceRow = {
  company_id?: string | number | null;
  months?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  company_db?: {
    name?: string | null;
    logo?: string | null;
    linkedin_url?: string | null;
  } | null;
};

function formatYearsPill(months: number) {
  if (!months || months <= 0) return "0 YEARS";
  const years = Math.max(1, Math.round(months / 12)); // 스샷 느낌: 대충 years 단위
  return `${years} YEARS`;
}

function safeDateValue(d?: string | null) {
  if (!d) return 0;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
}

function normalizeCompanyKey(e: ExperienceRow) {
  return String(e.company_id ?? e.company_db?.name ?? "unknown");
}

function pickCompanyName(e: ExperienceRow) {
  return e.company_db?.name ?? "Company";
}

function pickCompanyLogo(e: ExperienceRow) {
  return e.company_db?.logo ?? null;
}

function pickCompanyLink(e: ExperienceRow) {
  return e.company_db?.linkedin_url ?? null;
}

function buildCompanyTimeline(exps: ExperienceRow[]) {
  const map = new Map<
    string,
    {
      key: string;
      name: string;
      logo: string | null;
      link: string | null;
      months: number;
      sortTs: number; // recent start_date
    }
  >();

  for (const e of exps) {
    const key = normalizeCompanyKey(e);
    const months = typeof e.months === "number" ? e.months : 0;
    const startTs = safeDateValue(e.start_date);

    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        key,
        name: pickCompanyName(e),
        logo: pickCompanyLogo(e),
        link: pickCompanyLink(e),
        months,
        sortTs: startTs,
      });
    } else {
      // 합산 + 더 최신 start_date를 sort 기준으로
      prev.months += months;
      prev.sortTs = Math.max(prev.sortTs, startTs);
      // 로고/링크가 없었는데 새로 들어오면 채우기
      if (!prev.logo && pickCompanyLogo(e)) prev.logo = pickCompanyLogo(e);
      if (!prev.link && pickCompanyLink(e)) prev.link = pickCompanyLink(e);
      if (prev.name === "Company" && pickCompanyName(e) !== "Company")
        prev.name = pickCompanyName(e);
    }
  }

  return Array.from(map.values())
    .filter((x) => x.name && x.name !== "Company")
    .sort((a, b) => b.sortTs - a.sortTs);
}

function CompanyLogo({ name, logo }: { name: string; logo: string | null }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        className="h-24 max-w-[240px] object-contain opacity-95"
        loading="lazy"
      />
    );
  }
  // fallback: 텍스트 로고
  return (
    <div className="h-10 max-w-[140px] flex items-center justify-center px-3">
      <span className="text-sm tracking-wide text-hgray300 font-semibold">
        {name}
      </span>
    </div>
  );
}

function ExperienceBackgroundTimeline({
  experiences,
  maxItems = 6,
}: {
  experiences: ExperienceRow[];
  maxItems?: number;
}) {
  const items = useMemo(
    () => buildCompanyTimeline(experiences).slice(0, maxItems),
    [experiences, maxItems]
  );

  if (items.length === 0) return null;

  return (
    <div className="w-full bg-black text-white py-6 px-4">
      {/* Title */}
      <div className="text-base font-normal">타임라인</div>

      {/* Logos row */}
      <div className="mt-8">
        <div className="flex items-center justify-between gap-10">
          {items.map((it) => {
            const content = <CompanyLogo name={it.name} logo={it.logo} />;

            return (
              <div
                key={it.key}
                className="flex items-center justify-center flex-col px-2 gap-12"
              >
                <div>{content}</div>
                <div className="text-sm font-normal py-1 px-2 rounded-full border border-hgray700">
                  {formatYearsPill(it.months)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default React.memo(ExperienceBackgroundTimeline);
