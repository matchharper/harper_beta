export type CareerDocumentLink = { id: string; title: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DOCUMENT_LINK = new RegExp(
  `^\\s*\\[((?:\\\\.|[^\\]\\\\])+)\\]\\(documentId:(${UUID})\\)\\s*$`,
  "i"
);

export function formatCareerDocumentLink(document: CareerDocumentLink) {
  const title = document.title
    .replace(/[\r\n]+/g, " ")
    .replace(/[\\[\]]/g, "\\$&");
  return `[${title}](documentId:${document.id})`;
}

/** Parse only the explicit UI link contract; never interpret report wording. */
export function extractCareerDocumentLinks(content: string) {
  const documents: CareerDocumentLink[] = [];
  const seen = new Set<string>();
  let fence: { character: string; length: number } | null = null;
  const lines = content.split(/\r?\n/).filter((line) => {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const token = fenceMatch[1];
      if (!fence) fence = { character: token[0], length: token.length };
      else if (token[0] === fence.character && token.length >= fence.length)
        fence = null;
      return true;
    }
    if (fence || /^(?: {4}|\t)/.test(line)) return true;
    const match = DOCUMENT_LINK.exec(line);
    if (!match) return true;
    const id = match[2].toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      documents.push({ id, title: match[1].replace(/\\([\\[\]])/g, "$1") });
    }
    return false;
  });
  return { content: lines.join("\n").trim(), documents };
}

/** Documents share the profile detail route with call notes. */
export function getCareerDocumentHref(documentId: string) {
  return `/career/profile?profileSection=links&documentId=${encodeURIComponent(documentId)}`;
}
