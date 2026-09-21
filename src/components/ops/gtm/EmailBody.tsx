import { MarkdownRichTextEditor } from "@/components/ui/markdown-rich-text-editor";
import { emailBodyToHtml } from "@/lib/gtm/email";
import styles from "./GtmWorkspace.module.css";

export default function EmailBody({
  value,
  onChange,
  disabled,
  readOnly,
  label = "메일 본문",
}: {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  label?: string;
}) {
  if (readOnly)
    return (
      <iframe
        title={label}
        sandbox=""
        referrerPolicy="no-referrer"
        className="min-h-[250px] w-full border-0 bg-white"
        srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"><style>body{font:14px/1.65 Arial,sans-serif;color:#202124;white-space:pre-wrap;overflow-wrap:anywhere;margin:12px}a{color:#1a73e8}img,table{max-width:100%}pre{white-space:pre-wrap}</style></head><body>${emailBodyToHtml(value)}</body></html>`}
      />
    );
  return (
    <MarkdownRichTextEditor
      ariaLabel={label}
      contentFormat="html"
      value={emailBodyToHtml(value)}
      onValueChange={onChange ?? (() => {})}
      disabled={disabled}
      className={`${styles.mailEditor} min-h-[280px] border border-neutral-1000-a10 bg-white px-3`}
    />
  );
}
