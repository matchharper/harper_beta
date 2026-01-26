import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useIsMobile } from "@/hooks/useIsMobile";

const ICONS = [
  "dropbox.svg",
  "drive.svg",
  "gitlab.svg",
  "huggingface.svg",
  "github.svg",
  "linkedin.svg",
  "notion.svg",
  "xcom.png",
  "scholar.png",
  "github.svg",
];

export default function OrbitIcons() {
  const isMobile = useIsMobile();

  const N = ICONS.length;
  const r = isMobile ? 180 : 280;
  const duration = 18;

  return (
    <div className="w-full flex items-center justify-center bg-white/0">
      <div className="flex items-center justify-center relative w-full h-[480px] rounded-3xl overflow-hidden">
        <motion.div
          className="flex items-center justify-center mt-[520px] md:mt-[480px]"
          style={{ width: 0, height: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration, ease: "linear", repeat: Infinity }}
        >
          {ICONS.map((Icon, i) => {
            const a = (i / N) * 360;
            return (
              <div
                key={i}
                className="absolute"
                style={{
                  transform: `rotate(${a}deg) translateX(${r}px) rotate(90deg)`,
                }}
              >
                <div className="md:w-16 md:h-16 w-12 h-12 rounded-2xl bg-white shadow-[0_14px_40px_rgba(0,0,0,0.55)] flex items-center justify-center">
                  <Image
                    src={`/images/logos/${Icon}`}
                    alt={Icon}
                    width={isMobile ? 24 : 32}
                    height={isMobile ? 24 : 32}
                    className="rounded-lg"
                  />
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
