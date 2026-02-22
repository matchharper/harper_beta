"use client";

import React from "react";
import { motion, type Variants } from "framer-motion";
import RotatingOrbTiles from "@/components/landing/Orbit";

const fadeSlide: Variants = {
  hidden: (dir: "left" | "right") => ({
    opacity: 0,
    x: dir === "left" ? -45 : 45,
    y: 0,
  }),
  show: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1], // nice "easeOut"
    },
  },
};

const RowImageSection = ({
  label,
  title,
  desc,
  imageSrc,
  opposite = false,
  padding = false,
}: {
  label: string;
  title: string;
  desc: string;
  imageSrc: string;
  opposite?: boolean;
  padding?: boolean;
}) => {
  const mediaFrom: "left" | "right" = opposite ? "right" : "left";
  const textFrom: "left" | "right" = opposite ? "left" : "right";

  return (
    <div
      className={`flex flex-col md:flex-row justify-center items-center w-full max-w-full md:gap-[60px] gap-6 mb-8 md:mt-0 ${opposite ? "flex-col md:flex-row-reverse" : ""} px-5 md:px-0`}
    >
      {/* media */}
      <motion.div
        className="h-[26vw] min-h-[250px] md:min-h-[380px] w-full flex relative overflow-hidden justify-end items-end rounded-3xl bg-white/10 md:bg-white/5"
        variants={fadeSlide}
        custom={mediaFrom}
        initial="hidden"
        whileInView="show"
        viewport={{ once: false, amount: 0.35 }}
        transition={{ delay: 1.05 }} // 살짝 텍스트가 늦게 오게(선택)
      >
        {imageSrc === "orbit" ? (
          <RotatingOrbTiles />
        ) : (
          <video
            src={imageSrc}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        )}
      </motion.div>

      {/* text */}
      <motion.div
        className="flex flex-col items-start justify-start w-full text-left gap-3"
        variants={fadeSlide}
        custom={textFrom}
        initial="hidden"
        whileInView="show"
        viewport={{ once: false, amount: 0.35 }}
        transition={{ delay: 1.25 }} // 살짝 텍스트가 늦게 오게(선택)
      >
        {/* <div className="font-hedvig md:text-base text-sm text-accenta1">{label}</div> */}
        <h3
          className="text-[26px] md:text-[32px] font-normal leading-[2.2rem] md:leading-[2.5rem]"
          dangerouslySetInnerHTML={{ __html: title }}
        />
        <div
          className="text-[15px] md:text-base leading-6 font-light text-hgray700 mt-2"
          dangerouslySetInnerHTML={{ __html: desc }}
        />
      </motion.div>
    </div>
  );
};

export default React.memo(RowImageSection);
