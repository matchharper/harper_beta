"use client";

import { motion } from "framer-motion";
import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMessages } from "@/i18n/useMessage";

type Tag = {
  label: string;
  x: number;
  y: number;
  rotate: number;
};

export const FallingTagsSmall = ({
  theme = "transparent",
  startDelay = 2000,
}: {
  theme?: string;
  startDelay?: number;
}) => {
  const [start, setStart] = useState(false);
  const isMobile = useIsMobile();
  const { m } = useMessages();

  const CANDIDATE_MOBILE_TAGS: Tag[] = [
    {
      label: "San Francisco 기반 스타트업",
      x: -60,
      y: 40,
      rotate: -14,
    },
    {
      label: "0 to 1 경험, 경력 3년차 이하 개발자",
      x: 5,
      y: 50,
      rotate: -4,
    },
    {
      label: "우리 회사 문화에 맞는 Backend Engineer",
      x: 0,
      y: 5,
      rotate: 6,
    },
    {
      label: "반도체 공장 후공정 업무 경험 2년 이상",
      x: 60,
      y: 0,
      rotate: 30,
    },
    {
      label: "Ex-FAANG engineer open to startup",
      x: 90,
      y: 40,
      rotate: 10,
    },
  ];

  useEffect(() => {
    const t = setTimeout(() => setStart(true), startDelay);
    return () => clearTimeout(t);
  }, []);

  const tags = CANDIDATE_MOBILE_TAGS;

  return (
    <div className="md:relative absolute bottom-28 left-0 md:bottom-auto md:left-auto flex w-full justify-center overflow-visible">
      {tags.map((tag, index) => {
        if (isMobile && index === CANDIDATE_MOBILE_TAGS.length - 1) {
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
                active:cursor-grabbing border ${theme === "white"
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
