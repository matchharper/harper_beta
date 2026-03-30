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
  color: string;
};

export const FallingTagsMl = ({
  theme = "dark",
  startDelay = 2000,
}: {
  theme?: "dark" | "white" | "transparent";
  startDelay?: number;
}) => {
  const [start, setStart] = useState(false);
  const isMobile = useIsMobile();
  const CANDIDATE_MOBILE_TAGS: Tag[] = [
    {
      label:
        "Open-source note-taking projects with 5k+ stars and recent activity",
      x: -140,
      y: 40,
      rotate: -14,
      color: "bg-emerald-400/80",
    },
    {
      label: "Papers on multimodal LLM datasets from CVPR or NeurIPS",
      x: 5,
      y: 70,
      rotate: -4,
      color: "bg-sky-400/80",
    },
    {
      label: "Repositories focused on inference or kernel optimization",
      x: 70,
      y: -10,
      rotate: 10,
      color: "bg-violet-400/80",
    },
    {
      label: "Robotics research with both publications and open-source code",
      x: 10,
      y: -5,
      rotate: -12,
      color: "bg-amber-400/80",
    },
    {
      label:
        "Active repositories with consistent commits and growing community",
      x: 140,
      y: 30,
      rotate: 10,
      color: "bg-rose-400/80",
    },
  ];

  useEffect(() => {
    const t = setTimeout(() => setStart(true), startDelay);
    return () => clearTimeout(t);
  }, [startDelay]);

  const tags = CANDIDATE_MOBILE_TAGS;

  return (
    <div className="absolute bottom-28 left-0 flex w-full justify-center overflow-visible md:relative md:bottom-auto md:left-auto">
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
              className={[
                "select-none rounded-lg px-2 py-2 md:px-3 md:py-2",
                "flex cursor-grab flex-row items-center justify-start gap-1.5",
                "text-xs font-medium shadow-xl md:text-sm",
                "active:cursor-grabbing backdrop-blur-md text-white",
                theme === "white" ? "bg-white/90" : "bg-neutral-900/75",
                tag.color,
              ].join(" ")}
              drag
              dragElastic={0.25}
              dragMomentum
              dragSnapToOrigin
              whileDrag={{ scale: 1.05, zIndex: 50 }}
            >
              <Search size={14} className={tag.color.split(" ")[1]} />
              <span>{tag.label}</span>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
};
