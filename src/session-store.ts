import {createReadStream} from 'node:fs';
import {readdir, readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {basename, join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {z} from 'zod';
import {readSessionPreview, type SessionPreview} from './session-preview.js';

const sessionIndexRowSchema = z.object({
  id: z.string().min(1),
  thread_name: z.string().min(1),
  updated_at: z.string().min(1)
});

const sessionSourceSchema = z.union([z.string(), z.object({subagent: z.unknown().optional()}).passthrough()]).nullish();

const sessionMetaLineSchema = z.object({
  timestamp: z.string().nullish(),
  type: z.literal('session_meta'),
  payload: z.object({
    id: z.string().nullish(),
    timestamp: z.string().nullish(),
    cwd: z.string().nullish(),
    cli_version: z.string().nullish(),
    originator: z.string().nullish(),
    source: sessionSourceSchema,
    model_provider: z.string().nullish()
  })
});

type SessionIndexRow = z.infer<typeof sessionIndexRowSchema>;
type SessionMetaLine = z.infer<typeof sessionMetaLineSchema>;

type SessionLogMetadata = {
  id: string;
  updatedAt: Date;
  cwd: string | undefined;
  cliVersion: string | undefined;
  originator: string | undefined;
  modelProvider: string | undefined;
  logPath: string;
  isSubagent: boolean;
  preview: SessionPreview | undefined;
};

export type CodexSession = {
  id: string;
  title: string;
  updatedAt: Date;
  cwd: string | undefined;
  cliVersion: string | undefined;
  originator: string | undefined;
  modelProvider: string | undefined;
  logPath: string | undefined;
  available: boolean;
  preview?: SessionPreview;
};

export type LoadCodexSessionsOptions = {
  codexHome?: string;
  includeSubagents?: boolean;
};

export async function loadCodexSessions(options: LoadCodexSessionsOptions = {}): Promise<CodexSession[]> {
  const codexHome = options.codexHome ?? join(homedir(), '.codex');
  const includeSubagents = options.includeSubagents ?? false;
  const indexRows = await readSessionIndex(join(codexHome, 'session_index.jsonl'));
  const logPaths = (
    await Promise.all([
      listJsonlFiles(join(codexHome, 'sessions')),
      listJsonlFiles(join(codexHome, 'archived_sessions'))
    ])
  ).flat();
  const logMetadata = await readAllSessionLogMetadata(logPaths);
  const metadataById = new Map(logMetadata.map(metadata => [metadata.id, metadata]));
  const indexIds = new Set(indexRows.map(row => row.id));
  const visibleIndexRows = includeSubagents
    ? indexRows
    : indexRows.filter(row => !metadataById.get(row.id)?.isSubagent);
  const visibleLogMetadata = includeSubagents ? logMetadata : logMetadata.filter(metadata => !metadata.isSubagent);

  const sessions = [
    ...visibleIndexRows.map(row => {
      const metadata = metadataById.get(row.id);

      return {
        id: row.id,
        title: row.thread_name,
        updatedAt: new Date(row.updated_at),
        cwd: metadata?.cwd,
        cliVersion: metadata?.cliVersion,
        originator: metadata?.originator,
        modelProvider: metadata?.modelProvider,
        logPath: metadata?.logPath,
        available: Boolean(metadata),
        ...(metadata?.preview ? {preview: metadata.preview} : {})
      };
    }),
    ...visibleLogMetadata
      .filter(metadata => !indexIds.has(metadata.id))
      .map(metadata => ({
        id: metadata.id,
        title: `Session ${metadata.id.slice(0, 8)}`,
        updatedAt: metadata.updatedAt,
        cwd: metadata.cwd,
        cliVersion: metadata.cliVersion,
        originator: metadata.originator,
        modelProvider: metadata.modelProvider,
        logPath: metadata.logPath,
        available: true,
        ...(metadata.preview ? {preview: metadata.preview} : {})
      }))
  ];

  return sessions.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}

async function readAllSessionLogMetadata(paths: readonly string[]): Promise<SessionLogMetadata[]> {
  const results = await Promise.all(
    paths.map(async path => {
      const metadata = await readSessionMetadata(path);
      const id = metadata?.payload.id ?? parseSessionIdFromPath(path);
      if (!metadata || !id) {
        return undefined;
      }

      const timestamp = metadata.payload.timestamp ?? metadata.timestamp;
      const updatedAt = timestamp ? new Date(timestamp) : undefined;
      const preview = await readSessionPreview(path);

      return {
        id,
        updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : parseDateFromPath(path),
        cwd: metadata.payload.cwd ?? undefined,
        cliVersion: metadata.payload.cli_version ?? undefined,
        originator: metadata.payload.originator ?? undefined,
        modelProvider: metadata.payload.model_provider ?? undefined,
        logPath: path,
        isSubagent: isSubagentSource(metadata.payload.source),
        preview: preview.excerpts.length > 0 ? preview : undefined
      };
    })
  );

  return results.filter((metadata): metadata is SessionLogMetadata => Boolean(metadata));
}

function isSubagentSource(source: SessionMetaLine['payload']['source']): boolean {
  return Boolean(source && typeof source === 'object' && 'subagent' in source && source.subagent);
}

async function readSessionIndex(path: string): Promise<SessionIndexRow[]> {
  const contents = await readTextFileIfExists(path);
  if (!contents) {
    return [];
  }

  return contents
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      const parsedJson = parseJson(line);
      if (!parsedJson.ok) {
        return [];
      }

      const parsedRow = sessionIndexRowSchema.safeParse(parsedJson.value);
      if (!parsedRow.success || Number.isNaN(new Date(parsedRow.data.updated_at).getTime())) {
        return [];
      }

      return [parsedRow.data];
    });
}

async function readSessionMetadata(path: string, expectedSessionId?: string): Promise<SessionMetaLine | undefined> {
  const stream = createReadStream(path, {encoding: 'utf8'});
  const lines = createInterface({input: stream, crlfDelay: Infinity});

  try {
    for await (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      const parsedJson = parseJson(trimmedLine);
      if (!parsedJson.ok) {
        continue;
      }

      const parsedMeta = sessionMetaLineSchema.safeParse(parsedJson.value);
      if (parsedMeta.success && metadataMatchesSession(parsedMeta.data, expectedSessionId)) {
        return parsedMeta.data;
      }
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  } finally {
    lines.close();
    stream.destroy();
  }

  return undefined;
}

function metadataMatchesSession(metadata: SessionMetaLine, expectedSessionId: string | undefined): boolean {
  return !expectedSessionId || !metadata.payload.id || metadata.payload.id === expectedSessionId;
}

function parseSessionIdFromPath(path: string): string | undefined {
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(basename(path))?.[0];
}

function parseDateFromPath(path: string): Date {
  const match = /rollout-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/.exec(basename(path));
  if (!match) {
    return new Date(0);
  }

  return new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.000Z`);
}

async function listJsonlFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, {withFileTypes: true});
    const nested = await Promise.all(
      entries.map(async entry => {
        const path = join(root, entry.name);

        if (entry.isDirectory()) {
          return listJsonlFiles(path);
        }

        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          return [path];
        }

        return [];
      })
    );

    return nested.flat();
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function readTextFileIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

function parseJson(line: string): {ok: true; value: unknown} | {ok: false} {
  try {
    return {ok: true, value: JSON.parse(line) as unknown};
  } catch {
    return {ok: false};
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
