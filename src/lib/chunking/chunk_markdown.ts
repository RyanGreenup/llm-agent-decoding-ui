import { RecursiveChunker } from "npm:@chonkiejs/core";

export interface Chunk {
  text: string;
  start_index: number;
  end_index: number;
  token_count: number;
  metadata: Record<string, string>;
}

interface ChunkMarkdownOptions {
  chunk_size?: number;
  chunk_overlap?: number;
  full_context?: boolean;
  metadata?: Record<string, string>;
}

interface SourceRange {
  text: string;
  start: number;
  end: number;
}

interface IndexedLine {
  text: string;
  start: number;
  end: number;
}

const TEXT_CHUNKER_CACHE = new Map<string, Promise<RecursiveChunker>>();
const CACHE_LIMIT = 32;

function getTextChunker(
  chunkSize: number,
  chunkOverlap: number,
): Promise<RecursiveChunker> {
  const cacheKey = `${chunkSize}:${Math.max(0, chunkOverlap)}`;
  const existing = TEXT_CHUNKER_CACHE.get(cacheKey);
  if (existing) return existing;
  const options: { chunkSize: number; chunkOverlap?: number } = { chunkSize };
  if (chunkOverlap > 0) options.chunkOverlap = chunkOverlap;
  const created = RecursiveChunker.create(options);
  TEXT_CHUNKER_CACHE.set(cacheKey, created);
  if (TEXT_CHUNKER_CACHE.size > CACHE_LIMIT) {
    const oldest = TEXT_CHUNKER_CACHE.keys().next().value;
    if (typeof oldest === "string") TEXT_CHUNKER_CACHE.delete(oldest);
  }
  return created;
}

function splitIndexedLines(text: string): IndexedLine[] {
  const lines: IndexedLine[] = [];
  let pos = 0;
  for (const line of text.split(/\n/)) {
    const start = pos;
    const end = start + line.length + 1;
    lines.push({ text: line, start, end });
    pos = end;
  }
  if (!text.endsWith("\n") && lines.length > 0) {
    lines[lines.length - 1]!.end -= 1;
  }
  return lines;
}

interface FenceOpener {
  marker: "`" | "~";
  length: number;
}

function parseFenceOpener(line: string): FenceOpener | null {
  const indentMatch = line.match(/^ {0,3}/);
  const indent = indentMatch?.[0].length ?? 0;
  if (indent > 3 || indent >= line.length) return null;

  const marker = line[indent];
  if (marker !== "`" && marker !== "~") return null;

  let length = 0;
  while (indent + length < line.length && line[indent + length] === marker) {
    length += 1;
  }
  if (length < 3) return null;

  if (marker === "`") {
    const info = line.slice(indent + length);
    if (info.includes("`")) return null;
  }

  return { marker, length };
}

function isFenceCloser(line: string, opener: FenceOpener): boolean {
  const indentMatch = line.match(/^ {0,3}/);
  const indent = indentMatch?.[0].length ?? 0;
  if (indent > 3 || indent >= line.length) return false;

  let i = indent;
  let count = 0;
  while (i < line.length && line[i] === opener.marker) {
    i += 1;
    count += 1;
  }
  if (count < opener.length) return false;
  return /^[ \t]*$/.test(line.slice(i));
}

