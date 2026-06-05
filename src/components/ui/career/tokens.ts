export type CareerTone =
  | "neutral"
  | "primary"
  | "critical"
  | "positive"
  | "media"
  | "inherit";

export type CareerStatus = "default" | "loading" | "disabled";

export const careerToneClassNames = {
  neutral: {
    solid: "bg-[#F3F1EE] text-black",
    faded: "bg-[#F8F7F5] text-black",
    outline: "border border-[#1F1C1A1A] bg-transparent text-[#1F1C1A]",
    ghost: "bg-transparent text-[#1F1C1A]",
  },
  primary: {
    solid: "bg-[#753B17] text-white",
    faded: "bg-[#F2DFCE] text-[#753B17]",
    outline: "border border-[#F2DFCE] bg-transparent text-[#753B17]",
    ghost: "bg-transparent text-[#753B17]",
  },
  critical: {
    solid: "bg-[#9B2E1E] text-white",
    faded: "bg-[#FFEDEA] text-[#9B2E1E]",
    outline: "border border-[#FFDDD7] bg-transparent text-[#9B2E1E]",
    ghost: "bg-transparent text-[#9B2E1E]",
  },
  positive: {
    solid: "bg-[#226939] text-white",
    faded: "bg-[#EBFFF3] text-[#226939]",
    outline: "border border-[#D4F3DE] bg-transparent text-[#226939]",
    ghost: "bg-transparent text-[#226939]",
  },
  media: {
    solid: "bg-white text-black",
    faded: "bg-black/25 text-white",
    outline: "border border-white/30 bg-transparent text-white",
    ghost: "bg-transparent text-white",
  },
  inherit: {
    solid: "bg-white text-black",
    faded: "bg-white/15 text-white",
    outline: "border border-white/30 bg-transparent text-white",
    ghost: "bg-transparent text-white",
  },
} as const;

export const careerDisabledClassName =
  "border border-[#F3F1EE] bg-[#F8F7F5] text-[#CEC8C1]";
