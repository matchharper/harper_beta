import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { HarperMark, useC } from "./primitives";
import { tw } from "./tw";

/**
 * Harper 소개 문단. 스크롤을 따라 단어가 차례로 또렷해진다.
 * 각 문단의 첫 문장은 잉크색, 나머지는 한 단계 옅은 색으로 끝난다.
 */

type Word = { text: string; strong: boolean };

function toWords(text: string, strong: boolean): Word[] {
  return text
    .split(/(\s+)/)
    .filter((part) => part.length > 0 && !/^\s+$/.test(part))
    .map((part) => ({ text: part, strong }));
}

/** Harper 소개 문단. 한국어·영어를 `c("한글", "English")`로 나란히 적는다. */
function useIntroCopy() {
  const c = useC();
  return {
    eyebrow: c("Harper를 소개합니다", "Introducing Harper"),
    lead: c(
      "요즘 이직은 할 일이 너무 많습니다.",
      "Changing jobs takes too much work."
    ),
    problem: c(
      " 공고를 찾고, 회사를 알아보고, 지원서를 고쳐 쓰고, 답장을 기다리고, 면접 일정을 맞추는 것까지 전부 직접 해야 하죠. 지금 하는 일만으로도 바쁜데요. 그래서 정말 좋은 기회는 대부분 모르는 사이에 지나갑니다.",
      " You hunt for openings, research companies, rewrite your resume, wait on replies and juggle interview times, all while doing your actual job. So most great opportunities slip by before you ever hear about them."
    ),
    answerLead: c(
      "Harper는 이 일을 대신하는 커리어 에이전트입니다.",
      "Harper is a career agent that does that work for you."
    ),
    answer: c(
      " 한 번 들은 이야기는 기억하고, 채용 사이트 밖까지 찾아보고, 지원서를 쓰고, 공고가 없는 회사에는 먼저 연락합니다. 결과를 보고 고르기만 하면 됩니다.",
      " It remembers what you tell it, searches beyond job boards, writes your applications and reaches out to companies that haven’t posted a role yet. You just review and decide."
    ),
  };
}

export function IntroStatement() {
  const copy = useIntroCopy();
  const ref = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.55"],
  });
  const paragraphs = [
    [...toWords(copy.lead, true), ...toWords(copy.problem, false)],
    [...toWords(copy.answerLead, true), ...toWords(copy.answer, false)],
  ];
  const total = paragraphs[0].length + paragraphs[1].length;
  const offsets = [0, paragraphs[0].length];

  return (
    <section className="relative py-24 md:py-40">
      <div className={cn(tw.shell, "max-w-[840px]")}>
        <div className="flex items-center gap-2.5 text-[14px] font-medium text-action">
          {copy.eyebrow}
        </div>
        <div ref={ref} className="mt-8 flex flex-col gap-8 md:mt-10 md:gap-10">
          {paragraphs.map((words, paragraphIndex) => (
            <p key={paragraphIndex} className={tw.statement}>
              {words.map((word, wordIndex) => {
                const index = offsets[paragraphIndex] + wordIndex;
                return (
                  <ScrollWord
                    key={`${paragraphIndex}-${wordIndex}`}
                    word={word}
                    progress={scrollYProgress}
                    start={index / total}
                    end={(index + 1.5) / total}
                    still={Boolean(reducedMotion)}
                  />
                );
              })}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScrollWord({
  word,
  progress,
  start,
  end,
  still,
}: {
  word: Word;
  progress: MotionValue<number>;
  start: number;
  end: number;
  still: boolean;
}) {
  const opacity = useTransform(progress, [start, end], [0.16, 1]);
  return (
    <>
      <motion.span
        style={{ opacity: still ? 1 : opacity }}
        className={word.strong ? "text-(--tl-ink)" : "text-[#7c7c82]"}
      >
        {word.text}
      </motion.span>{" "}
    </>
  );
}
