export type LlmImageDetail = "auto" | "high" | "low";

export type LlmImageInput = {
  dataUrl: string;
  detail?: LlmImageDetail;
  mime: "image/gif" | "image/jpeg" | "image/png" | "image/webp";
  name: string;
  size: number;
};

export type LlmImageContentPart = {
  image_url: {
    detail: LlmImageDetail;
    url: string;
  };
  type: "image_url";
};

export type LlmTextContentPart = {
  text: string;
  type: "text";
};

export type LlmMessageContent =
  | string
  | Array<LlmImageContentPart | LlmTextContentPart>;

export function buildLlmImageMessageContent(
  text: string,
  images: LlmImageInput[] | undefined
): LlmMessageContent {
  if (!images?.length) return text;
  return [
    { text, type: "text" },
    ...images.map((image) => ({
      image_url: {
        detail: image.detail ?? "auto",
        url: image.dataUrl,
      },
      type: "image_url" as const,
    })),
  ];
}
