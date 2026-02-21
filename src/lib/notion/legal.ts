export type LegalBlockType = "text" | "bulleted_list" | "numbered_list";

export type LegalBlock = {
  id: string;
  type: LegalBlockType;
  text: string;
};

export type LegalDocument = {
  title: string;
  blocks: LegalBlock[];
};

type NotionTextSegment = [string, unknown?];
type NotionTitleProperty = NotionTextSegment[];

type NotionBlockValue = {
  type?: string;
  properties?: {
    title?: NotionTitleProperty;
  };
  content?: string[];
};

type NotionBlockRecord = {
  value?: NotionBlockValue;
};

type NotionLoadCachedPageChunkResponse = {
  recordMap?: {
    block?: Record<string, NotionBlockRecord>;
  };
};

const SUPPORTED_BLOCK_TYPES: Record<LegalBlockType, true> = {
  text: true,
  bulleted_list: true,
  numbered_list: true,
};

const normalizeNotionPageId = (pageId: string): string => {
  const normalized = pageId.replace(/-/g, "");
  if (normalized.length !== 32) return pageId;
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(
    12,
    16
  )}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
};

const toPlainText = (title?: NotionTitleProperty): string => {
  if (!title) return "";
  return title
    .map((segment) => (typeof segment?.[0] === "string" ? segment[0] : ""))
    .join("");
};

export const fetchLegalDocument = async (
  pageId: string
): Promise<LegalDocument> => {
  const normalizedPageId = normalizeNotionPageId(pageId);
  const response = await fetch("https://www.notion.so/api/v3/loadCachedPageChunkV2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      page: { id: normalizedPageId },
      limit: 200,
      cursor: { stack: [] },
      chunkNumber: 0,
      verticalColumns: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to load legal document: ${response.status}`);
  }

  const data =
    (await response.json()) as NotionLoadCachedPageChunkResponse | null;
  const blockMap = data?.recordMap?.block ?? {};
  const rootBlock = blockMap[normalizedPageId]?.value;
  const contentIds = Array.isArray(rootBlock?.content)
    ? rootBlock.content.filter((contentId): contentId is string =>
        typeof contentId === "string"
      )
    : [];

  const title = toPlainText(rootBlock?.properties?.title).trim() || "Document";
  const blocks: LegalBlock[] = [];

  for (const contentId of contentIds) {
    const blockValue = blockMap[contentId]?.value;
    if (!blockValue || typeof blockValue.type !== "string") continue;

    const blockType = blockValue.type as LegalBlockType;
    if (!SUPPORTED_BLOCK_TYPES[blockType]) continue;

    const text = toPlainText(blockValue.properties?.title).trim();
    if (!text) continue;

    blocks.push({
      id: contentId,
      type: blockType,
      text,
    });
  }

  return { title, blocks };
};
