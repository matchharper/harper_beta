import { readFile } from "node:fs/promises";
import path from "node:path";

const fonts = new Map<number, Promise<string>>();
export function resumeFontCss(weight: 400 | 700) {
  let result = fonts.get(weight);
  if (!result) {
    result = (async () => {
      const cssPath = path.join(
        process.cwd(),
        "node_modules/@fontsource/noto-sans-kr",
        `${weight}.css`
      );
      let css = (await readFile(cssPath, "utf8")).replace(
        /, url\([^)]*\.woff\) format\('woff'\)/g,
        ""
      );
      for (const match of [...css.matchAll(/url\(([^)]+)\)/g)]) {
        const relative = match[1].replace(/["']/g, "");
        const buffer = await readFile(
          path.resolve(path.dirname(cssPath), relative)
        );
        css = css.replace(
          match[0],
          () => `url(data:font/woff2;base64,${buffer.toString("base64")})`
        );
      }
      return css;
    })().catch((error) => {
      fonts.delete(weight);
      throw error;
    });
    fonts.set(weight, result);
  }
  return result;
}

export function resumeScript() {
  return readFile(
    path.join(process.cwd(), "node_modules/pagedjs/dist/paged.min.js"),
    "utf8"
  );
}

export async function resumeAssets() {
  const [regular, bold, script] = await Promise.all([
    resumeFontCss(400),
    resumeFontCss(700),
    resumeScript(),
  ]);
  return { fontCss: `${regular}\n${bold}`, script };
}
