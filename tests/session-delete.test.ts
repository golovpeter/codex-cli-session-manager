import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtemp} from 'node:fs/promises';
import {describe, expect, test} from 'vitest';
import {deleteCodexSession} from '../src/session-delete.js';

async function createCodexHome() {
  const root = await mkdtemp(join(tmpdir(), 'cx-session-delete-'));
  const codexHome = join(root, '.codex');
  await mkdir(codexHome, {recursive: true});
  return codexHome;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('deleteCodexSession', () => {
  test('removes a session from the index and deletes its rollout file', async () => {
    const codexHome = await createCodexHome();
    const sessionId = '019d961e-e759-7dc1-8de3-e852fbbde4e7';
    const otherSessionId = '019d9607-c48c-77e2-b9d9-6e342ff7b8bc';
    const sessionDir = join(codexHome, 'sessions', '2026', '04', '16');
    const logPath = join(sessionDir, `rollout-2026-04-16T14-48-20-${sessionId}.jsonl`);

    await mkdir(sessionDir, {recursive: true});
    await writeFile(
      join(codexHome, 'session_index.jsonl'),
      [
        JSON.stringify({
          id: sessionId,
          thread_name: 'Delete me',
          updated_at: '2026-04-16T11:48:27.097Z'
        }),
        '{not-json',
        JSON.stringify({
          id: otherSessionId,
          thread_name: 'Keep me',
          updated_at: '2026-04-16T11:23:04.729Z'
        })
      ].join('\n')
    );
    await writeFile(logPath, '{}\n');

    const result = await deleteCodexSession({codexHome, sessionId, logPath});

    expect(result).toEqual({deletedIndexRows: 1, deletedLogFile: true});
    await expect(readFile(logPath, 'utf8')).rejects.toMatchObject({code: 'ENOENT'});
    expect(await readFile(join(codexHome, 'session_index.jsonl'), 'utf8')).toBe(
      [
        '{not-json',
        JSON.stringify({
          id: otherSessionId,
          thread_name: 'Keep me',
          updated_at: '2026-04-16T11:23:04.729Z'
        })
      ].join('\n')
    );
  });

  test('can remove index-only sessions', async () => {
    const codexHome = await createCodexHome();
    const sessionId = 'index-only';

    await writeFile(
      join(codexHome, 'session_index.jsonl'),
      JSON.stringify({
        id: sessionId,
        thread_name: 'Index only',
        updated_at: '2026-04-16T11:48:27.097Z'
      })
    );

    const result = await deleteCodexSession({codexHome, sessionId});

    expect(result).toEqual({deletedIndexRows: 1, deletedLogFile: false});
    expect(await readFile(join(codexHome, 'session_index.jsonl'), 'utf8')).toBe('');
  });

  test('rejects rollout paths outside the Codex home directory', async () => {
    const codexHome = await createCodexHome();
    const outsideFile = join(tmpdir(), 'cx-outside-rollout.jsonl');
    await writeFile(outsideFile, '{}\n');

    await expect(
      deleteCodexSession({
        codexHome,
        sessionId: 'session-123',
        logPath: outsideFile
      })
    ).rejects.toThrow('outside the Codex home directory');

    expect(await exists(outsideFile)).toBe(true);
  });
});
