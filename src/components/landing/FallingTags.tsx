"use client";

import { motion } from "framer-motion";
import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";

type Tag = {
  label: string;
  x: number;
  y: number;
  rotate: number;
};

const TAGS: Tag[] = [
  {
    label: "TTS Researchers",
    x: -120,
    y: 40,
    rotate: -14,
  },
  {
    label: "Agent Engineer",
    x: -40,
    y: -10,
    rotate: -10,
  },
  {
    label: "LLM optimization experts",
    x: -25,
    y: 50,
    rotate: -4,
  },
  {
    label: "Exp 4+ years machine learning engineer",
    x: 40,
    y: 5,
    rotate: 6,
  },
  {
    label: "Ex Founder  / CTO Backend Engineer",
    x: 10,
    y: -35,
    rotate: 20,
  },
  {
    label: "IVY League CS ms degree",
    x: 80,
    y: 40,
    rotate: 30,
  },
  {
    label: "C++ expert and hacker style",
    x: 140,
    y: 20,
    rotate: 10,
  },
];

const CANDIDATE_TAGS: Tag[] = [
  {
    label: "San Francisco 기반 스타트업",
    x: -120,
    y: 40,
    rotate: -14,
  },
  {
    label: "Early-stage CTO 역할",
    x: -40,
    y: -10,
    rotate: -10,
  },
  {
    label: "LLM optimization experts",
    x: -25,
    y: 50,
    rotate: -4,
  },
  {
    label: "1억 이상 연봉 제안",
    x: 10,
    y: 5,
    rotate: 6,
  },
  {
    label: "AI Labs Research Intern",
    x: 10,
    y: -35,
    rotate: 20,
  },
  {
    label: "Applied ML Engineer",
    x: 80,
    y: 40,
    rotate: 30,
  },
  {
    label: "Software Engineer at 10M+ ARR",
    x: 140,
    y: 20,
    rotate: 10,
  },
];
const CANDIDATE_MOBILE_TAGS: Tag[] = [
  {
    label: "San Francisco 기반 스타트업",
    x: -60,
    y: 40,
    rotate: -14,
  },
  {
    label: "Early-stage CTO 역할",
    x: -40,
    y: -10,
    rotate: -10,
  },
  {
    label: "LLM optimization experts",
    x: 5,
    y: 50,
    rotate: -4,
  },
  {
    label: "1억 이상 연봉 제안",
    x: 10,
    y: 5,
    rotate: 6,
  },
  {
    label: "AI Labs Research Intern",
    x: 60,
    y: -20,
    rotate: 20,
  },
  {
    label: "Applied ML Engineer",
    x: 80,
    y: 40,
    rotate: 30,
  },
  {
    label: "Software Engineer at 10M+ ARR",
    x: 140,
    y: 20,
    rotate: 10,
  },
];

export const FallingTags = ({
  theme = "transparent",
  startDelay = 2000,
}: {
  theme?: string;
  startDelay?: number;
}) => {
  const [start, setStart] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const t = setTimeout(() => setStart(true), startDelay);
    return () => clearTimeout(t);
  }, []);

  const tags =
    theme === "white"
      ? isMobile
        ? CANDIDATE_MOBILE_TAGS
        : CANDIDATE_TAGS
      : TAGS;

  return (
    <div className="md:relative absolute bottom-28 left-0 md:bottom-auto md:left-auto flex w-full justify-center overflow-visible">
      {tags.map((tag, index) => {
        if (isMobile && index === TAGS.length - 1) {
          return null;
        }

        return (
          <motion.div
            key={tag.label}
            className="absolute"
            initial={{
              y: -220,
              x: 0,
              rotate: 0,
              opacity: 0,
              scale: 0.8,
            }}
            animate={
              start
                ? {
                    x: tag.x,
                    y: tag.y,
                    rotate: tag.rotate,
                    opacity: 1,
                    scale: 1,
                  }
                : {
                    // 시작 전 상태 그대로 유지
                    y: -220,
                    opacity: 0,
                  }
            }
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 22,
              mass: 0.8,
              delay: index * 0.12,
            }}
          >
            <motion.div
              className={`select-none rounded-lg pl-2 pr-4 py-2 text-[10px] md:text-xs font-medium shadow-xl \
                flex flex-row items-center justify-start gap-1.5 cursor-grab \
                active:cursor-grabbing border ${
                  theme === "white"
                    ? "bg-white border-gray-400/50 text-xgray700"
                    : "bg-gray-500/10 border-white/10 text-white"
                } backdrop-blur-sm`}
              drag
              dragElastic={0.25}
              dragMomentum
              dragSnapToOrigin
              whileDrag={{ scale: 1.05, zIndex: 50 }}
            >
              <Search size={12} />
              <span>{tag.label}</span>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
};
