import {createReadStream} from 'node:fs';
import {readdir, readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {basename, join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {z} from 'zod';

const sessionIndexRowSchema = z.object({
  id: z.string().min(1),
  thread_name: z.string().min(1),
  updated_at: z.string().min(1)
});

const sessionMetaLineSchema = z.object({
  timestamp: z.string().nullish(),
  type: z.literal('session_meta'),
  payload: z.object({
    id: z.string().nullish(),
    timestamp: z.string().nullish(),
    cwd: z.string().nullish(),
    cli_version: z.string().nullish(),
    originator: z.string().nullish(),
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
};

export type LoadCodexSessionsOptions = {
  codexHome?: string;
};

export async function loadCodexSessions(
  options: LoadCodexSessionsOptions = {}
): Promise<CodexSession[]> {
  const codexHome = options.codexHome ?? join(homedir(), '.codex');
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

  const sessions = [
    ...indexRows.map(row => {
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
        available: Boolean(metadata)
      };
    }),
    ...logMetadata
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
        available: true
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

      return {
        id,
        updatedAt:
          updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : parseDateFromPath(path),
        cwd: metadata.payload.cwd ?? undefined,
        cliVersion: metadata.payload.cli_version ?? undefined,
        originator: metadata.payload.originator ?? undefined,
        modelProvider: metadata.payload.model_provider ?? undefined,
        logPath: path
      };
    })
  );

  return results.filter((metadata): metadata is SessionLogMetadata => Boolean(metadata));
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

async function readSessionMetadata(
  path: string,
  expectedSessionId?: string
): Promise<SessionMetaLine | undefined> {
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
  return basename(path).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
}

function parseDateFromPath(path: string): Date {
  const match = basename(path).match(/rollout-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
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
