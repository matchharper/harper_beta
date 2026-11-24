"use client";
import { useState } from "react";

export type EmailChoicePreviewCase = {
  key: string;
  sample: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
  hrefs: Array<{ href: string; label: string }>;
};

const WIDTHS = [
  { key: "desktop", label: "PC", width: 720 },
  { key: "mobile", label: "모바일", width: 375 },
] as const;

/** The link with its encoded text spelled out, for reading only. */
function readable(href: string) {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

/** Opens links outside the frame and gives the email a mail-client-like page. */
function frameDocument(html: string) {
  return html.replace(
    "<head>",
    '<head><base target="_blank"><style>body{margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif;color:#222;background:#fff}</style>'
  );
}

export default function Preview({ cases }: { cases: EmailChoicePreviewCase[] }) {
  const [selected, setSelected] = useState(cases[0]?.key ?? "");
  const current = cases.find((item) => item.key === selected) ?? cases[0];
  if (!current) return null;
  return (
    <main className="min-h-screen bg-neutral-100 px-6 py-8 text-neutral-primary">
      <div className="mx-auto max-w-[1180px]">
        <h1 className="text-xl font-semibold">메일 선택지 버튼 미리보기</h1>
        <p className="mt-1 text-sm text-neutral-muted">
          실제 발송과 같은 렌더러(<code>renderReplyEmail</code>)와 링크 생성기로 그립니다. 버튼 모양은{" "}
          <code>src/lib/email/runtime/format.ts</code>의 <code>choiceButtonsHtml</code>을 고치면 저장할 때 바로 바뀝니다.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {cases.map((item) => (
            <button
              className={`rounded-full border px-3 py-1.5 text-[13px] ${
                item.key === current.key
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white text-neutral-800"
              }`}
              key={item.key}
              onClick={() => setSelected(item.key)}
              type="button"
            >
              {item.sample} · {item.recipient}
            </button>
          ))}
        </div>

        <div className="mt-5 text-[13px] text-neutral-muted">제목: {current.subject}</div>
        <div className="mt-2 flex flex-wrap items-start gap-6">
          {WIDTHS.map((frame) => (
            <section key={frame.key}>
              <div className="mb-1.5 text-[12px] text-neutral-muted">
                {frame.label} · {frame.width}px
              </div>
              <iframe
                className="rounded-lg border border-neutral-300 bg-white"
                height={640}
                srcDoc={frameDocument(current.html)}
                style={{ width: frame.width }}
                title={`${current.sample} ${frame.label}`}
              />
            </section>
          ))}
        </div>

        <section className="mt-6">
          <h2 className="text-sm font-semibold">버튼 링크</h2>
          <ul className="mt-2 flex flex-col gap-2 text-[12px]">
            {current.hrefs.map((item) => (
              <li className="rounded-md bg-white px-3 py-2" key={item.href}>
                <div className="font-medium">{item.label}</div>
                <div className="mt-0.5 break-all font-mono text-neutral-muted">{readable(item.href)}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold">텍스트 전용 메일 앱에서 보이는 내용</h2>
          <pre className="mt-2 whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-[12px]">{current.text}</pre>
        </section>
      </div>
    </main>
  );
}
