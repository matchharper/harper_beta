"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const words = ["Data", "List", "Profile"];
const longest = words.reduce((a, b) => (a.length > b.length ? a : b), "");

function RotatingWord({ intervalMs = 2400 }: { intervalMs?: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % words.length);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [intervalMs]);

  return (
    <span className="relative inline-block align-baseline">
      {/* ✅ 폭을 잡아주는 더미 텍스트 (보이지 않지만 자리 차지) */}
      <span className="invisible">{longest}</span>

      {/* ✅ 실제 애니메이션 텍스트 (겹쳐서 교체) */}
      <span className="absolute left-0 top-0 h-[1.2em] pb-[0.01em] overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={words[index]}
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            exit={{ y: "-100%", opacity: 0 }}
            transition={{ duration: 0.36, ease: "easeOut" }}
            className="inline-block"
          >
            {words[index]}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}

export default RotatingWord;
