import {readFile, unlink, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {isAbsolute, join, relative, resolve} from 'node:path';

export type DeleteCodexSessionOptions = {
  codexHome?: string;
  sessionId: string;
  logPath?: string;
};

export type DeleteCodexSessionResult = {
  deletedIndexRows: number;
  deletedLogFile: boolean;
};

export async function deleteCodexSession(
  options: DeleteCodexSessionOptions
): Promise<DeleteCodexSessionResult> {
  const codexHome = options.codexHome ?? join(homedir(), '.codex');
  const deletedIndexRows = await removeSessionFromIndex(
    join(codexHome, 'session_index.jsonl'),
    options.sessionId
  );
  const deletedLogFile = options.logPath
    ? await deleteSessionLogFile(codexHome, options.logPath)
    : false;

  return {deletedIndexRows, deletedLogFile};
}

async function removeSessionFromIndex(path: string, sessionId: string): Promise<number> {
  const contents = await readTextFileIfExists(path);
  if (contents === undefined) {
    return 0;
  }

  const hadTrailingNewline = contents.endsWith('\n');
  const lines = contents.split('\n');
  if (hadTrailingNewline) {
    lines.pop();
  }

  let deleted = 0;
  const remainingLines = lines.filter(line => {
    const parsed = parseJson(line.trim());
    if (!parsed.ok || !isSessionIndexRow(parsed.value) || parsed.value.id !== sessionId) {
      return true;
    }

    deleted += 1;
    return false;
  });

  await writeFile(path, remainingLines.join('\n') + (hadTrailingNewline && remainingLines.length ? '\n' : ''));
  return deleted;
}

async function deleteSessionLogFile(codexHome: string, logPath: string): Promise<boolean> {
  assertPathInsideCodexHome(codexHome, logPath);

  try {
    await unlink(logPath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function assertPathInsideCodexHome(codexHome: string, path: string): void {
  const root = resolve(codexHome);
  const target = resolve(path);
  const targetRelativePath = relative(root, target);

  if (
    targetRelativePath === '' ||
    targetRelativePath === '..' ||
    targetRelativePath.startsWith('../') ||
    isAbsolute(targetRelativePath)
  ) {
    throw new Error('Refusing to delete a rollout file outside the Codex home directory');
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

function isSessionIndexRow(value: unknown): value is {id: string} {
  return Boolean(value && typeof value === 'object' && 'id' in value && typeof value.id === 'string');
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
