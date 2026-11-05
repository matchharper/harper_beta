// career-i18n-skip-file: Local-only design export diagnostics and handoff copy.
/** Exports rendered local specimens, including iframe DOM, into a single offline file. */
export async function exportDesignHandoff(
  root: HTMLElement,
  options: { filename?: string; skipFrames?: boolean } = {}
) {
  const assets = new Map<string, Promise<string>>();
  const inlineAsset = (url: string, base: string) => {
    const absolute = new URL(url, base).href;
    if (absolute.startsWith("data:") || absolute.startsWith("#"))
      return Promise.resolve(absolute);
    let pending = assets.get(absolute);
    if (!pending) {
      pending = (async () => {
        const response = await fetch(absolute);
        if (!response.ok)
          throw new Error(`Could not bundle asset: ${absolute}`);
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      })();
      assets.set(absolute, pending);
    }
    return pending;
  };
  const cssParts = new Set<string>();
  const collectCss = async (doc: Document) => {
    for (const sheet of Array.from(doc.styleSheets)) {
      // Career uses the locally bundled Pretendard font. Unused cross-origin
      // marketing font stylesheets are not part of this handoff.
      if (sheet.href && new URL(sheet.href).origin !== location.origin)
        continue;
      const text = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      const base = sheet.href ?? doc.baseURI;
      const matches = [
        ...text.matchAll(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g),
      ];
      let result = text;
      for (const match of matches) {
        const assetUrl = match[1] ?? match[2] ?? match[3];
        if (!assetUrl.startsWith("#") && !assetUrl.startsWith("data:")) {
          result = result.replace(
            match[0],
            `url("${await inlineAsset(assetUrl, base)}")`
          );
        }
      }
      cssParts.add(result);
    }
  };
  const snapshot = async (element: HTMLElement) => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll("script,style,link,nextjs-portal,[data-export-omit]")
      .forEach((node) => node.remove());
    clone
      .querySelectorAll("img")
      .forEach((img) => img.removeAttribute("srcset"));
    await Promise.all(
      Array.from(clone.querySelectorAll("img")).map(async (img) => {
        if (img.getAttribute("src"))
          img.src = await inlineAsset(
            img.getAttribute("src")!,
            element.ownerDocument.baseURI
          );
      })
    );
    const liveInputs = element.querySelectorAll("input,textarea,select");
    clone
      .querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input,textarea,select")
      .forEach((input, index) => {
        const current = liveInputs[index] as typeof input;
        if (input.tagName === "TEXTAREA") input.textContent = current.value;
        else if (input.tagName === "INPUT") {
          input.setAttribute("value", current.value);
          if ((current as HTMLInputElement).checked)
            input.setAttribute("checked", "");
        }
      });
    clone.querySelectorAll("*").forEach((node) => {
      for (const attr of Array.from(node.attributes))
        if (attr.name.startsWith("on")) node.removeAttribute(attr.name);
    });
    return clone;
  };
  await collectCss(document);
  const clone = await snapshot(root);
  const frames: string[] = [];
  const iframes = options.skipFrames ? [] : root.querySelectorAll("iframe");
  const copies = clone.querySelectorAll("iframe");
  for (let index = 0; index < iframes.length; index++) {
    const doc = iframes[index].contentDocument;
    if (!doc?.querySelector('[data-career-theme="sky"]'))
      throw new Error(
        `화면 로딩 확인: ${iframes[index].title} · ${doc?.URL ?? "접근 불가"} · ${doc?.body?.innerText.slice(0, 150) ?? ""}`
      );
    await doc.fonts.ready;
    // Every specimen uses this page's bundled Career styles. Re-importing the
    // exported srcdoc stylesheet would duplicate all embedded fonts on each export.
    const body = await snapshot(doc.body);
    frames.push(body.outerHTML);
    copies[index].removeAttribute("src");
    copies[index].removeAttribute("srcdoc");
    copies[index].setAttribute("data-snapshot", String(index));
    copies[index].setAttribute("sandbox", "allow-same-origin");
  }
  const css =
    [...cssParts].join("\n") +
    "\n*,*:before,*:after{animation:none!important;transition:none!important} html,body{scroll-behavior:smooth}";
  const json = JSON.stringify({ css, frames }).replaceAll("<", "\\u003c");
  const script = `const saved=JSON.parse(document.getElementById('snapshots').textContent);document.querySelectorAll('iframe[data-snapshot]').forEach(frame=>{frame.srcdoc='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+saved.css+'</style></head>'+saved.frames[Number(frame.dataset.snapshot)]+'</html>'});document.querySelectorAll('[data-demo-action]').forEach(button=>button.addEventListener('click',()=>{document.getElementById('demo-feedback').textContent='디자인 예시입니다. 실제 저장·발송은 실행하지 않습니다.'}));`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Career · Floating Sky — 구현 전달서</title><style>${css}</style></head><body>${clone.tagName === "BODY" ? clone.innerHTML : clone.outerHTML}<script type="application/json" id="snapshots">${json}</script><script>${script}</script></body></html>`;
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = options.filename ?? "career-floating-sky-handoff.html";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
