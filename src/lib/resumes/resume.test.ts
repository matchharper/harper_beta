import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  parseResumeInput,
  resumeFileName,
  structureResume,
  type ResumeContent,
} from "./schema";
import { resumeHtml, resumePlainText, renderResumePdf } from "./render";

export const sample: ResumeContent = {
  language: "ko",
  basics: {
    name: "김하늘",
    email: "haneul@example.com",
    links: [{ label: "Portfolio", url: "https://example.com/projects" }],
  },
  experience: [
    {
      title: "프로덕트 매니저",
      organization: "예시 주식회사",
      period: "2022 - 현재",
      bullets: [
        "고객 인터뷰를 진행하고 문제 정의부터 출시 후 개선까지 담당했습니다.",
        "디자이너·개발자와 협업해 사용자 온보딩을 개선했습니다.",
      ],
    },
  ],
  education: [
    {
      title: "컴퓨터공학 학사",
      organization: "예시대학교",
      period: "2018 - 2022",
    },
  ],
  extracurricular: [
    {
      title: "제품 커뮤니티 운영",
      description: "실무 사례를 공유하는 정기 모임을 운영했습니다.",
    },
  ],
  skills: [
    { title: "업무 도구", items: ["SQL", "Figma", "Product Analytics"] },
  ],
};
const create = () => ({
  action: "create",
  document_name: "김하늘_이력서_PM",
  content: structuredClone(sample),
});

test("create/update contracts and private fields are enforced", () => {
  assert.equal(parseResumeInput(create()).action, "create");
  assert.throws(() =>
    parseResumeInput({ ...create(), document_name: undefined })
  );
  assert.throws(() =>
    parseResumeInput({
      ...create(),
      document_id: "c51c76d0-3a84-49b5-835a-dbc4c795980b",
    })
  );
  assert.throws(() => parseResumeInput({ ...create(), action: "update" }));
  assert.throws(() => parseResumeInput({ ...create(), is_public: true }));
  assert.throws(() =>
    parseResumeInput({ ...create(), user_id: "someone-else" })
  );
});

test("filename preserves identifying features and cannot become a path", () => {
  assert.equal(
    resumeFileName("이덕행_이력서_PM.pdf.pdf "),
    "이덕행_이력서_PM.pdf"
  );
  assert.equal(
    resumeFileName("Deokhaeng_Lee_Resume_Openrouter"),
    "Deokhaeng_Lee_Resume_Openrouter.pdf"
  );
  assert.equal(resumeFileName("../private/이력서"), ".._private_이력서.pdf");
  assert.throws(() => resumeFileName(".pdf"));
});

test("stable entry IDs survive revision, unknown IDs cannot be injected", () => {
  const original = structureResume(parseResumeInput(create()));
  const edited = structureResume(
    {
      ...parseResumeInput(create()),
      action: "update",
      content: structuredClone(original.content),
    },
    original
  );
  assert.equal(
    original.content.experience![0].id,
    edited.content.experience![0].id
  );
  assert.throws(() =>
    structureResume({
      ...parseResumeInput(create()),
      content: original.content,
    })
  );
});

test("renderer escapes HTML, rejects unsafe links, keeps only visible facts", () => {
  const content = {
    ...sample,
    projects: [
      { title: "Project", description: '<script>alert("hello")</script>' },
    ],
  };
  const html = resumeHtml(content, "");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(resumePlainText(content).includes(content.projects[0].description));
  assert.throws(() =>
    parseResumeInput({
      ...create(),
      content: {
        ...sample,
        basics: {
          name: "X",
          links: [{ label: "x", url: "file:///etc/passwd" }],
        },
      },
    })
  );
});

test(
  "real Chromium Korean and multi-page PDFs retain every block",
  { skip: process.env.RESUME_PDF_TEST !== "1" },
  async () => {
    const single = await renderResumePdf(sample);
    assert.equal(single.pageCount, 1);
    const english = await renderResumePdf({
      language: "en",
      basics: {
        name: "Haneul Kim",
        links: [
          {
            label: "Portfolio",
            url: `https://example.com/${"long-path".repeat(35)}`,
          },
        ],
      },
      experience: [
        {
          title: "Product Manager",
          organization: "Example",
          bullets: [
            "Led customer research and worked with designers and engineers.",
          ],
        },
      ],
    });
    assert.equal(english.pageCount, 1);
    const long: ResumeContent = {
      ...sample,
      experience: Array.from({ length: 18 }, (_, i) => ({
        title: `Senior Product Manager ${i + 1}`,
        organization: `한영 혼합 조직 ${i + 1}`,
        period: "2020 - 2025",
        bullets: Array.from(
          { length: 4 },
          (_, n) =>
            `${n + 1}. 고객 인터뷰와 데이터 분석을 통해 제품 개선 방향을 정리했습니다. Cross-functional collaboration and delivery.`
        ),
      })),
    };
    const multiple = await renderResumePdf(long);
    assert.ok(multiple.pageCount > 1);
    await mkdir("output/resume-test/pdfs", { recursive: true });
    await writeFile("output/resume-test/pdfs/resume-ko.pdf", single.pdf);
    await writeFile("output/resume-test/pdfs/resume-en.pdf", english.pdf);
    await writeFile("output/resume-test/pdfs/resume-long.pdf", multiple.pdf);
    console.info({
      singlePages: single.pageCount,
      longPages: multiple.pageCount,
    });
  }
);

test("optional empty facts are omitted but required facts remain validated", () => {
  const input = create();
  input.content.projects = [
    { title: "Project", period: "", location: "  ", description: "Known fact" },
  ];
  const parsed = parseResumeInput(input);
  assert.equal(parsed.content.projects![0].period, undefined);
  assert.equal(parsed.content.projects![0].location, undefined);
  assert.equal(input.content.projects[0].period, "");
  assert.throws(() =>
    parseResumeInput({
      ...input,
      content: { ...input.content, basics: { name: "" } },
    })
  );
  assert.throws(() =>
    parseResumeInput({
      ...input,
      content: { ...input.content, projects: [{ title: "" }] },
    })
  );
});

test("legacy summary is omitted from edited JSON, PDF HTML and plain text", () => {
  const content = { ...sample, summary: "Legacy summary text" };
  const parsed = parseResumeInput({ ...create(), content });
  assert.ok(!("summary" in parsed.content));
  assert.ok(!resumeHtml(content, "").includes("Legacy summary text"));
  assert.ok(!resumePlainText(content).includes("Legacy summary text"));
  assert.ok(!resumeHtml(content, "").includes(">소개<"));
});
