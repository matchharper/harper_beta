import type { ResumeContent, ResumeEntry } from "./schema";

export const RESUME_RENDER_VERSION = "a4-single-column-v7";

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

// Keep stored URLs intact; only shorten their visible contact text.
function contactLinks(content: ResumeContent) {
  return (content.basics.links ?? []).flatMap(link => {
    const url = link.url?.trim();
    if (!url) return [];
    return [{ url, display: url.replace(/^https?:\/\//i, "") }];
  });
}

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
  contactLinks(content).forEach(link => add("text", link.display));
  const ko = content.language === "ko";
  const entries = (items: ResumeEntry[], organizationFirst = false) =>
    items.forEach((x) => {
      add("heading", organizationFirst ? x.organization || x.title : x.title);
      add("text", x.period);
      add("text", organizationFirst ? (x.organization ? x.title : undefined) : x.organization);
      add("text", x.location);
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
      entries(content[key]!, key === "education" || key === "experience");
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
    .map((x) => (x.kind === "bullet" ? `• ${x.text}` : x.text))
    .join("\n\n");
}

export function resumeHtml(content: ResumeContent, fontCss: string) {
  const text = (value?: string) => escape(value?.trim() ?? "");
  const entries = (items: ResumeEntry[], organizationFirst = false) => items.map(entry => {
    const heading = organizationFirst ? entry.organization || entry.title : entry.title;
    const subtitle = organizationFirst ? (entry.organization ? entry.title : undefined) : entry.organization;
    return `<article class="entry">
      <div class="entry-header">
        <div class="entry-row"><h3>${text(heading)}</h3>${entry.period ? `<p class="entry-meta">${text(entry.period)}</p>` : ""}</div>
        ${subtitle || entry.location ? `<div class="entry-row entry-subtitle">${subtitle ? `<p>${text(subtitle)}</p>` : "<span></span>"}${entry.location ? `<p class="entry-meta">${text(entry.location)}</p>` : ""}</div>` : ""}
      </div>
      ${entry.description ? `<p>${text(entry.description)}</p>` : ""}
      ${entry.bullets?.length ? `<ul role="list">${entry.bullets.map(b => `<li><span class="bullet-mark" aria-hidden="true">•</span>${text(b)}</li>`).join("")}</ul>` : ""}
      ${entry.url ? `<p class="entry-url">${text(entry.url)}</p>` : ""}
    </article>`;
  }).join("");
  const section = (title: string, body: string) => `<section><h2>${text(title)}</h2>${body}</section>`;
  const ko = content.language === "ko";
  const sections = ([
    ["education", ko ? "학력" : "Education"],
    ["experience", ko ? "경력" : "Experience"],
    ["projects", ko ? "프로젝트" : "Projects"],
    ["extracurricular", ko ? "대외활동" : "Activities"],
  ] as const).flatMap(([key, title]) => content[key]?.length
    ? [section(title, entries(content[key]!, key === "education" || key === "experience"))] : []);
  if (content.skills?.length) sections.push(section(ko ? "기술" : "Skills",
    `<div class="skills">${content.skills.map(skill => `<p><strong>${text(skill.title)}:</strong> ${text(skill.items.join(", "))}</p>`).join("")}</div>`));
  content.additional_sections?.forEach(s => {
    if (s.entries.length) sections.push(section(s.title, entries(s.entries)));
  });
  const contact = [content.basics.email, content.basics.phone, content.basics.location].filter(Boolean).join(" · ");
  return `<!doctype html><html lang="${content.language}"><head><meta charset="utf-8"><style>${fontCss}
  @page { size: A4 portrait; margin: 12mm 13mm; }
  * { box-sizing: border-box; }
  html { font-family: 'Noto Sans KR', sans-serif; font-size: 10pt; color: #111; background: #fff; }
  body { margin: 0; line-height: 1.3; }
  header { text-align: center; margin-bottom: 12pt; }
  h1 { font-size: 25pt; line-height: 1.15; margin: 0 0 4pt; }
  .contacts { text-align: center; font-size: 9pt; line-height: 1.4; }
  .contact { display: inline; }
  h2 { font-size: 11pt; font-weight: 400; margin: 10pt 0 4pt; padding-bottom: 2pt; border-bottom: .6pt solid #555; }
  h3 { font-size: 10pt; font-weight: 700; margin: 0; }
  h1,h2,.entry-header { break-inside: avoid; break-after: avoid; page-break-after: avoid; }
  p { margin: 0; white-space: pre-wrap; orphans: 2; widows: 2; }
  h1,h2,h3,p,li,.contact { overflow-wrap: anywhere; word-break: normal; }
  .entry { margin: 0 4pt 5pt 10pt; }
  .entry-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12pt; }
  .entry-row > :first-child { min-width: 0; flex: 1; }
  .entry-meta { flex: 0 1 auto; max-width: 38%; text-align: right; }
  .entry-subtitle { font-style: italic; margin-top: 1pt; }
  ul { list-style: none; margin: 2pt 0 0; padding-left: 17pt; }
  li { position: relative; margin: 0 0 1pt; padding-left: 1pt; white-space: pre-wrap; orphans: 2; widows: 2; }
  .bullet-mark { position: absolute; left: -11pt; font-size: .85em; }
  .entry-url { font-size: 9pt; margin-top: 2pt; }
  .skills { margin-left: 10pt; }
  </style></head><body><header><h1>${text(content.basics.name)}</h1>
  <div class="contacts">${[...(contact ? [contact] : []), ...contactLinks(content).map(link => link.display)].map(value => `<span class="contact">${text(value)}</span>`).join(" · ")}</div></header>${sections.join("")}</body></html>`;
}
