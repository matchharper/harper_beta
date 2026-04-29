import React, { useCallback, useEffect, useMemo } from "react";
import { useCompanyModalStore } from "@/store/useModalStore";
import LinkChips from "@/pages/my/p/components/LinkChips";
import { Calendar, CircleHelp, MapPinHouse, Users, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import LinkPreview from "../LinkPreview";
import { useMessages } from "@/i18n/useMessage";
import { countryEnToKo } from "@/utils/language_map";
import { Tooltips } from "../ui/tooltip";

export default function CompanyModalRoot() {
  const { isOpen, payload, close } = useCompanyModalStore();
  const company = payload?.company;
  const closeOnBackdrop = payload?.closeOnBackdrop ?? true;
  const { m } = useMessages();
  const requestClose = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      window.history.state?.modal === "company"
    ) {
      close();
      window.history.back();
      return;
    }

    close();
  }, [close]);
  useEffect(() => {
    if (!isOpen) return;

    // 모달 열릴 때 히스토리 스택 하나 추가
    history.pushState({ modal: "company" }, "");

    const onPopState = (e: PopStateEvent) => {
      close();
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, requestClose]);

  const tags = useMemo(() => {
    const raw = company?.specialities ?? "";
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
    return String(raw)
      .split(/[,/·|]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
  }, [company?.specialities]);

  const links = useMemo(() => {
    if (company)
      return [
        company.linkedin_url ?? "",
        company.website_url ?? "",
        company.funding_url ?? "",
      ];
    else return [];
  }, [company]);

  const employeeCount = useMemo(() => {
    let text = "";
    if (company && company.employee_count_range) {
      if ((company.employee_count_range as any).start) {
        text += (company.employee_count_range as any).start + "명 이상";
      }
      if ((company.employee_count_range as any).end) {
        text += " " + (company.employee_count_range as any).end + "명 이하";
      }
      return text;
    } else return "";
  }, [company]);

  const crunchbaseInformation = useMemo(
    () => toRecord(company?.crunchbase_information),
    [company?.crunchbase_information]
  );
  const crunchbaseCompany = useMemo(
    () => toRecord(crunchbaseInformation.company),
    [crunchbaseInformation]
  );
  const crunchbaseTaxonomy = useMemo(
    () => toRecord(crunchbaseInformation.taxonomy),
    [crunchbaseInformation]
  );
  const crunchbaseScores = useMemo(
    () => toRecord(crunchbaseInformation.scores),
    [crunchbaseInformation]
  );
  const crunchbaseStatusRows = useMemo(
    () =>
      [
        {
          label: "운영 상태",
          value: formatCrunchbaseLabel(crunchbaseCompany.operating_status),
        },
        {
          label: "회사 유형",
          value: formatCrunchbaseLabel(crunchbaseCompany.company_type),
        },
        {
          label: "IPO 상태",
          value: formatCrunchbaseLabel(crunchbaseCompany.ipo_status),
        },
      ].filter((row) => row.value !== ""),
    [crunchbaseCompany]
  );
  const crunchbaseScoreCards = useMemo(
    () =>
      [
        {
          label: "Growth Score",
          value: formatCrunchbaseMetricValue(crunchbaseScores.growth_score),
          tooltip:
            "Crunchbase가 회사의 성장 신호를 종합해 산출한 점수입니다. 높을수록 최근 사업 성장세가 강하다는 뜻입니다.",
        },
        {
          label: "Heat Score",
          value: formatCrunchbaseMetricValue(crunchbaseScores.heat_score),
          tooltip:
            "Crunchbase가 시장 관심도와 활동성을 종합해 산출한 점수입니다. 높을수록 최근 주목도와 반응이 크다는 뜻입니다.",
        },
        {
          label: "Growth Δ90d",
          value: formatSignedCrunchbaseMetricValue(
            crunchbaseScores.growth_score_delta_d90
          ),
          tooltip:
            "최근 90일 동안 Growth Score가 얼마나 변했는지입니다. 양수면 성장 신호가 강해졌고, 음수면 약해졌다는 뜻입니다.",
        },
        {
          label: "Heat Δ90d",
          value: formatSignedCrunchbaseMetricValue(
            crunchbaseScores.heat_score_delta_d90
          ),
          tooltip:
            "최근 90일 동안 Heat Score가 얼마나 변했는지입니다. 양수면 최근 주목도가 높아졌고, 음수면 낮아졌다는 뜻입니다.",
        },
      ].filter((card) => card.value !== ""),
    [crunchbaseScores]
  );
  const crunchbaseTrendCards = useMemo(
    () =>
      [
        {
          label: "Growth Score 추이",
          tooltip:
            "Growth Score의 최근 시계열입니다. 선이 위로 갈수록 성장 신호가 강해졌다는 뜻입니다.",
          tone: "growth" as const,
          series: pickCrunchbaseSeries(
            crunchbaseScores.growth_score_history,
            crunchbaseScores.growth_trend_365
          ),
        },
        {
          label: "Heat Score 추이",
          tooltip:
            "Heat Score의 최근 시계열입니다. 선이 위로 갈수록 최근 시장 주목도가 커졌다는 뜻입니다.",
          tone: "heat" as const,
          series: pickCrunchbaseSeries(
            crunchbaseScores.heat_score_history,
            crunchbaseScores.heat_trend_365
          ),
        },
      ].filter(
        (card) => card.series !== null && card.series.values.length >= 2
      ),
    [crunchbaseScores]
  );
  const crunchbaseCategories = useMemo(
    () => toStringArray(crunchbaseTaxonomy.categories).slice(0, 18),
    [crunchbaseTaxonomy.categories]
  );
  const crunchbaseFounders = useMemo(
    () => toStringArray(crunchbaseTaxonomy.founders).slice(0, 12),
    [crunchbaseTaxonomy.founders]
  );
  const crunchbaseLocationGroups = useMemo(
    () => toStringArray(crunchbaseTaxonomy.location_groups).slice(0, 12),
    [crunchbaseTaxonomy.location_groups]
  );

  return (
    <AnimatePresence>
      {isOpen && payload && company ? (
        <motion.div
          className="fixed inset-0 z-[9999] font-sans"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Close modal backdrop"
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => {
              if (closeOnBackdrop) requestClose();
            }}
          />

          {/* Right drawer */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            className={[
              "absolute right-0 top-0 h-full px-8 overflow-y-scroll pb-20",
              "w-[min(560px,92vw)]",
              "bg-beige50 text-beige900",
              "shadow-2xl",
              "border-l border-beige900/8",
            ].join(" ")}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", ease: "easeOut", duration: 0.22 }}
          >
            <div className="absolute top-4 right-4">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-sm bg-transparent px-1 py-1 text-sm hover:bg-beige50/80 cursor-pointer"
              >
                <XIcon className="w-6 h-6" strokeWidth={1} />
              </button>
            </div>

            {/* Header */}
            <div className="flex items-start justify-between gap-4 pb-8 pt-12">
              <div className="flex flex-row gap-6 items-start justify-start">
                <img
                  src={company.logo ?? ""}
                  alt={company.name ?? ""}
                  className="w-20 h-20 rounded-md object-cover"
                />
                <div className="min-w-0">
                  <div className="text-3xl font-medium leading-tight">
                    {company.name ?? "Company"}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <LinkChips links={links} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-8">
              {company.short_description && (
                <div>
                  <div className="text-accentBronze text-sm">한 줄 설명</div>
                  <div className="mt-2 text-base text-beige900">
                    {company.short_description}
                  </div>
                </div>
              )}
              <Section title={`${company.name} 정보`}>
                <div className="px-4 text-sm flex flex-col gap-4 bg-beige100 py-4 rounded-lg">
                  <ColRow
                    label="본사 위치"
                    // label={m.company.hq}
                    value={countryEnToKo(company.location ?? "")}
                  />
                  {company.founded_year !== null &&
                    company.founded_year !== undefined &&
                    company.founded_year > 1000 && (
                      <ColRow label="설립 연도" value={company.founded_year} />
                    )}
                  {employeeCount && (
                    <ColRow label="직원 수" value={employeeCount} />
                  )}
                </div>
              </Section>
              <Section title={`전문 분야`}>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-beige500/55 px-3 py-2 text-xs"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </Section>

              {crunchbaseStatusRows.length > 0 && (
                <Section title="상태">
                  <div className="grid grid-cols-1 gap-4 rounded-lg bg-beige100 px-4 py-4 text-sm sm:grid-cols-3">
                    {crunchbaseStatusRows.map((row) => (
                      <ColRow
                        key={row.label}
                        label={row.label}
                        value={row.value}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {crunchbaseScoreCards.length > 0 && (
                <Section title="Signals">
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {crunchbaseScoreCards.map((card) => (
                        <MetricCard
                          key={card.label}
                          label={card.label}
                          value={card.value}
                          tooltip={card.tooltip}
                        />
                      ))}
                    </div>
                    {crunchbaseTrendCards.length > 0 && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {crunchbaseTrendCards.map((card) =>
                          card.series ? (
                            <TrendSparklineCard
                              key={card.label}
                              label={card.label}
                              tooltip={card.tooltip}
                              tone={card.tone}
                              values={card.series.values}
                              interval={card.series.interval}
                            />
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {(crunchbaseCategories.length > 0 ||
                crunchbaseFounders.length > 0 ||
                crunchbaseLocationGroups.length > 0) && (
                <Section title="Crunchbase 분류">
                  <div className="flex flex-col gap-4">
                    {crunchbaseCategories.length > 0 && (
                      <TagCluster
                        label="카테고리"
                        items={crunchbaseCategories}
                      />
                    )}
                    {crunchbaseFounders.length > 0 && (
                      <TagCluster label="창업자" items={crunchbaseFounders} />
                    )}
                    {crunchbaseLocationGroups.length > 0 && (
                      <TagCluster
                        label="지역 그룹"
                        items={crunchbaseLocationGroups}
                      />
                    )}
                  </div>
                </Section>
              )}

              {/* Body */}
              <div className="h-[calc(100%-64px)] py-4 flex flex-col gap-8">
                {/* <Section title={m.company.information}>
                <div className="space-y-2 text-sm w-full">
                  <Row
                    label={<MapPinHouse className="w-4 h-4 text-beige900/55" />}
                    // label={m.company.hq}
                    value={countryEnToKo(company.location ?? "")}
                  />
                  {company.founded_year !== null &&
                    company.founded_year !== undefined &&
                    company.founded_year > 1000 && (
                      <Row
                        label={<Calendar className="w-4 h-4 text-beige900/55" />}
                        value={company.founded_year}
                      />
                    )}
                  {company.website_url && (
                    <Row
                      label={<Globe className="w-4 h-4 text-beige900/55" />}
                      value={company.website_url}
                      isLink
                    />
                  )}
                  <Row
                    label={<Linkedin className="w-4 h-4 text-beige900/55" />}
                    value={company.linkedin_url}
                    isLink
                  />
                </div>
              </Section> */}

                {!company.short_description && company.description ? (
                  <Section title={m.company.description}>
                    <p className="text-sm leading-6 whitespace-pre-wrap font-light">
                      {company.description}
                    </p>
                  </Section>
                ) : null}

                {company.investors && (
                  <Section title={m.company.investors}>
                    <div className="flex flex-wrap gap-2">
                      {company.investors.split(",").map((i: string) => (
                        <span
                          key={i}
                          className="rounded-md bg-beige500/55 px-3 py-2 text-xs"
                        >
                          {i}
                        </span>
                      ))}
                    </div>
                  </Section>
                )}

                {company.related_links && (
                  <Section title={m.company.news}>
                    <div className="flex flex-wrap gap-2">
                      {company.related_links.map((l: string) => (
                        <LinkPreview key={l} url={l} />
                      ))}
                    </div>
                  </Section>
                )}
                <br />
                <br />
              </div>
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ColRow({
  label,
  value,
  isLink,
}: {
  label: string;
  value: any;
  isLink?: boolean;
}) {
  const v = value ? String(value) : "—";

  return (
    <div className="flex flex-col items-start justify-start gap-0">
      <div className="text-left text-beige900 text-base font-medium">
        {isLink && v !== "—" ? (
          <a
            href={v}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            {v}
          </a>
        ) : (
          v
        )}
      </div>
      <div className="text-left text-[13px] text-beige900/55 font-light">
        {label}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  isLink,
}: {
  label: string | React.ReactNode;
  value: any;
  isLink?: boolean;
}) {
  const v = value ? String(value) : "—";

  return (
    <div className="flex items-center justify-start gap-4">
      <div className="flex items-center justify-center">{label}</div>
      <div className="text-right break-all max-w-full">
        {isLink && v !== "—" ? (
          <a
            href={v}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            {v}
          </a>
        ) : (
          v
        )}
      </div>
    </div>
  );
}

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  return (
    <div className="flex flex-col text-beige900 gap-2 w-full max-w-full">
      <div className="text-base font-medium">{title}</div>
      <div className="max-w-full overflow-x-hidden">{children}</div>
    </div>
  );
};

function MetricCard({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: string;
  tooltip?: string;
}) {
  return (
    <Tooltips text={tooltip ?? ""} side="bottom">
      <div className="rounded-lg bg-beige100 px-4 py-4">
        <div className="text-left text-xl font-medium text-beige900">
          {value}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-left text-[13px] font-light text-beige900/55">
          <span>{label}</span>
          <div
            aria-label={`${label} 설명`}
            className="text-beige900/45 transition-colors hover:text-beige900"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </Tooltips>
  );
}

function TrendSparklineCard({
  label,
  values,
  tooltip,
  interval,
  tone,
}: {
  label: string;
  values: number[];
  tooltip?: string;
  interval?: string;
  tone: "growth" | "heat";
}) {
  const geometry = useMemo(() => buildSparklineGeometry(values), [values]);
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  const strokeColor = tone === "growth" ? "#1B7F6B" : "#C27A1A";
  const fillColor =
    tone === "growth" ? "rgba(27, 127, 107, 0.12)" : "rgba(194, 122, 26, 0.12)";

  return (
    <div className="rounded-lg bg-beige100 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] font-light text-beige900/55">
            <span className="truncate">{label}</span>
            {tooltip && (
              <Tooltips text={tooltip}>
                <button
                  type="button"
                  aria-label={`${label} 설명`}
                  className="cursor-help text-beige900/45 transition-colors hover:text-beige900"
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                </button>
              </Tooltips>
            )}
          </div>
          {interval && (
            <div className="mt-1 text-[11px] font-light text-beige900/55">
              {interval}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-lg font-medium text-beige900">
            {formatCrunchbaseMetricValue(lastValue)}
          </div>
          <div className="text-[11px] font-light text-beige900/55">최근 값</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] font-light text-beige900/55">
        <span>시작 {formatCrunchbaseMetricValue(firstValue)}</span>
        <span></span>
        <span>최근 {formatCrunchbaseMetricValue(lastValue)}</span>
      </div>

      <div className="mt-2 overflow-hidden rounded-md border border-beige900/8 bg-beige100">
        <svg
          viewBox="0 0 100 44"
          className="h-16 w-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={geometry.areaPath}
            fill={fillColor}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={geometry.linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>
  );
}

function TagCluster({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] font-light text-beige900/55">{label}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={`${label}-${item}`}
            className="rounded-md bg-beige500/55 px-3 py-2 text-xs"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function toRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, any>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function formatCrunchbaseLabel(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  return text
    .split(/[_-]+/g)
    .map((part) =>
      part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : ""
    )
    .join(" ");
}

function formatCrunchbaseMetricValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function formatSignedCrunchbaseMetricValue(value: unknown) {
  const formatted = formatCrunchbaseMetricValue(value);
  if (!formatted) return "";
  if (formatted.startsWith("-")) return formatted;
  return `+${formatted}`;
}

function pickCrunchbaseSeries(...candidates: unknown[]) {
  for (const candidate of candidates) {
    const series = extractCrunchbaseSeries(candidate);
    if (series) return series;
  }

  return null;
}

function extractCrunchbaseSeries(value: unknown) {
  const record = toRecord(value);
  const rawValues = Array.isArray(record.values) ? record.values : [];
  const values = rawValues
    .map(extractCrunchbaseSeriesPoint)
    .filter((current): current is number => current !== null)
    .slice(-24);

  if (values.length < 2) return null;

  const interval = formatCrunchbaseSeriesInterval(record.interval);
  return {
    values,
    interval,
  };
}

function extractCrunchbaseSeriesPoint(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const numeric = extractCrunchbaseSeriesPoint(entry);
      if (numeric !== null) return numeric;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const preferredKeys = ["value", "score", "y", "v", "amount", "count"];
  for (const key of preferredKeys) {
    const numeric = extractCrunchbaseSeriesPoint(record[key]);
    if (numeric !== null) return numeric;
  }

  for (const current of Object.values(record)) {
    const numeric = extractCrunchbaseSeriesPoint(current);
    if (numeric !== null) return numeric;
  }

  return null;
}

function formatCrunchbaseSeriesInterval(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return formatCrunchbaseLabel(text);
}

function buildSparklineGeometry(values: number[]) {
  const width = 100;
  const height = 44;
  const padding = 4;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const stepX =
    values.length === 1 ? 0 : (width - padding * 2) / (values.length - 1);

  const points = values.map((value, index) => {
    const x = padding + index * stepX;
    const normalizedY =
      maxValue === minValue
        ? height / 2
        : padding + ((maxValue - value) / range) * (height - padding * 2);
    return {
      x: Number(x.toFixed(2)),
      y: Number(normalizedY.toFixed(2)),
    };
  });

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )
    .join(" ");
  const areaPath = [
    `M ${points[0]?.x.toFixed(2) ?? padding} ${height - padding}`,
    ...points.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
    `L ${points[points.length - 1]?.x.toFixed(2) ?? width - padding} ${
      height - padding
    }`,
    "Z",
  ].join(" ");

  return {
    linePath,
    areaPath,
  };
}
