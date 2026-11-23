import type { ShareLinkSnapshot } from "./shared";

/**
 * The P.S. a candidate's mail to a company ends with: under their signature, in their own voice and in the mail's own
 * format, one sentence on what the summary page adds to the resume and the link. A plain mail stays plain text (no
 * box, no button), so the mail still reads as a 1:1 mail the candidate wrote. Code appends it (the link and its words
 * are exact content the candidate approved with 'Harper 후보 요약 링크 넣기', not model output).
 */

const COPY = {
  ko: {
    covers: (wants: boolean) => wants ? "제가 찾는 일과 조건, 이 자리와 맞는 점" : "경력 요약과 이 자리와 맞는 점",
    ps: (covers: string) => `P.S. 이력서에 다 담지 못한 내용(${covers})은 제 커리어 에이전트 Harper에 정리해 두었습니다. 로그인 없이 바로 보시고, 궁금한 점은 Harper에게 물어보실 수 있습니다.`,
    link: "후보 요약 및 Q&A 보기",
  },
  en: {
    covers: (wants: boolean) => wants ? "what I'm looking for and why this role fits" : "my background and why this role fits",
    ps: (covers: string) => `P.S. What my resume doesn't cover (${covers}) is summarized by my career agent, Harper. You can open it without signing in and ask Harper anything there.`,
    link: "Summary and Q&A",
  },
} as const;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] as string);

/** The P.S. as text (for a plain mail; the URL on its own line, which mail apps link) and as one unstyled paragraph. */
export function shareLinkMailPs(args: { snapshot: Pick<ShareLinkSnapshot, "wants">; url: string; language: "ko" | "en" }) {
  const copy = COPY[args.language];
  const ps = copy.ps(copy.covers(args.snapshot.wants.length > 0));
  return {
    text: `${ps}\n${copy.link}: ${args.url}`,
    html: `<p>${escapeHtml(ps)}<br><a href="${escapeHtml(args.url)}">${escapeHtml(copy.link)}</a></p>`,
  };
}
