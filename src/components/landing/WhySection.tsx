import React from "react";
import Reveal from "./Animation/Reveal";
import { BaseSectionLayout } from "./GridSectionLayout";
import Head1 from "./Head1";
import Animate from "./Animate";
import { useMessages } from "@/i18n/useMessage";
import { OrbitIconsSmall } from "./Orbit";
import { FallingTagsSmall } from "./FallingTagsSmall";
import Image from "next/image";

const WhySection = () => {
  const { m } = useMessages();
  return (
    <Reveal>
      <BaseSectionLayout>
        <Animate>
          <Head1 as="h2" className="text-white text-center w-full">
            {m.companyLanding.why.title}
          </Head1>
          {/* <div className="text-sm font-hedvig font-light md:text-lg mt-6 px-2 text-hgray700">
            <span
              dangerouslySetInnerHTML={{
                __html: copyVariant.whySubtitle,
              }}
            />
          </div> */}
        </Animate>
        <Animate>
          <div data-section="why">
            <div className="flex flex-col md:flex-row mt-12 gap-8">
              <WhyImageSection
                title={m.companyLanding.why.cards[0].title}
                desc={m.companyLanding.why.cards[0].desc}
                imageSrc="/images/feat1.png"
              />
              <WhyImageSection
                title={m.companyLanding.why.cards[1].title}
                desc={m.companyLanding.why.cards[1].desc}
                imageSrc="/images/feat4.png"
              />
              <WhyImageSection
                title={m.companyLanding.why.cards[2].title}
                desc={m.companyLanding.why.cards[2].desc}
                imageSrc="orbit"
              />
            </div>
          </div>
        </Animate>
      </BaseSectionLayout>
    </Reveal>
  );
};

export default WhySection;

export const WhyImageSection = React.memo(function WhyImageSection({
  title,
  desc,
  imageSrc,
}: {
  title: string;
  desc: string;
  imageSrc: string;
}) {
  const imgReturn = () => {
    if (imageSrc === "/images/feat1.png") {
      return (
        <div className="h-[200px] md:h-[280px] relative w-full flex justify-center items-center rounded-2xl bg-gradpastel2 overflow-hidden">
          <div className="mr-8 w-full">
            <FallingTagsSmall theme="white" startDelay={800} />
          </div>
        </div>
      );
    }

    if (imageSrc === "orbit") {
      return (
        <div className="h-[200px] md:h-[280px] relative w-full flex justify-center items-center rounded-2xl bg-gradpastel2 overflow-hidden">
          <OrbitIconsSmall />
        </div>
      );
    }
    return (
      <div className="h-[200px] md:h-[280px] relative w-full flex justify-end items-end rounded-2xl bg-gradpastel2 overflow-hidden">
        <Image
          src={imageSrc}
          alt={title}
          width={400}
          height={320}
          className="max-w-[90%]"
        />
      </div>
    );
  };
  return (
    <div className="flex flex-col w-full items-center justify-center md:items-start md:justify-start max-w-full gap-8 px-5 md:px-0">
      {imgReturn()}
      <div className="flex flex-col items-start justify-start w-full gap-4 text-left">
        <h3
          className="text-[20px] md:text-2xl font-normal leading-[2.2rem] md:leading-[2.5rem]"
          dangerouslySetInnerHTML={{ __html: title }}
        />
        <div
          className="text-sm md:text-base leading-6 font-light text-hgray700"
          dangerouslySetInnerHTML={{ __html: desc }}
        />
      </div>
    </div>
  );
});
