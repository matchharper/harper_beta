import manifest from "./assetManifest.json";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

/** Only public library/font assets are fetched here; document data stays in HTML. */
export function externalResumeAssets(origin = getConfiguredPublicSiteUrl()) {
  const baseUrl = new URL(`/resume-assets/${manifest.version}/`, origin).href;
  return {
    baseUrl,
    styles: manifest.styles.map(asset => ({ url: new URL(asset.file, baseUrl).href, integrity: asset.integrity })),
    scriptUrl: new URL(manifest.script.file, baseUrl).href,
    scriptIntegrity: manifest.script.integrity,
  };
}
