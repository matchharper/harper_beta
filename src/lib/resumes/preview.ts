import type { ResumeContent } from "./schema";
import { resumeHtml } from "./template";

export type ResumeAssets = { fontCss: string; script: string };
type ExternalResumeAssets = { baseUrl: string; styles: { url: string; integrity: string }[]; scriptUrl: string; scriptIntegrity: string };
const attribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// This exact document runs in a sandboxed browser iframe and server Chromium.
// Only trusted, bundled code is executable; all resume fields are HTML-escaped.
export function resumePreviewHtml(
  content: ResumeContent,
  assets: ResumeAssets | ExternalResumeAssets
) {
  return paginatedPreviewHtml(resumeHtml(content, ""), assets);
}

export function paginatedPreviewHtml(html: string, assets: ResumeAssets | ExternalResumeAssets) {
  const external = "baseUrl" in assets;
  const fontStyles = external
    ? assets.styles.map(style => `<link rel="stylesheet" href="${attribute(style.url)}" integrity="${attribute(style.integrity)}" crossorigin="anonymous">`).join("")
    : `<style>${assets.fontCss}</style>`;
  const library = external
    ? `<script src="${attribute(assets.scriptUrl)}" integrity="${attribute(assets.scriptIntegrity)}" crossorigin="anonymous"></script>`
    : `<script>${assets.script.replace(/<\/script/gi, "<\\/script")}</script>`;
  const source = external ? ` ${attribute(assets.baseUrl)}` : "";
  const scripts = `
${library}
<script>
(async () => {
  const started = performance.now();
  try {
    const text = document.body.innerText;
    await document.fonts.ready;
    const faces = await Promise.all([400,700].map(w => document.fonts.load(w + ' 14px "Noto Sans KR"', text)));
    if (faces.some(f => !f.length) || [...document.fonts].some(f => f.status === 'error')) throw new Error('font');
    const flow = await new PagedModule.Previewer().preview();
    if (!flow.total) throw new Error('empty');
    const pages = document.querySelector('.pagedjs_pages');
    const style = document.createElement('style');
    style.textContent = '@media screen { html,body { background:#eee; } body { overflow:hidden; } .pagedjs_pages { transform-origin:top left; } .pagedjs_page { background:white; margin-bottom:24px; box-shadow:0 2px 8px #0002; outline:1px solid #0001; } }';
    document.head.appendChild(style);
    function fit() {
      const page = document.querySelector('.pagedjs_page');
      const gutter = window.innerWidth < 480 ? 16 : 28;
      const scale = Math.min(0.82, (window.innerWidth - gutter * 2) / page.offsetWidth);
      const left = (window.innerWidth - page.offsetWidth * scale) / 2;
      pages.style.width = page.offsetWidth + 'px';
      pages.style.transform = 'translate(' + left + 'px,' + gutter + 'px) scale(' + scale + ')';
      const height = Math.ceil(pages.offsetHeight * scale + gutter * 2);
      document.body.style.height = height + 'px';
      parent.postMessage({ type:'resume-layout', pageCount:flow.total, height, durationMs:Math.round(performance.now()-started) }, '*');
    }
    // Screen transforms must never change printed page geometry.
    const printStyle = document.createElement('style');
    printStyle.textContent = '@media print { .pagedjs_pages { transform:none !important; } body { height:auto !important; } }';
    document.head.appendChild(printStyle);
    fit();
    window.addEventListener('resize', fit);
    window.__resumeReady = { pageCount:flow.total };
  } catch (_) {
    window.__resumeReady = { error:true };
    parent.postMessage({ type:'resume-layout', error:true }, '*');
  }
})();
</script>`;
  return html
    .replace("</head>", () => `${fontStyles}</head>`)
    .replace(
      '<meta charset="utf-8">',
      `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'${source}; style-src 'unsafe-inline' blob:${source}; font-src data:${source}; connect-src blob:${source}; img-src data:; base-uri 'none'; form-action 'none'">`
    )
    .replace("</body>", () => `${scripts}</body>`);
}
