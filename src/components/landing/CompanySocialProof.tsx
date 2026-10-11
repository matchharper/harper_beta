import Image from "next/image";

export type CompanyTalentLogo = {
  src: string;
  name: string;
  width: number;
  hideOnMobile?: boolean;
};

export const companyTalentLogos: readonly CompanyTalentLogo[] = [
  { src: "/images/logos/sn.png", name: "SNU", width: 44 },
  {
    src: "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/8FCgNqlkK-QnA_6-52ZbfFJ_Wz_Gsm9zkPybokRMl8R0H4ZgUL0wu1lggVUIHhEwIxGXPOYR9gw9RDFxiW46Eg.svg",
    name: "Yonsei University",
    width: 62,
  },
  { src: "/images/logos/kai.png", name: "KAIST", width: 68 },
  { src: "/images/logos/cmu.png", name: "CMU", width: 62 },
  { src: "/images/logos/stanfordtext.png", name: "Stanford", width: 84 },
  { src: "/images/logos/harvard.svg", name: "Harvard", width: 80 },
  {
    src: "/images/logos/torontotext.png",
    name: "University of Toronto",
    width: 124,
  },
  { src: "/images/logos/toss.png", name: "Toss", width: 64 },
  { src: "/images/logos/kakao.svg", name: "Kakao", width: 58 },
  { src: "/svgs/cohere.svg", name: "Cohere", width: 78, hideOnMobile: true },
  { src: "/images/logos/amazon.svg", name: "Amazon", width: 60 },
  { src: "/images/logos/naver.svg", name: "Naver", width: 60 },
  { src: "/images/logos/moloco.png", name: "Moloco", width: 90 },
  { src: "/images/logos/nvidia.svg", name: "NVIDIA", width: 82 },
  { src: "/images/logos/microsoft.svg", name: "Microsoft", width: 76 },
  { src: "/images/logos/samsung.svg", name: "Samsung", width: 104 },
];

// These are the anonymous company descriptions already used on /company.
export const companyTeamHighlights = [
  { accent: "$2B", label: "AI-first Asia VC" },
  { accent: "$5B", label: "Global Agentic Company" },
  { accent: "Sequoia-backed", label: "Consumer AI Agent" },
  { accent: "$15B", label: "U.S B2B AI Agent Service" },
] as const;

export const companySocialProofCopy = {
  ko: {
    talentTitle: "이 곳의 인재들이 신뢰합니다.",
    companyTitle: "최고의 팀들과 함께하고 있습니다.",
    testimonial:
      "Harper는 최고의 채용파트너입니다. 까다로운 조건을 붙였지만 모든 조건을 만족하는 사람을 한달만에 20명을 연결받았고, 채용까지 바로 이어졌습니다.",
  },
  en: {
    talentTitle: "Trusted by talent from",
    companyTitle: "Working with exceptional teams",
    testimonial:
      "Harper is the best recruiting partner we have worked with. We had a demanding set of requirements, and within a month Harper introduced us to 20 people who met every one of them—leading directly to a hire.",
  },
} as const;

export function CompanyTalentLogoTile({ logo }: { logo: CompanyTalentLogo }) {
  return (
    <div className="group flex h-full items-center justify-center rounded-sm border border-neutral-200 bg-neutral-200/80 px-3 md:px-4">
      <span
        className="relative block h-7 max-w-full opacity-75 grayscale transition group-hover:opacity-100 group-hover:grayscale-0 md:h-8"
        style={{ width: logo.width }}
      >
        <Image
          src={logo.src}
          alt={logo.name}
          fill
          sizes={`(min-width: 768px) ${logo.width}px, 96px`}
          className="object-contain"
        />
      </span>
    </div>
  );
}
