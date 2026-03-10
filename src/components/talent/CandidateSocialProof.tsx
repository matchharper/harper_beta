import Image from "next/image";
import React from "react";

const RoundImage = ({ src, alt }: { src: string; alt: string }) => {
  return (
    <div className="rounded-full border border-hblack100 transition-all duration-300 hover:translate-x-[4px]">
      <Image
        src={src}
        alt={alt}
        className="rounded-full"
        width={20}
        height={20}
      />
    </div>
  );
};

const CandidateSocialProof = () => {
  return (
    <div className="flex items-center flex-row gap-2 mt-3 font-inter">
      <div className="relative items-baseline gap-1 text-hblack500 font-normal text-sm flex">
        현재 500+명이 등록했습니다.
      </div>
      <div className="flex -space-x-2">
        <RoundImage src="/images/person1.png" alt="person1" />
        <RoundImage src="/images/person2.png" alt="person2" />
        <RoundImage src="/images/person3.png" alt="person3" />
      </div>
    </div>
  );
};

export default React.memo(CandidateSocialProof);
