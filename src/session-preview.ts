import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline/promises';

export type SessionPreviewRole = 'user' | 'assistant';

export type SessionPreviewExcerpt = {
  role: SessionPreviewRole;
  text: string;
};

export type SessionPreview = {
  excerpts: SessionPreviewExcerpt[];
};

export type SessionPreviewOptions = {
  maxExcerpts?: number;
  maxExcerptLength?: number;
  maxLines?: number;
};

const defaultPreviewOptions = {
  maxExcerpts: 3,
  maxExcerptLength: 160,
  maxLines: 400
} satisfies Required<SessionPreviewOptions>;

export async function readSessionPreview(path: string, options: SessionPreviewOptions = {}): Promise<SessionPreview> {
  const resolvedOptions = resolvePreviewOptions(options);
  const stream = createReadStream(path, {encoding: 'utf8'});
  const lines = createInterface({input: stream, crlfDelay: Infinity});
  const sampledLines: string[] = [];

  try {
    for await (const line of lines) {
      sampledLines.push(line);

      if (sampledLines.length >= resolvedOptions.maxLines) {
        break;
      }
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return {excerpts: []};
    }

    throw error;
  } finally {
    lines.close();
    stream.destroy();
  }

  return extractSessionPreviewFromLines(sampledLines, resolvedOptions);
}

export function extractSessionPreviewFromLines(
  lines: readonly string[],
  options: SessionPreviewOptions = {}
): SessionPreview {
  const resolvedOptions = resolvePreviewOptions(options);
  const excerpts: SessionPreviewExcerpt[] = [];

  for (const line of lines.slice(0, resolvedOptions.maxLines)) {
    const excerpt = extractExcerptFromLine(line, resolvedOptions.maxExcerptLength);
    if (!excerpt) {
      continue;
    }

    excerpts.push(excerpt);

    if (excerpts.length >= resolvedOptions.maxExcerpts) {
      break;
    }
  }

  return {excerpts};
}

function extractExcerptFromLine(line: string, maxExcerptLength: number): SessionPreviewExcerpt | undefined {
  const parsed = parseJson(line);
  if (!isRecord(parsed) || parsed.type !== 'response_item' || !isRecord(parsed.payload)) {
    return undefined;
  }

  const role = parsed.payload.role;
  if (role !== 'user' && role !== 'assistant') {
    return undefined;
  }

  const text = extractTextContent(parsed.payload.content);
  if (!text) {
    return undefined;
  }

  return {
    role,
    text: clipText(text, maxExcerptLength)
  };
}

function extractTextContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }

  const text = content
    .flatMap(item => {
      if (!isRecord(item) || typeof item.text !== 'string') {
        return [];
      }

      if (item.type !== 'input_text' && item.type !== 'output_text' && item.type !== 'text') {
        return [];
      }

      return [item.text];
    })
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();

  return text || undefined;
}

function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function resolvePreviewOptions(options: SessionPreviewOptions): Required<SessionPreviewOptions> {
  return {
    maxExcerpts: options.maxExcerpts ?? defaultPreviewOptions.maxExcerpts,
    maxExcerptLength: options.maxExcerptLength ?? defaultPreviewOptions.maxExcerptLength,
    maxLines: options.maxLines ?? defaultPreviewOptions.maxLines
  };
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
