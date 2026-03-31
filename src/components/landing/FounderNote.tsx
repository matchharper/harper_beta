import React from "react";
import { BaseSectionLayout } from "./GridSectionLayout";
import Reveal from "./Animation/Reveal";
import Image from "next/image";
import { useMessages } from "@/i18n/useMessage";

const FounderNote = () => {
  const { m } = useMessages();

  return (
    <Reveal>
      <BaseSectionLayout>
        <div className="w-[90%] max-w-[600px] flex flex-col">
          <div className="flex flex-col items-start gap-4 bg-white/20 rounded-2xl px-6 md:px-[30px] py-6 md:py-8">
            <div className="text-[13px] md:text-base text-left md:leading-[30px] leading-[26px] font-normal text-hgray700">
              <span
                dangerouslySetInnerHTML={{
                  __html: m.companyLanding.testimonial.body,
                }}
              />
            </div>
            <div className="flex flex-row items-center justify-start gap-4 mt-6">
              <div>
                <Image
                  src="/images/cofounder.png"
                  alt="person1"
                  width={60}
                  height={60}
                />
              </div>
              <div className="flex flex-col items-start justify-start gap-1">
                <div className="text-sm">
                  {m.companyLanding.testimonial.name}
                </div>
                <div className="text-hgray700 text-xs">
                  {m.companyLanding.testimonial.role}
                </div>
              </div>
            </div>
          </div>
        </div>
      </BaseSectionLayout>
    </Reveal>
  );
};

export default FounderNote;
