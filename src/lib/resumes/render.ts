import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "playwright-core";
import type { ResumeContent, ResumeEntry } from "./schema";

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

let fonts: Promise<string> | undefined;
function embeddedFonts() {
  return (fonts ??= (async () => {
    return (
      await Promise.all(
        [400, 700].map(async (weight) => {
          const cssPath = path.join(
            process.cwd(),
            "node_modules",
            "@fontsource",
            "noto-sans-kr",
            `${weight}.css`
          );
          let css = (await readFile(cssPath, "utf8")).replace(
            /, url\([^)]*\.woff\) format\('woff'\)/g,
            ""
          );
          const matches = [...css.matchAll(/url\(([^)]+)\)/g)];
          for (const m of matches) {
            const relative = m[1].replace(/["']/g, "");
            const buffer = await readFile(
              path.resolve(path.dirname(cssPath), relative)
            );
            css = css.replace(
              m[0],
              `url(data:font/woff2;base64,${buffer.toString("base64")})`
            );
          }
          return css;
        })
      )
    ).join("\n");
  })());
}

export async function renderResumePdf(
  content: ResumeContent
): Promise<{ pdf: Buffer; pageCount: number; text: string }> {
  let browser: Browser | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    const [{ chromium: playwright }, fontCss] = await Promise.all([
      import("playwright-core"),
      embeddedFonts(),
    ]);
    const linux = process.platform === "linux";
    const serverless = linux
      ? (await import("@sparticuz/chromium")).default
      : null;
    const executablePath =
      process.env.RESUME_CHROMIUM_EXECUTABLE_PATH ||
      (serverless
        ? await serverless.executablePath()
        : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    if (expired) throw new Error("PDF rendering timed out.");
    browser = await playwright.launch({
      executablePath,
      args: serverless?.args,
      headless: true,
      timeout: 20_000,
    });
    if (expired) {
      await browser.close();
      throw new Error("PDF rendering timed out.");
    }
    const context = await browser.newContext({
      javaScriptEnabled: true,
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(resumeHtml(content, fontCss), {
      waitUntil: "load",
      timeout: 15_000,
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
      const text = document.body.innerText;
      const loaded = await Promise.all([
        document.fonts.load('400 14px "Noto Sans KR"', text),
        document.fonts.load('700 14px "Noto Sans KR"', text),
      ]);
      if (
        loaded.some((x) => !x.length) ||
        [...document.fonts].some((f) => f.status === "error")
      )
        throw new Error("Resume font failed to load.");
    });
    const pdf = await page.pdf({
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
    });
    // The same display blocks feed PDF and text. Validate extraction before publishing.
    const { getPath } = await import("pdf-parse/worker");
    const { PDFParse } = await import("pdf-parse");
    PDFParse.setWorker(getPath());
    const parser = new PDFParse({ data: new Uint8Array(pdf) });
    let parsed;
    try {
      parsed = await parser.getText({
        pageJoiner: "\n",
        parseHyperlinks: false,
      });
    } finally {
      await parser.destroy();
    }
    const compact = (s: string) => s.normalize("NFKC").replace(/\s/g, "");
    const extracted = compact(parsed.text);
    if (
      !parsed.total ||
      resumeBlocks(content).some((x) => !extracted.includes(compact(x.text)))
    )
      throw new Error(
        "PDF text validation failed; the previous document was preserved."
      );
    return {
      pdf,
      pageCount: parsed.total as number,
      text: resumePlainText(content),
    };
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error("PDF rendering timed out."));
        }, 30_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (browser) await browser.close().catch(() => {});
  }
}
