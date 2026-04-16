import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {describe, expect, test} from 'vitest';
import {loadCodexSessions} from '../src/session-store.js';

async function createCodexHome() {
  const root = await mkdtemp(join(tmpdir(), 'cdx-sessions-store-'));
  const codexHome = join(root, '.codex');
  await mkdir(codexHome, {recursive: true});
  return codexHome;
}

describe('loadCodexSessions', () => {
  test('loads the session index and enriches rows with cwd metadata from rollout files', async () => {
    const codexHome = await createCodexHome();
    const sessionId = '019d961e-e759-7dc1-8de3-e852fbbde4e7';
    const sessionDir = join(codexHome, 'sessions', '2026', '04', '16');

    await mkdir(sessionDir, {recursive: true});
    await writeFile(
      join(codexHome, 'session_index.jsonl'),
      [
        JSON.stringify({
          id: sessionId,
          thread_name: 'Build Codex session navigator',
          updated_at: '2026-04-16T11:48:27.097Z'
        })
      ].join('\n')
    );
    await writeFile(
      join(sessionDir, `rollout-2026-04-16T14-48-20-${sessionId}.jsonl`),
      [
        JSON.stringify({
          timestamp: '2026-04-16T11:48:27.097Z',
          type: 'session_meta',
          payload: {
            id: sessionId,
            cwd: '/workspace/codex-session-manager',
            cli_version: '0.121.0',
            originator: 'codex-tui',
            model_provider: 'openai'
          }
        })
      ].join('\n')
    );

    const sessions = await loadCodexSessions({codexHome});

    expect(sessions).toEqual([
      {
        id: sessionId,
        title: 'Build Codex session navigator',
        updatedAt: new Date('2026-04-16T11:48:27.097Z'),
        cwd: '/workspace/codex-session-manager',
        cliVersion: '0.121.0',
        originator: 'codex-tui',
        modelProvider: 'openai',
        logPath: join(sessionDir, `rollout-2026-04-16T14-48-20-${sessionId}.jsonl`),
        available: true
      }
    ]);
  });

  test('keeps index rows available for display when the rollout file is missing', async () => {
    const codexHome = await createCodexHome();

    await writeFile(
      join(codexHome, 'session_index.jsonl'),
      JSON.stringify({
        id: 'missing-session',
        thread_name: 'Missing rollout',
        updated_at: '2026-04-16T10:00:00.000Z'
      })
    );

    const sessions = await loadCodexSessions({codexHome});

    expect(sessions).toEqual([
      {
        id: 'missing-session',
        title: 'Missing rollout',
        updatedAt: new Date('2026-04-16T10:00:00.000Z'),
        cwd: undefined,
        cliVersion: undefined,
        originator: undefined,
        modelProvider: undefined,
        logPath: undefined,
        available: false
      }
    ]);
  });

  test('loads sessions that exist as rollout files even when they are missing from the index', async () => {
    const codexHome = await createCodexHome();
    const sessionId = '019d9607-c48c-77e2-b9d9-6e342ff7b8bc';
    const sessionDir = join(codexHome, 'sessions', '2026', '04', '16');

    await mkdir(sessionDir, {recursive: true});
    await writeFile(join(codexHome, 'session_index.jsonl'), '');
    await writeFile(
      join(sessionDir, `rollout-2026-04-16T14-23-04-${sessionId}.jsonl`),
      [
        JSON.stringify({
          timestamp: '2026-04-16T11:23:10.000Z',
          type: 'session_meta',
          payload: {
            id: sessionId,
            timestamp: '2026-04-16T11:23:04.729Z',
            cwd: '/workspace/codex-session-manager',
            cli_version: '0.121.0',
            originator: 'codex-tui',
            model_provider: 'openai'
          }
        })
      ].join('\n')
    );

    const sessions = await loadCodexSessions({codexHome});

    expect(sessions).toEqual([
      {
        id: sessionId,
        title: `Session ${sessionId.slice(0, 8)}`,
        updatedAt: new Date('2026-04-16T11:23:04.729Z'),
        cwd: '/workspace/codex-session-manager',
        cliVersion: '0.121.0',
        originator: 'codex-tui',
        modelProvider: 'openai',
        logPath: join(sessionDir, `rollout-2026-04-16T14-23-04-${sessionId}.jsonl`),
        available: true
      }
    ]);
  });

  test('hides subagent rollout sessions by default', async () => {
    const codexHome = await createCodexHome();
    const parentSessionId = '019d95fa-8714-7a63-880b-31026a74ff9b';
    const subagentSessionId = '019d95ff-d220-7532-9b0b-3507f40daa8f';
    const sessionDir = join(codexHome, 'sessions', '2026', '04', '16');

    await mkdir(sessionDir, {recursive: true});
    await writeFile(join(codexHome, 'session_index.jsonl'), '');
    await writeFile(
      join(sessionDir, `rollout-2026-04-16T14-14-23-${subagentSessionId}.jsonl`),
      [
        JSON.stringify({
          timestamp: '2026-04-16T11:14:28.496Z',
          type: 'session_meta',
          payload: {
            id: subagentSessionId,
            timestamp: '2026-04-16T11:14:23.000Z',
            cwd: '/workspace/codex-session-manager',
            cli_version: '0.121.0',
            originator: 'codex-tui',
            model_provider: 'openai',
            source: {
              subagent: {
                thread_spawn: {
                  parent_thread_id: parentSessionId,
                  depth: 1,
                  agent_role: 'reviewer'
                }
              }
            }
          }
        })
      ].join('\n')
    );

    const sessions = await loadCodexSessions({codexHome});

    expect(sessions).toEqual([]);
  });

  test('can include subagent rollout sessions when requested', async () => {
    const codexHome = await createCodexHome();
    const subagentSessionId = '019d95ff-d220-7532-9b0b-3507f40daa8f';
    const sessionDir = join(codexHome, 'sessions', '2026', '04', '16');

    await mkdir(sessionDir, {recursive: true});
    await writeFile(join(codexHome, 'session_index.jsonl'), '');
    await writeFile(
      join(sessionDir, `rollout-2026-04-16T14-14-23-${subagentSessionId}.jsonl`),
      [
        JSON.stringify({
          timestamp: '2026-04-16T11:14:28.496Z',
          type: 'session_meta',
          payload: {
            id: subagentSessionId,
            timestamp: '2026-04-16T11:14:23.000Z',
            cwd: '/workspace/codex-session-manager',
            source: {
              subagent: {
                thread_spawn: {
                  parent_thread_id: '019d95fa-8714-7a63-880b-31026a74ff9b',
                  depth: 1,
                  agent_role: 'reviewer'
                }
              }
            }
          }
        })
      ].join('\n')
    );

    const sessions = await loadCodexSessions({codexHome, includeSubagents: true});

    expect(sessions.map(session => session.id)).toEqual([subagentSessionId]);
  });

  test('loads archived rollout sessions as normal resumable sessions', async () => {
    const codexHome = await createCodexHome();
    const sessionId = '019a8d41-d164-7583-b38c-df7b13617e44';
    const archivedDir = join(codexHome, 'archived_sessions');

    await mkdir(archivedDir, {recursive: true});
    await writeFile(join(codexHome, 'session_index.jsonl'), '');
    await writeFile(
      join(archivedDir, `rollout-2025-11-16T18-21-32-${sessionId}.jsonl`),
      [
        JSON.stringify({
          timestamp: '2025-11-16T18:21:32.000Z',
          type: 'session_meta',
          payload: {
            id: sessionId,
            timestamp: '2025-11-16T18:21:32.000Z',
            cwd: '/workspace/archived-project',
            cli_version: '0.121.0',
            originator: 'codex-tui',
            model_provider: 'openai'
          }
        })
      ].join('\n')
    );

    const sessions = await loadCodexSessions({codexHome});

    expect(sessions).toEqual([
      {
        id: sessionId,
        title: `Session ${sessionId.slice(0, 8)}`,
        updatedAt: new Date('2025-11-16T18:21:32.000Z'),
        cwd: '/workspace/archived-project',
        cliVersion: '0.121.0',
        originator: 'codex-tui',
        modelProvider: 'openai',
        logPath: join(archivedDir, `rollout-2025-11-16T18-21-32-${sessionId}.jsonl`),
        available: true
      }
    ]);
  });

  test('sorts sessions by newest update first and ignores malformed index lines', async () => {
    const codexHome = await createCodexHome();

    await writeFile(
      join(codexHome, 'session_index.jsonl'),
      [
        JSON.stringify({id: 'old', thread_name: 'Old', updated_at: '2026-04-15T10:00:00.000Z'}),
        '{not-json',
        JSON.stringify({id: 'new', thread_name: 'New', updated_at: '2026-04-16T10:00:00.000Z'})
      ].join('\n')
    );

    const sessions = await loadCodexSessions({codexHome});

    expect(sessions.map(session => session.id)).toEqual(['new', 'old']);
  });

  test('does not enrich a row from a rollout whose session_meta id does not match the index id', async () => {
    const codexHome = await createCodexHome();
    const sessionId = 'session-from-index';
    const sessionDir = join(codexHome, 'sessions', '2026', '04', '16');

    await mkdir(sessionDir, {recursive: true});
    await writeFile(
      join(codexHome, 'session_index.jsonl'),
      JSON.stringify({
        id: sessionId,
        thread_name: 'Mismatched metadata',
        updated_at: '2026-04-16T10:00:00.000Z'
      })
    );
    await writeFile(
      join(sessionDir, `rollout-2026-04-16T14-48-20-${sessionId}.jsonl`),
      [
        JSON.stringify({
          timestamp: '2026-04-16T11:48:27.097Z',
          type: 'session_meta',
          payload: {
            id: 'different-session',
            cwd: '/tmp/wrong-project'
          }
        })
      ].join('\n')
    );

    const sessions = await loadCodexSessions({codexHome});

    expect(sessions.find(session => session.id === sessionId)).toMatchObject({
      id: sessionId,
      cwd: undefined,
      available: false
    });
    expect(sessions.find(session => session.id === 'different-session')).toMatchObject({
      id: 'different-session',
      cwd: '/tmp/wrong-project',
      available: true
    });
  });
});
