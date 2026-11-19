import { getTalentSupabaseAdmin } from "./admin";
import { TALENT_RESUME_BUCKET, type TalentDocumentRow } from "./models";

export type CareerDocumentImage = { path: string; name: string };

// Only owner-scoped document rows from this input are eligible. History and
// selectors stay text-only; checkpoints retain a storage reference for retries.
export function careerDocumentImages(documents: TalentDocumentRow[]): CareerDocumentImage[] {
  return documents.flatMap(document =>
    document.storage_path && ["image/jpeg", "image/png"].includes(document.content_type ?? "")
      ? [{ path: document.storage_path, name: document.file_name }]
      : []);
}

const prepared = new WeakMap<CareerDocumentImage, Promise<string>>();
async function readImage(image: CareerDocumentImage) {
  const { data, error } = await getTalentSupabaseAdmin().storage.from(TALENT_RESUME_BUCKET).download(image.path);
  if (error) throw error;
  const { default: sharp } = await import("sharp");
  // Fit within Claude's native vision resolution and preserve the stored original.
  const bytes = await sharp(Buffer.from(await data.arrayBuffer())).autoOrient()
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .webp().toBuffer();
  return bytes.toString("base64");
}

export async function renderCareerImageMessages<T extends {
  role: string; content: unknown; careerImages?: CareerDocumentImage[];
}>(messages: T[], transport: "chat" | "anthropic", load = readImage) {
  return Promise.all(messages.map(async message => {
    if (!message.careerImages?.length) return message;
    const { careerImages, ...rest } = message;
    const content: unknown[] = [{ type: "text", text: message.content }];
    for (const image of careerImages) {
      const bytes = prepared.get(image) ?? load(image);
      prepared.set(image, bytes);
      let data: string;
      try { data = await bytes; } catch (error) { prepared.delete(image); throw error; }
      content.push({ type: "text", text: image.name }, transport === "anthropic"
        ? { type: "image", source: { type: "base64", media_type: "image/webp", data } }
        : { type: "image_url", image_url: { url: `data:image/webp;base64,${data}`, detail: "auto" } });
    }
    return { ...rest, content };
  }));
}
