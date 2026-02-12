import { useCompanyModalStore } from "@/store/useModalStore";
import { dateToFormat } from "@/utils/textprocess";
import { useQueryClient } from "@tanstack/react-query";
import {
  AwardIcon,
  Building2,
  ChevronDown,
  ExternalLink,
  SchoolIcon,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { getSchoolLogo } from "@/utils/school_logo";
import { ExperienceCal } from "../CandidateProfile";

const ItemBox = ({
  title,
  name,
  typed = "experience",
  isContinued = false,
  months,
  start_date,
  end_date,
  link,
  description,
  logo_url,
  company_id,
  isLast,
}: {
  title: string;
  name: string;
  isContinued?: boolean;
  typed?: "edu" | "experience" | "award";
  start_date: string;
  end_date: string;
  link: string;
  description: string;
  logo_url?: string;
  months?: string;
  company_id?: string;
  isLast?: boolean;
}) => {
  const startDate = useMemo(() => dateToFormat(start_date), [start_date]);
  const endDate = useMemo(() => dateToFormat(end_date), [end_date]);
  const isEdu = typed === "edu";
  const isAward = typed === "award";

  const logoUrl = useMemo(() => {
    if (isEdu) {
      return getSchoolLogo(link);
    }
    if (logo_url?.includes("media.licdn.com")) {
      return "";
    }
    return logo_url;
  }, [link, isEdu]);

  const hasDescription = Boolean(description && description.trim().length > 0);
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenCompany = useCompanyModalStore((s) => s.handleOpenCompany);
  const qc = useQueryClient();

  const onButtonClick = () => {
    handleOpenCompany({
      companyId: company_id ?? "",
      queryClient: qc,
    });
  };

  const toggleDesc = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((v) => !v);
  };

  const logoSize = "w-10 h-10 outline outline-4 outline-hgray200";
  const logoIcon = useMemo(() => {
    if (isEdu) {
      return (
        <SchoolIcon size={20} strokeWidth={1.3} className="text-hgray900" />
      );
    }
    if (typed === "award") {
      return (
        <AwardIcon size={20} strokeWidth={1.3} className="text-hgray900" />
      );
    }
    return <Building2 size={20} strokeWidth={1.3} className="text-hgray900" />;
  }, [isEdu, typed]);

  return (
    <div className="relative">
      {isLast ? null : (
        <div className="h-full bg-hgray1000/10 w-[2px] absolute left-[19px] top-0" />
      )}
      <div
        className={`flex flex-row items-start justify-between gap-4 relative pb-12 ${isContinued ? "mt-[-24px] pb-16" : "mt-0"}`}
      >
        <div className="flex flex-row items-start justify-start gap-4 min-w-0">
          <div
            onClick={() => onButtonClick()}
            className={`min-w-10 ${isContinued ? "opacity-0" : "opacity-100"}`}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={name}
                className={`transition-all duration-200 ${logoSize} mt-[1px] rounded-full object-cover border border-hgray1000/0 bg-hgray1000/90 cursor-pointer hover:border-accenta1`}
              />
            ) : (
              <>
                <div
                  className={`${logoSize} mt-[1px] rounded-full flex items-center justify-center text-lg bg-hgray500`}
                >
                  {logoIcon}
                </div>
              </>
            )}
          </div>
          {/* )} */}

          <div className="flex flex-col items-start justify-start gap-[2px] font-normal min-w-0 mt-[-4px]">
            <div className="text-base font-medium truncate text-hgray1000 flex flex-row items-center justify-start gap-2">
              {isEdu ? (
                <span className="text-accenta1/80 text-xs font-light">
                  학력
                </span>
              ) : null}{" "}
              {title ? title : isEdu ? "Student" : "Employee"}
            </div>

            <div
              className={`${isEdu ? "" : "cursor-pointer"} text-hgray700 flex flex-row gap-2 items-center font-light text-sm`}
              onClick={() => onButtonClick()}
            >
              <span
                className={`flex flex-row items-center gap-1 truncate ${isEdu ? "" : "hover:underline"}`}
              >
                {name} {isEdu || isAward ? null : <ExternalLink size={12} />}
              </span>
              <span> · </span>
              {startDate ? (
                <div className="flex flex-row items-center gap-1">
                  <span>{startDate}</span>
                  {typed !== "award" && <span>-</span>}
                  {endDate === "" && typed !== "award" ? (
                    <span className="text-accenta1">현재</span>
                  ) : (
                    <span>{endDate}</span>
                  )}
                </div>
              ) : null}

              {/* {name && link ? <ExternalLink size={14} /> : null} */}
            </div>

            {hasDescription && !isEdu ? (
              <div
                className={[
                  "overflow-hidden transition-all duration-200 ease-out",
                  isOpen ? "max-h-[600px] opacity-100 pb-2" : "h-0 opacity-0",
                ].join(" ")}
              >
                <div className="mt-3 text-sm text-hgray700 font-light whitespace-pre-wrap">
                  {description}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {hasDescription && !isEdu ? (
          <div
            className={`flex flex-row gap-2 shrink-0 absolute right-0 top-0 h-20 w-24 items-center justify-center hover:bg-hgray1000/5 transition-all cursor-pointer rounded-r-xl`}
            onClick={toggleDesc}
          >
            <button
              type="button"
              aria-label={isOpen ? "Hide description" : "Show description"}
              aria-expanded={isOpen}
              className="p-1 rounded-md"
            >
              <ChevronDown
                size={24}
                strokeWidth={1.3}
                className={`transition-transform duration-200 text-hgray1000 ${
                  isOpen ? "rotate-180" : "rotate-0"
                }`}
              />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default React.memo(ItemBox);
