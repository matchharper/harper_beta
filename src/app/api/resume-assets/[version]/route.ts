import { resumeFontCss, resumeScript } from "@/lib/resumes/assets";
import { RESUME_RENDER_VERSION } from "@/lib/resumes/template";

export const runtime = "nodejs";

// Public, versioned library/font assets only. Split font weights to stay below
// serverless response limits; the URL query is part of the cache key.
export async function GET(
  req: Request,
  context: { params: Promise<{ version: string }> }
) {
  if ((await context.params).version !== RESUME_RENDER_VERSION)
    return new Response(null, { status: 404 });
  const asset = new URL(req.url).searchParams.get("asset");
  if (asset !== "script" && asset !== "400" && asset !== "700")
    return new Response(null, { status: 404 });
  const content =
    asset === "script"
      ? await resumeScript()
      : await resumeFontCss(asset === "400" ? 400 : 700);
  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
