"use client";

import React from "react";
import Image from "next/image";
import {
  Search,
  Users,
  Briefcase,
  GraduationCap,
  Handshake,
} from "lucide-react";
import { BaseSectionLayout } from "@/components/landing/GridSectionLayout";
import Head1 from "@/components/landing/Head1";
import Animate from "@/components/landing/Animate";

type Stat = { label: string; value: string };

type UseCaseCardItem = {
  key: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  stats: Stat[];
  queryPlaceholder: string;
  avatars?: string[];
  ctaLabel?: string;
  onCtaClick?: () => void;
};

const Metric = ({ label, value }: Stat) => {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] md:text-xs text-white/45 font-light">
        {label}
      </div>
      <div className="text-[14px] md:text-[15px] text-white/85 font-medium">
        {value}
      </div>
    </div>
  );
};

const QueryExample = ({
  placeholder,
  avatars = [],
}: {
  placeholder: string;
  avatars?: string[];
}) => {
  return (
    <div className="mt-5">
      <div className="text-[12px] md:text-[13px] text-white/40 font-light mb-2 flex flex-row items-center gap-1">
        <Search className="w-3 h-3 text-white/40" />
        쿼리 예시
      </div>

      <div className="flex items-center text-sm">{placeholder}</div>

      {avatars.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          {avatars.slice(0, 5).map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="w-5 h-5 rounded-full overflow-hidden ring-1 ring-white/10 bg-white/5"
            >
              <Image src={src} alt={`avatar-${i}`} width={28} height={28} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const UseCaseCard = ({ item }: { item: UseCaseCardItem }) => {
  return (
    <div
      className="
        w-full
        rounded-2xl
        bg-white/[0.03]
        ring-1 ring-white/10
        shadow-[0_18px_60px_rgba(0,0,0,0.35)]
        px-6 md:px-7
        py-6 md:py-7
        flex flex-col
        min-h-[280px]
      "
    >
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
          {item.icon}
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[18px] md:text-[20px] font-medium text-white/90">
            {item.title}
          </div>
          <div className="text-[13px] md:text-[14px] font-light text-white/55 leading-relaxed">
            {item.desc}
          </div>

          <div className="mt-5 flex items-center gap-10">
            {item.stats.slice(0, 2).map((s) => (
              <Metric key={s.label} label={s.label} value={s.value} />
            ))}
          </div>

          <QueryExample
            placeholder={item.queryPlaceholder}
            avatars={item.avatars}
          />

          <button
            type="button"
            onClick={item.onCtaClick}
            className="
    mt-auto pt-6
    text-left
    text-[12px] md:text-[13px]
    text-white/70
    hover:text-white/90
    transition
  "
          >
            {item.ctaLabel ?? "찾으러 가기 →"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function UseCaseGridSection({
  title = "누구나 찾을 수 있습니다.",
  subtitle = "생각하는 모든 형태의 검색이 가능해요.",
  items,
}: {
  title?: string;
  subtitle?: string;
  items?: UseCaseCardItem[];
}) {
  const defaultItems: UseCaseCardItem[] = [
    {
      key: "part_time_marketer",
      icon: <Users className="w-5 h-5 text-white/80" />,
      title: "파트타임 마케터",
      desc: "해외진출을 위한 파트타임 마케터를 찾아, 초기 제품의 성장을 함께 이끌어보세요.",
      stats: [
        { label: "마케팅 프로필", value: "120K+" },
        { label: "조건 만족 여부", value: "90%" },
      ],
      queryPlaceholder:
        "일본 문화에 대한 이해도가 높고 주 2–3일 근무 가능한 5년차 이상 콘텐츠 마케터를 찾으세요…",
      avatars: [
        "/images/profiles/avatar1.png",
        "/images/profiles/avatar2.png",
        "/images/profiles/avatar3.png",
      ],
    },
    {
      key: "deep_learning_researcher",
      icon: <GraduationCap className="w-5 h-5 text-white/80" />,
      title: "딥러닝 리서처",
      desc: "채용 시장에 나오지 않은 뛰어난 연구자를 찾아 AI 역량을 강화하세요.",
      stats: [
        { label: "AI 연구 인재", value: "85K+" },
        { label: "논문·프로젝트 분석", value: "정밀 매칭" },
      ],
      queryPlaceholder:
        "10M+ 멀티모달 데이터셋을 구축하고, deduplication·quality scoring·hard negative mining 파이프라인을 설계해본 리서처…",
      avatars: [
        "/images/profiles/avatar4.png",
        "/images/profiles/avatar5.png",
        "/images/profiles/avatar6.png",
      ],
    },
    {
      key: "developer",
      icon: <Briefcase className="w-5 h-5 text-white/80" />,
      title: "개발자",
      desc: "스타트업에 바로 기여할 수 있는 실전 경험 중심의 개발자를 빠르게 찾으세요.",
      stats: [
        { label: "엔지니어 프로필", value: "300K+" },
        { label: "스킬 매칭 정확도", value: "94%" },
      ],
      queryPlaceholder:
        "Rust 기반 서비스 운영 경험이 있고, GitHub 1K+ stars 프로젝트 기여 또는 주요 오픈소스 PR merge 경험이 있는 풀스택 개발자…",
      avatars: ["/images/profiles/avatar7.png", "/images/profiles/avatar8.png"],
    },
    {
      key: "recent_funded_founder",
      icon: <Handshake className="w-5 h-5 text-white/80" />,
      title: "최근 투자받은 스타트업 Founder",
      desc: "최근 투자 유치 후 팀을 확장 중인 창업자를 찾아 협업·영업·네트워킹 기회를 만드세요.",
      stats: [
        { label: "투자 유치 기업", value: "1.2K+" },
        { label: "투자 단계 필터", value: "Seed–Series B" },
      ],
      queryPlaceholder:
        "최근 6개월 내 Seed 또는 Series A 투자를 받은 AI SaaS 스타트업 Founder…",
      avatars: [
        "/images/profiles/avatar9.png",
        "/images/profiles/avatar10.png",
      ],
    },
  ];

  const data = items?.length ? items : defaultItems;

  return (
    <Animate>
      <BaseSectionLayout>
        <div className="w-full flex flex-col items-start justify-center text-left px-4 md:px-0">
          <Head1 className="text-white">{title}</Head1>
          <div className="text-sm md:text-base text-white/55 font-light mt-6 max-w-[720px]">
            {subtitle}
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7">
            {data.map((item) => (
              <UseCaseCard key={item.key} item={item} />
            ))}
          </div>
        </div>
      </BaseSectionLayout>
    </Animate>
  );
}
