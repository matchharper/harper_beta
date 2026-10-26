import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

export const DOCUMENT_RENDER_VERSION = "document-v1";
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );

export async function documentTemplate(title: string, markdown: string) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize);
  const tree = await processor.run(processor.parse(markdown));
  const chunks: string[] = [];
  const clean = (node: any) => {
    if (node.type === "text" && node.value.trim()) chunks.push(node.value);
    // No remote assets: export and sandbox preview must render the same self-contained content.
    if (node.children) {
      node.children = node.children.flatMap((child: any) =>
        child.tagName === "img"
          ? [{ type: "text", value: child.properties?.alt ?? "" }]
          : [child]
      );
      node.children.forEach(clean);
    }
  };
  clean(tree);
  const body = unified().use(rehypeStringify).stringify(tree);
  return {
    textChunks: chunks,
    html: `<!doctype html><html lang="und"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
@page { size:A4; margin:18mm 18mm 20mm; @bottom-right { content:counter(page); font-size:9pt; color:#777; } }
* { box-sizing:border-box; } body { margin:0; color:#202020; font:10.5pt/1.7 "Noto Sans KR",sans-serif; overflow-wrap:anywhere; }
h1,h2,h3,h4,h5,h6 { line-height:1.35; margin:1.2em 0 .55em; break-after:avoid; } h1 { font-size:22pt; } h2 { font-size:15pt; } h3 { font-size:12pt; }
p,ul,ol,pre,table,blockquote { margin:0 0 .85em; } p { orphans:3; widows:3; } ul,ol { padding-left:1.5em; }
a { color:#315b89; text-decoration:underline; } blockquote { border-left:3px solid #ddd; padding-left:1em; margin-left:0; color:#555; }
table { border-collapse:collapse; width:100%; table-layout:fixed; font-size:9pt; } th,td { border:1px solid #ddd; padding:6px 8px; vertical-align:top; } th { background:#f4f4f4; text-align:left; } thead { display:table-header-group; }
pre { white-space:pre-wrap; padding:10px; background:#f4f4f4; } code { font-family:"Noto Sans KR",monospace; font-size:9pt; } hr { border:0; border-top:1px solid #ddd; margin:1.5em 0; }
</style></head><body><main>${body}</main></body></html>`,
  };
}
