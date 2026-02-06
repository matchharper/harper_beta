'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { motion, AnimatePresence, type Transition } from 'motion/react';

import './RotatingText.css';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export type SplitBy = 'characters' | 'words' | 'lines' | string;
export type StaggerFrom = 'first' | 'last' | 'center' | 'random' | number;

export type RotatingTextHandle = {
  next: () => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  reset: () => void;
};

export type RotatingTextProps = Omit<
  React.ComponentPropsWithoutRef<typeof motion.span>,
  'children'
> & {
  texts: string[];

  transition?: Transition;
  initial?: Record<string, unknown>;
  animate?: Record<string, unknown>;
  exit?: Record<string, unknown>;

  animatePresenceMode?: 'sync' | 'wait' | 'popLayout';
  animatePresenceInitial?: boolean;

  rotationInterval?: number;

  staggerDuration?: number;
  staggerFrom?: StaggerFrom;

  loop?: boolean;
  auto?: boolean;

  splitBy?: SplitBy;

  onNext?: (nextIndex: number) => void;

  mainClassName?: string;
  splitLevelClassName?: string;
  elementLevelClassName?: string;
};

type WordObj = {
  characters: string[];
  needsSpace: boolean;
};

const RotatingText = forwardRef<RotatingTextHandle, RotatingTextProps>(
  (props, ref) => {
    const {
      texts,
      transition = { type: 'spring', damping: 25, stiffness: 300 },
      initial = { y: '100%', opacity: 0 },
      animate = { y: 0, opacity: 1 },
      exit = { y: '-120%', opacity: 0 },
      animatePresenceMode = 'wait',
      animatePresenceInitial = false,
      rotationInterval = 2000,
      staggerDuration = 0,
      staggerFrom = 'first',
      loop = true,
      auto = true,
      splitBy = 'characters',
      onNext,
      mainClassName,
      splitLevelClassName,
      elementLevelClassName,
      ...rest
    } = props;

    const [currentTextIndex, setCurrentTextIndex] = useState<number>(0);

    const splitIntoCharacters = (text: string): string[] => {
      // Grapheme-safe splitting when available
      if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        const Segmenter = (Intl as unknown as { Segmenter: typeof Intl.Segmenter })
          .Segmenter;
        const segmenter = new Segmenter('en', { granularity: 'grapheme' });
        return Array.from(segmenter.segment(text), (segment) => segment.segment);
      }
      return Array.from(text);
    };

    const elements = useMemo<WordObj[]>(() => {
      const safeTexts = texts.length > 0 ? texts : [''];
      const safeIndex = Math.min(currentTextIndex, safeTexts.length - 1);
      const currentText = safeTexts[safeIndex] ?? '';

      if (splitBy === 'characters') {
        const words = currentText.split(' ');
        return words.map((word, i) => ({
          characters: splitIntoCharacters(word),
          needsSpace: i !== words.length - 1,
        }));
      }

      if (splitBy === 'words') {
        return currentText.split(' ').map((word, i, arr) => ({
          characters: [word],
          needsSpace: i !== arr.length - 1,
        }));
      }

      if (splitBy === 'lines') {
        return currentText.split('\n').map((line, i, arr) => ({
          characters: [line],
          needsSpace: i !== arr.length - 1,
        }));
      }

      // Custom separator
      return currentText.split(String(splitBy)).map((part, i, arr) => ({
        characters: [part],
        needsSpace: i !== arr.length - 1,
      }));
    }, [texts, currentTextIndex, splitBy]);

    const getStaggerDelay = useCallback(
      (index: number, totalChars: number) => {
        const total = totalChars;

        if (staggerFrom === 'first') return index * staggerDuration;
        if (staggerFrom === 'last') return (total - 1 - index) * staggerDuration;

        if (staggerFrom === 'center') {
          const center = Math.floor(total / 2);
          return Math.abs(center - index) * staggerDuration;
        }

        if (staggerFrom === 'random') {
          const randomIndex = Math.floor(Math.random() * total);
          return Math.abs(randomIndex - index) * staggerDuration;
        }

        if (typeof staggerFrom === 'number') {
          return Math.abs(staggerFrom - index) * staggerDuration;
        }

        return Math.abs(index) * staggerDuration;
      },
      [staggerFrom, staggerDuration]
    );

    const handleIndexChange = useCallback(
      (newIndex: number) => {
        setCurrentTextIndex(newIndex);
        onNext?.(newIndex);
      },
      [onNext]
    );

    const next = useCallback(() => {
      if (texts.length === 0) return;

      const nextIndex =
        currentTextIndex === texts.length - 1
          ? loop
            ? 0
            : currentTextIndex
          : currentTextIndex + 1;

      if (nextIndex !== currentTextIndex) {
        handleIndexChange(nextIndex);
      }
    }, [currentTextIndex, texts.length, loop, handleIndexChange, texts]);

    const previous = useCallback(() => {
      if (texts.length === 0) return;

      const prevIndex =
        currentTextIndex === 0
          ? loop
            ? texts.length - 1
            : currentTextIndex
          : currentTextIndex - 1;

      if (prevIndex !== currentTextIndex) {
        handleIndexChange(prevIndex);
      }
    }, [currentTextIndex, texts.length, loop, handleIndexChange, texts]);

    const jumpTo = useCallback(
      (index: number) => {
        if (texts.length === 0) return;

        const validIndex = Math.max(0, Math.min(index, texts.length - 1));
        if (validIndex !== currentTextIndex) {
          handleIndexChange(validIndex);
        }
      },
      [texts.length, currentTextIndex, handleIndexChange, texts]
    );

    const reset = useCallback(() => {
      if (currentTextIndex !== 0) handleIndexChange(0);
    }, [currentTextIndex, handleIndexChange]);

    useImperativeHandle(
      ref,
      () => ({
        next,
        previous,
        jumpTo,
        reset,
      }),
      [next, previous, jumpTo, reset]
    );

    useEffect(() => {
      if (!auto) return;
      if (texts.length <= 1) return;

      const intervalId = window.setInterval(next, rotationInterval);
      return () => window.clearInterval(intervalId);
    }, [next, rotationInterval, auto, texts.length]);

    const safeTexts = texts.length > 0 ? texts : [''];
    const safeIndex = Math.min(currentTextIndex, safeTexts.length - 1);
    const srText = safeTexts[safeIndex] ?? '';

    const totalChars = elements.reduce((sum, w) => sum + w.characters.length, 0);

    return (
      <motion.span
        className={cn('text-rotate', mainClassName)}
        {...rest}
        layout
        transition={transition}
      >
        <span className="text-rotate-sr-only">{srText}</span>
        <AnimatePresence mode={animatePresenceMode} initial={animatePresenceInitial}>
          <motion.span
            key={safeIndex}
            className={cn(splitBy === 'lines' ? 'text-rotate-lines' : 'text-rotate')}
            layout
            aria-hidden="true"
          >
            {elements.map((wordObj, wordIndex, array) => {
              const previousCharsCount = array
                .slice(0, wordIndex)
                .reduce((sum, word) => sum + word.characters.length, 0);

              return (
                <span
                  key={wordIndex}
                  className={cn('text-rotate-word', splitLevelClassName)}
                >
                  {wordObj.characters.map((char, charIndex) => (
                    <motion.span
                      key={charIndex}
                      initial={initial}
                      animate={animate}
                      exit={exit}
                      transition={{
                        ...transition,
                        delay: getStaggerDelay(previousCharsCount + charIndex, totalChars),
                      }}
                      className={cn('text-rotate-element', elementLevelClassName)}
                    >
                      {char}
                    </motion.span>
                  ))}

                  {wordObj.needsSpace && <span className="text-rotate-space"> </span>}
                </span>
              );
            })}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    );
  }
);

RotatingText.displayName = 'RotatingText';
export default RotatingText;
