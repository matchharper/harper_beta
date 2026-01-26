import React, { useEffect, useMemo } from "react";
import { useCompanyModalStore } from "@/store/useModalStore";
import LinkChips from "@/pages/my/p/components/LinkChips";
import {
  Calendar,
  Globe,
  House,
  Linkedin,
  MapPinHouse,
  Users,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import LinkPreview from "../LinkPreview";
import { useMessages } from "@/i18n/useMessage";
import { countryEnToKo } from "@/utils/language_map";

export default function CompanyModalRoot() {
  const { isOpen, payload, close } = useCompanyModalStore();
  const company = payload?.company;
  const closeOnBackdrop = payload?.closeOnBackdrop ?? true;
  const { m } = useMessages();
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
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

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
              if (closeOnBackdrop) close();
            }}
          />

          {/* Right drawer */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            className={[
              "absolute right-0 top-0 h-full px-8 overflow-y-scroll pb-20",
              "w-[min(560px,92vw)]",
              "bg-hgray200 text-hgray900",
              "shadow-2xl",
              "border-l border-hgray200",
            ].join(" ")}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", ease: "easeOut", duration: 0.22 }}
          >
            <div className="absolute top-4 right-4">
              <button
                type="button"
                onClick={close}
                className="rounded-sm bg-white/0 px-1 py-1 text-sm hover:bg-white/5 cursor-pointer"
              >
                <XIcon className="w-6 h-6" strokeWidth={1} />
              </button>
            </div>

            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-5 py-4 pt-16">
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

            {company.short_description && (
              <div className="mt-2 mb-6 px-5">
                <div className="text-accenta1 text-sm">한 줄 설명</div>
                <div className="mt-2 text-base text-hgray900">
                  {company.short_description}
                </div>
              </div>
            )}
            <div className="mt-2 mb-6 px-5 text-sm flex flex-col gap-2">
              <Row
                label={<MapPinHouse className="w-4 h-4 text-hgray700" />}
                // label={m.company.hq}
                value={countryEnToKo(company.location ?? "")}
              />
              {company.founded_year !== null &&
                company.founded_year !== undefined &&
                company.founded_year > 1000 && (
                  <Row
                    label={<Calendar className="w-4 h-4 text-hgray700" />}
                    value={company.founded_year + "년 설립"}
                  />
                )}
              {employeeCount && (
                <Row
                  label={<Users className="w-4 h-4 text-hgray700" />}
                  value={employeeCount}
                />
              )}
              <div className="mt-6 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-white/5 px-3 py-2 text-xs"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="h-[calc(100%-64px)] px-5 py-4 flex flex-col gap-8">
              {/* <Section title={m.company.information}>
                <div className="space-y-2 text-sm w-full">
                  <Row
                    label={<MapPinHouse className="w-4 h-4 text-hgray700" />}
                    // label={m.company.hq}
                    value={countryEnToKo(company.location ?? "")}
                  />
                  {company.founded_year !== null &&
                    company.founded_year !== undefined &&
                    company.founded_year > 1000 && (
                      <Row
                        label={<Calendar className="w-4 h-4 text-hgray700" />}
                        value={company.founded_year}
                      />
                    )}
                  {company.website_url && (
                    <Row
                      label={<Globe className="w-4 h-4 text-hgray700" />}
                      value={company.website_url}
                      isLink
                    />
                  )}
                  <Row
                    label={<Linkedin className="w-4 h-4 text-hgray700" />}
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
                        className="rounded-md bg-white/5 px-3 py-2 text-xs"
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
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
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
    <div className="flex flex-col gap-2 w-full max-w-full">
      <div className="text-lg text-hgray900 font-normal">{title}</div>
      <div className="text-hgray900 max-w-full overflow-x-hidden mt-[10px]">
        {children}
      </div>
    </div>
  );
};
