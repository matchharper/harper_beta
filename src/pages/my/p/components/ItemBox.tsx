import { useCompanyModalStore } from "@/store/useModalStore";
import { dateToFormat } from "@/utils/textprocess";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, ExternalLink, SchoolIcon } from "lucide-react";
import React, { useMemo, useState } from "react";
import { getSchoolLogo } from "@/utils/school_logo";
import { ExperienceCal } from "../CandidateProfile";

const ItemBox = ({
  title,
  name,
  typed = "experience",
  months,
  start_date,
  end_date,
  link,
  description,
  logo_url,
  company_id,
}: {
  title: string;
  name: string;
  typed?: "edu" | "experience" | "award";
  start_date: string;
  end_date: string;
  link: string;
  description: string;
  logo_url?: string;
  months?: string;
  company_id?: string;
}) => {
  const startDate = useMemo(() => dateToFormat(start_date), [start_date]);
  const endDate = useMemo(() => dateToFormat(end_date), [end_date]);
  const isEdu = typed === "edu";

  const logoUrl = useMemo(() => {
    if (isEdu) {
      return getSchoolLogo(link);
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

  return (
    <div className="rounded-xl bg-hgray1000/5 relative">
      <div className="flex flex-row items-start justify-between gap-4 relative px-6 py-[14px]">
        <div className="flex flex-row items-start justify-start gap-3 min-w-0">
          {/* {!isEdu && ( */}
          <div onClick={() => onButtonClick()} className="">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={name}
                className="transition-all duration-200 w-12 h-12 mt-[1px] rounded-sm object-cover border border-hgray1000/0 bg-hgray1000/90 cursor-pointer hover:border-accenta1"
              />
            ) : (
              <>
                {isEdu ? (
                  <div className="w-12 h-12 mt-[1px] rounded-sm flex items-center justify-center text-lg bg-hgray500">
                    <SchoolIcon
                      size={24}
                      strokeWidth={1.3}
                      className="text-hgray900"
                    />
                  </div>
                ) : (
                  <div className="w-12 h-12 mt-[1px] rounded-sm flex items-center justify-center text-lg bg-hgray500">
                    <Building2
                      size={24}
                      strokeWidth={1.3}
                      className="text-hgray900"
                    />
                  </div>
                )}
              </>
            )}
          </div>
          {/* )} */}

          <div className="flex flex-col items-start justify-start gap-[2px] font-normal min-w-0">
            <div className="text-base truncate text-hgray1000">
              {title ? title : isEdu ? "Student" : "Employee"}
            </div>

            <div
              className="cursor-pointer hover:underline text-hgray700 flex flex-row gap-2 items-center font-normal text-[15px]"
              onClick={() => onButtonClick()}
            >
              <span className="truncate">{name}</span>
              {name && link ? <ExternalLink size={14} /> : null}
            </div>
            <div className="text-sm text-ngray600 font-normal mt-1 whitespace-nowrap flex flex-row items-center gap-2">
              {startDate ? (
                <div className="flex flex-row items-center gap-2">
                  <span>{startDate}</span>
                  {typed !== "award" && <span>⎻</span>}
                  {endDate === "" && typed !== "award" ? (
                    <span className="text-accenta1">현재</span>
                  ) : (
                    <span>{endDate}</span>
                  )}
                </div>
              ) : null}
              {months && (
                <div className="flex flex-row items-center gap-1">
                  <span> · </span>
                  <span>
                    {typeof months === "number"
                      ? `${ExperienceCal(months)}`
                      : ""}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {hasDescription && !isEdu ? (
          <div
            className={`flex flex-row gap-2 shrink-0 absolute right-0 top-0 w-24 h-full items-center justify-center hover:bg-hgray1000/5 transition-all cursor-pointer ${isOpen ? "rounded-tr-xl" : "rounded-r-xl"
              }`}
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
                className={`transition-transform duration-200 text-hgray1000 ${isOpen ? "rotate-180" : "rotate-0"
                  }`}
              />
            </button>
          </div>
        ) : null}
      </div>

      {hasDescription && !isEdu ? (
        <div
          className={[
            "overflow-hidden transition-all duration-200 ease-out px-6",
            isOpen ? "max-h-[600px] opacity-100 pb-[20px]" : "h-0 opacity-0",
          ].join(" ")}
        >
          <div className="mt-3 text-[15px] text-hgray900 font-normal whitespace-pre-wrap">
            {description}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default React.memo(ItemBox);
