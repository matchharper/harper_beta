// utils/pdfToMarkdown.ts
import pdf from "pdf-parse";

export async function pdfToMarkdown(buffer: Buffer, url: string) {
    const data = await pdf(buffer, { max: 1 });

    const text = data.text
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return {
        url,
        title: data.info?.Title || "PDF Document",
        markdown: `# ${data.info?.Title || "PDF Document"}\n\n${text}`,
        excerpt: text.slice(0, 500),
    };
}
