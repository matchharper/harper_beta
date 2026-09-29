import type { ResumeContent, ResumeEntry } from "./schema";

export const RESUME_RENDER_VERSION = "a4-single-column-v4";

type Block = {
  kind: "name" | "section" | "heading" | "text" | "bullet";
  text: string;
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );

export function resumeBlocks(content: ResumeContent): Block[] {
  const blocks: Block[] = [];
  const add = (kind: Block["kind"], text?: string) => {
    if (text?.trim()) blocks.push({ kind, text: text.trim() });
  };
  add("name", content.basics.name);
  add(
    "text",
    [content.basics.email, content.basics.phone, content.basics.location]
      .filter(Boolean)
      .join(" · ")
  );
  content.basics.links?.forEach((x) => add("text", `${x.label}: ${x.url}`));
  const ko = content.language === "ko";
  const entries = (items: ResumeEntry[]) =>
    items.forEach((x) => {
      add("heading", [x.title, x.organization].filter(Boolean).join(" | "));
      add("text", [x.period, x.location].filter(Boolean).join(" · "));
      add("text", x.description);
      x.bullets?.forEach((b) => add("bullet", b));
      add("text", x.url);
    });
  for (const [key, title] of [
    ["education", ko ? "학력" : "Education"],
    ["experience", ko ? "경력" : "Experience"],
    ["projects", ko ? "프로젝트" : "Projects"],
    ["extracurricular", ko ? "대외활동" : "Activities"],
  ] as const) {
    if (content[key]?.length) {
      add("section", title);
      entries(content[key]!);
    }
  }
  if (content.skills?.length) {
    add("section", ko ? "기술" : "Skills");
    content.skills.forEach((x) =>
      add("text", `${x.title}: ${x.items.join(", ")}`)
    );
  }
  content.additional_sections?.forEach((s) => {
    if (s.entries.length) {
      add("section", s.title);
      entries(s.entries);
    }
  });
  return blocks;
}

export function resumePlainText(content: ResumeContent) {
  return resumeBlocks(content)
    .map((x) => (x.kind === "bullet" ? `- ${x.text}` : x.text))
    .join("\n\n");
}

export function resumeHtml(content: ResumeContent, fontCss: string) {
  const tags = {
    name: "h1",
    section: "h2",
    heading: "h3",
    text: "p",
    bullet: "p",
  };
  return `<!doctype html><html lang="${content.language}"><head><meta charset="utf-8"><style>${fontCss}
  @page { size: A4 portrait; margin: 16mm; }
  * { box-sizing: border-box; }
  html { font-family: 'Noto Sans KR'; font-size: 10.5pt; color: #111; background: #fff; }
  body { margin: 0; line-height: 1.5; }
  h1 { font-size: 22pt; margin: 0 0 5pt; line-height: 1.3; }
  h2 { font-size: 12pt; margin: 13pt 0 5pt; padding-bottom: 3pt; border-bottom: .6pt solid #aaa; }
  h3 { font-size: 10.5pt; margin: 8pt 0 3pt; }
  h1,h2,h3 { font-weight: 700; break-after: avoid; page-break-after: avoid; }
  p { margin: 0 0 4pt; white-space: pre-wrap; orphans: 2; widows: 2; }
  h1,h2,h3,p { overflow-wrap: anywhere; word-break: normal; }
  .bullet { padding-left: 10pt; text-indent: -8pt; }
  </style></head><body>${resumeBlocks(content)
    .map(
      (b) =>
        `<${tags[b.kind]} class="${b.kind}">${b.kind === "bullet" ? "- " : ""}${escape(b.text)}</${tags[b.kind]}>`
    )
    .join("")}</body></html>`;
}
