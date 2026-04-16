import {describe, expect, test} from 'vitest';
import {groupSessionsByDirectory} from '../src/session-groups.js';
import type {CodexSession} from '../src/session-store.js';

function session(overrides: Partial<CodexSession> & Pick<CodexSession, 'id' | 'title' | 'cwd' | 'updatedAt'>): CodexSession {
  return {
    cliVersion: undefined,
    originator: undefined,
    modelProvider: undefined,
    logPath: '/tmp/rollout.jsonl',
    available: true,
    ...overrides
  };
}

describe('groupSessionsByDirectory', () => {
  test('groups available sessions by cwd and sorts directories by latest activity', () => {
    const groups = groupSessionsByDirectory([
      session({
        id: 'older-api',
        title: 'Older API work',
        cwd: '/repo/api',
        updatedAt: new Date('2026-04-14T10:00:00.000Z')
      }),
      session({
        id: 'web',
        title: 'Web work',
        cwd: '/repo/web',
        updatedAt: new Date('2026-04-16T10:00:00.000Z')
      }),
      session({
        id: 'newer-api',
        title: 'Newer API work',
        cwd: '/repo/api',
        updatedAt: new Date('2026-04-15T10:00:00.000Z')
      })
    ]);

    expect(groups.map(group => [group.cwd, group.sessions.map(item => item.id)])).toEqual([
      ['/repo/web', ['web']],
      ['/repo/api', ['newer-api', 'older-api']]
    ]);
    expect(groups[1]?.latestUpdatedAt).toEqual(new Date('2026-04-15T10:00:00.000Z'));
  });

  test('omits unavailable sessions and rows without cwd from directory choices', () => {
    const groups = groupSessionsByDirectory([
      session({
        id: 'available',
        title: 'Available',
        cwd: '/repo/available',
        updatedAt: new Date('2026-04-16T10:00:00.000Z')
      }),
      session({
        id: 'missing',
        title: 'Missing',
        cwd: '/repo/missing',
        updatedAt: new Date('2026-04-16T11:00:00.000Z'),
        available: false
      }),
      session({
        id: 'unknown',
        title: 'Unknown',
        cwd: undefined,
        updatedAt: new Date('2026-04-16T12:00:00.000Z')
      })
    ]);

    expect(groups.map(group => group.cwd)).toEqual(['/repo/available']);
  });
});
