import { createRequire } from "node:module";
import path from "node:path";

/** PDF.js needs Adobe CMaps for embedded CJK fonts without ToUnicode maps. */
export function getTalentPdfAssetOptions() {
  const configuredCMaps = process.env.HARPER_PDFJS_CMAP_DIRECTORY;
  const configuredFonts = process.env.HARPER_PDFJS_FONT_DIRECTORY;
  if (configuredCMaps && configuredFonts) {
    return {
      cMapUrl: path.resolve(configuredCMaps) + path.sep,
      standardFontDataUrl: path.resolve(configuredFonts) + path.sep,
    };
  }

  const projectRequire = createRequire(path.join(process.cwd(), "package.json"));
  const pdfRequire = createRequire(projectRequire.resolve("pdf-parse"));
  const pdfJsDirectory = path.dirname(pdfRequire.resolve("pdfjs-dist/package.json"));
  return {
    cMapUrl: path.join(pdfJsDirectory, "cmaps") + path.sep,
    standardFontDataUrl: path.join(pdfJsDirectory, "standard_fonts") + path.sep,
  };
}