function extractCodeBlocks(text: string): SourceRange[] {
  const blocks: SourceRange[] = [];
  const lines = splitIndexedLines(text);
  let i = 0;
  while (i < lines.length) {
    const openerLine = lines[i]!;
    const opener = parseFenceOpener(openerLine.text);
    if (!opener) {
      i += 1;
      continue;
    }

    const start = openerLine.start;
    let end = text.length;
    let closed = false;
    let j = i + 1;
    while (j < lines.length) {
      const line = lines[j]!;
      if (isFenceCloser(line.text, opener)) {
        end = line.end;
        closed = true;
        break;
      }
      j += 1;
    }

    blocks.push({ text: text.slice(start, end), start, end });
    i = closed ? j + 1 : lines.length;
  }
  return blocks;
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  const compact = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = compact.split("|").map((c) => c.trim());
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function intersects(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function extractTableBlocks(
  text: string,
  excluded: SourceRange[],
): SourceRange[] {
  const lines = splitIndexedLines(text);
  const tables: SourceRange[] = [];
  let i = 0;
  while (i < lines.length - 1) {
    const header = lines[i]!;
    const separator = lines[i + 1]!;
    const touchesExcluded = excluded.some((x) =>
      intersects(header.start, separator.end, x.start, x.end)
    );
    if (
      touchesExcluded || !header.text.includes("|") ||
      !isTableSeparatorLine(separator.text)
    ) {
      i += 1;
      continue;
    }

    let j = i + 2;
    while (j < lines.length) {
      const row = lines[j]!;
      if (!row.text.trim() || !row.text.includes("|")) break;
      if (
        excluded.some((x) => intersects(row.start, row.end, x.start, x.end))
      ) break;
      j += 1;
    }

    const start = header.start;
    const end = (lines[j - 1] ?? separator).end;
    tables.push({ text: text.slice(start, end), start, end });
    i = j;
  }
  return tables;
}

function extractPlainTextSections(
  text: string,
  specials: SourceRange[],
): SourceRange[] {
  const result: SourceRange[] = [];
  const sorted = [...specials].sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const part of sorted) {
    if (cursor < part.start) {
      result.push({
        text: text.slice(cursor, part.start),
        start: cursor,
        end: part.start,
      });
    }
    cursor = Math.max(cursor, part.end);
  }
  if (cursor < text.length) {
    result.push({ text: text.slice(cursor), start: cursor, end: text.length });
  }
  return result.filter((s) => s.text.trim().length > 0);
}

function chunkTableByRows(table: SourceRange, chunkSize: number): Chunk[] {
  const lines = splitIndexedLines(table.text);
  if (lines.length < 2) {
    return [{
      text: table.text,
      start_index: table.start,
      end_index: table.end,
      token_count: 0,
      metadata: {},
    }];
  }

  const header = lines[0]!;
  const rows = lines.slice(2);
  if (rows.length === 0 || chunkSize <= 0 || rows.length <= chunkSize) {
    return [{
      text: table.text,
      start_index: table.start,
      end_index: table.end,
      token_count: 0,
      metadata: {},
    }];
  }

  const chunks: Chunk[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const first = slice[0]!;
    const last = slice[slice.length - 1]!;
    const relStart = i === 0 ? header.start : first.start;
    const relEnd = last.end;
    chunks.push({
      text: table.text.slice(relStart, relEnd),
      start_index: table.start + relStart,
      end_index: table.start + relEnd,
      token_count: 0,
      metadata: {},
    });
  }
  return chunks;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function chunk_markdown(
  text: string,
  {
    chunk_size = 512,
    chunk_overlap = 64,
    full_context = false,
    metadata = {},
  }: ChunkMarkdownOptions = {},
): Promise<Chunk[]> {
  if (full_context) {
    return [{
      text,
      start_index: 0,
      end_index: text.length,
      token_count: 0,
      metadata,
    }];
  }

  const codeBlocks = extractCodeBlocks(text);
  const tableBlocks = extractTableBlocks(text, codeBlocks);
  const specials = [...codeBlocks, ...tableBlocks].sort((a, b) =>
    a.start - b.start
  );
  const textSections = extractPlainTextSections(text, specials);

  const result: Chunk[] = [];
  const textChunker = await getTextChunker(chunk_size, chunk_overlap);

  for (const section of textSections) {
    const chunks = await textChunker.chunk(section.text);
    for (const c of chunks as Array<Record<string, unknown>>) {
      const relStart = asNumber(c.startIndex ?? c.start_index, 0);
      const relEnd = asNumber(c.endIndex ?? c.end_index, section.text.length);
      const tokenCount = asNumber(c.tokenCount ?? c.token_count, 0);
      const absStart = section.start + relStart;
      const absEnd = section.start + relEnd;
      result.push({
        text: text.slice(absStart, absEnd),
        start_index: absStart,
        end_index: absEnd,
        token_count: tokenCount,
        metadata,
      });
    }
  }

  for (const table of tableBlocks) {
    const tableChunks = chunkTableByRows(table, chunk_size);
    for (const c of tableChunks) {
      result.push({ ...c, metadata });
    }
  }

  for (const code of codeBlocks) {
    result.push({
      text: code.text,
      start_index: code.start,
      end_index: code.end,
      token_count: 0,
      metadata,
    });
  }

  result.sort((a, b) => a.start_index - b.start_index);
  return result;
}

export const chunkMarkdown = chunk_markdown;
