/**
 * scripts/index-help-chunks.ts
 *
 * Indexes mdx help docs under docs/career-help/ into the
 * `service_help_chunks` table for RAG retrieval at chat-time.
 *
 * Usage:
 *   pnpm tsx scripts/index-help-chunks.ts --all
 *   pnpm tsx scripts/index-help-chunks.ts --files docs/career-help/right-panel/match-button.mdx
 *
 * Env required (loaded from .env.local / .env):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - OPENAI_API_KEY
 *
 * Behavior:
 *   - Parses simple YAML frontmatter (title, ui_target, category)
 *   - Splits the body by H2 headings; falls back to whole-file chunk for short docs
 *   - Computes sha256(content_hash) per chunk; skips re-embedding if unchanged
 *   - On per-chunk OpenAI failure: logs and continues. Exit code 1 if anything failed.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { OpenAI } from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

const EMBEDDING_MODEL = "text-embedding-3-small";
const HELP_DOCS_ROOT = path.join(projectRoot, "docs", "career-help");

type CliArgs = {
  all: boolean;
  files: string[];
};

type ParsedDoc = {
  absolutePath: string;
  body: string;
  category: string | null;
  docPath: string;
  title: string | null;
  uiTarget: string | null;
};

type ChunkRecord = {
  chunk_index: number;
  chunk_text: string;
  content_hash: string;
  metadata: Record<string, unknown>;
  source_doc_title: string | null;
  ui_target: string | null;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { all: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") {
      args.all = true;
    } else if (arg === "--files") {
      const next = argv[i + 1] ?? "";
      args.files = next
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      i += 1;
    }
  }
  return args;
}

async function findAllMdxFiles(rootDir: string): Promise<string[]> {
  const result: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findAllMdxFiles(fullPath);
      result.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      result.push(fullPath);
    }
  }
  return result;
}

function parseFrontmatter(raw: string): {
  body: string;
  data: Record<string, string>;
} {
  const trimmed = raw.replace(/^﻿/, "");
  const match = trimmed.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { body: trimmed, data: {} };
  }
  const headerLines = match[1].split("\n");
  const body = match[2] ?? "";
  const data: Record<string, string> = {};
  for (const line of headerLines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }
  return { body, data };
}

function chunkBody(body: string): string[] {
  const cleaned = body.trim();
  if (!cleaned) return [];

  // Split by H2 headings ("## ...") so each section becomes its own chunk.
  const sections: string[] = [];
  const lines = cleaned.split("\n");
  let current: string[] = [];
  for (const line of lines) {
    if (/^##\s/.test(line) && current.length > 0) {
      sections.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    sections.push(current.join("\n").trim());
  }

  // Filter empty sections; if only one section and it's small, return as-is.
  const filtered = sections.filter((section) => section.trim().length > 0);
  if (filtered.length === 0) return [cleaned];
  return filtered;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function parseDoc(absolutePath: string): Promise<ParsedDoc> {
  const raw = await fs.readFile(absolutePath, "utf8");
  const { body, data } = parseFrontmatter(raw);
  const docPath = path
    .relative(projectRoot, absolutePath)
    .split(path.sep)
    .join("/");
  return {
    absolutePath,
    body,
    category: data.category ?? null,
    docPath,
    title: data.title ?? null,
    uiTarget: data.ui_target ?? null,
  };
}

function buildChunkRecords(doc: ParsedDoc): ChunkRecord[] {
  const chunks = chunkBody(doc.body);
  return chunks.map((chunkText, index) => ({
    chunk_index: index,
    chunk_text: chunkText,
    content_hash: sha256(chunkText),
    metadata: {
      category: doc.category,
    },
    source_doc_title: doc.title,
    ui_target: doc.uiTarget,
  }));
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.all && args.files.length === 0) {
    console.error(
      "[index-help-chunks] Usage: --all or --files <comma-separated paths>"
    );
    process.exit(2);
  }

  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openaiKey = readEnv("OPENAI_API_KEY");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const openai = new OpenAI({ apiKey: openaiKey });

  const targetPaths = args.all
    ? await findAllMdxFiles(HELP_DOCS_ROOT)
    : args.files
        .map((relPath) => path.resolve(projectRoot, relPath))
        .filter((absPath) => absPath.endsWith(".mdx"));

  if (targetPaths.length === 0) {
    console.warn("[index-help-chunks] No mdx files to process.");
    return;
  }

  console.info(
    `[index-help-chunks] processing ${targetPaths.length} file(s)`
  );

  let processedChunks = 0;
  let embeddedChunks = 0;
  let skippedUnchanged = 0;
  let failedChunks = 0;
  const processedDocPaths: string[] = [];

  for (const absolutePath of targetPaths) {
    let doc: ParsedDoc;
    try {
      doc = await parseDoc(absolutePath);
    } catch (error) {
      console.error(
        `[index-help-chunks] failed to read ${absolutePath}:`,
        error
      );
      failedChunks += 1;
      continue;
    }

    const chunks = buildChunkRecords(doc);
    if (chunks.length === 0) {
      console.warn(
        `[index-help-chunks] no chunks produced for ${doc.docPath} (empty body)`
      );
      continue;
    }

    processedDocPaths.push(doc.docPath);

    // Fetch existing chunks so we can short-circuit unchanged content.
    const { data: existingRows, error: existingError } = await admin
      .from("service_help_chunks" as any)
      .select("chunk_index, content_hash")
      .eq("doc_path", doc.docPath);

    if (existingError) {
      console.error(
        `[index-help-chunks] failed to read existing chunks for ${doc.docPath}:`,
        existingError.message
      );
    }

    const existingHashByIndex = new Map<number, string>();
    for (const row of (existingRows ?? []) as Array<{
      chunk_index: number;
      content_hash: string;
    }>) {
      existingHashByIndex.set(row.chunk_index, row.content_hash);
    }

    for (const chunk of chunks) {
      processedChunks += 1;
      const existingHash = existingHashByIndex.get(chunk.chunk_index);
      if (existingHash && existingHash === chunk.content_hash) {
        skippedUnchanged += 1;
        continue;
      }

      let embedding: number[];
      try {
        const response = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: chunk.chunk_text,
        });
        embedding = response.data[0]?.embedding ?? [];
        if (embedding.length === 0) {
          throw new Error("OpenAI returned empty embedding");
        }
      } catch (error) {
        failedChunks += 1;
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[index-help-chunks] embedding failed for ${doc.docPath}#${chunk.chunk_index}: ${message}`
        );
        continue;
      }

      const { error: upsertError } = await admin
        .from("service_help_chunks" as any)
        .upsert(
          {
            doc_path: doc.docPath,
            chunk_index: chunk.chunk_index,
            chunk_text: chunk.chunk_text,
            ui_target: chunk.ui_target,
            source_doc_title: chunk.source_doc_title,
            embedding: embedding as any,
            embedding_model: EMBEDDING_MODEL,
            metadata: chunk.metadata,
            content_hash: chunk.content_hash,
          },
          { onConflict: "doc_path,chunk_index" }
        );

      if (upsertError) {
        failedChunks += 1;
        console.error(
          `[index-help-chunks] upsert failed for ${doc.docPath}#${chunk.chunk_index}: ${upsertError.message}`
        );
        continue;
      }

      embeddedChunks += 1;
    }

    // Delete stale chunks: rows whose chunk_index no longer exists in the
    // current version of this doc (handles docs that shrank in chunk count).
    const { error: staleChunkError } = await admin
      .from("service_help_chunks" as any)
      .delete()
      .eq("doc_path", doc.docPath)
      .gte("chunk_index", chunks.length);

    if (staleChunkError) {
      console.error(
        `[index-help-chunks] failed to delete stale chunks for ${doc.docPath}:`,
        staleChunkError.message
      );
    }
  }

  // --all mode: delete rows for doc_paths that no longer exist on disk.
  if (args.all && processedDocPaths.length > 0) {
    const { error: orphanError } = await admin
      .from("service_help_chunks" as any)
      .delete()
      .not("doc_path", "in", `(${processedDocPaths.map((p) => `"${p}"`).join(",")})`);

    if (orphanError) {
      console.error(
        "[index-help-chunks] failed to delete orphaned doc rows:",
        orphanError.message
      );
    }
  }

  console.info(
    `[index-help-chunks] done. processed=${processedChunks} embedded=${embeddedChunks} skipped=${skippedUnchanged} failed=${failedChunks}`
  );

  if (failedChunks > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[index-help-chunks] fatal:", error);
  process.exit(1);
});
