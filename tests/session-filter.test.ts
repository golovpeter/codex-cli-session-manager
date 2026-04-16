import {describe, expect, test} from 'vitest';
import {filterSessions} from '../src/session-filter.js';
import type {CodexSession} from '../src/session-store.js';

const baseSession = {
  updatedAt: new Date('2026-04-16T10:00:00.000Z'),
  cliVersion: undefined,
  originator: undefined,
  modelProvider: undefined,
  logPath: undefined,
  available: true
} satisfies Partial<CodexSession>;

const sessions: CodexSession[] = [
  {
    ...baseSession,
    id: 'session-keycloak',
    title: 'Fix Keycloak CA mount',
    cwd: '/workspace/actual'
  },
  {
    ...baseSession,
    id: 'session-codex',
    title: 'Build Codex session navigator',
    cwd: '/workspace/codex-session-manager'
  },
  {
    ...baseSession,
    id: 'session-missing',
    title: 'Missing project',
    cwd: undefined,
    available: false
  }
];

describe('filterSessions', () => {
  test('matches sessions by title, cwd, or id case-insensitively', () => {
    expect(filterSessions(sessions, {query: 'keycloak', scope: 'all'}).map(session => session.id)).toEqual([
      'session-keycloak'
    ]);
    expect(filterSessions(sessions, {query: 'CODEX-SESSION', scope: 'all'}).map(session => session.id)).toEqual([
      'session-codex'
    ]);
    expect(filterSessions(sessions, {query: 'missing', scope: 'all'}).map(session => session.id)).toEqual([
      'session-missing'
    ]);
  });

  test('can restrict results to the current working directory', () => {
    const filtered = filterSessions(sessions, {
      query: '',
      scope: 'current-cwd',
      currentCwd: '/workspace/actual'
    });

    expect(filtered.map(session => session.id)).toEqual(['session-keycloak']);
  });

  test('normalizes current cwd comparisons before applying current-cwd scope', () => {
    const filtered = filterSessions(sessions, {
      query: '',
      scope: 'current-cwd',
      currentCwd: '/workspace/actual/'
    });

    expect(filtered.map(session => session.id)).toEqual(['session-keycloak']);
  });

  test('keeps all sessions when current cwd scope has no cwd to compare', () => {
    expect(filterSessions(sessions, {query: '', scope: 'current-cwd'}).map(session => session.id)).toEqual([
      'session-keycloak',
      'session-codex',
      'session-missing'
    ]);
  });
});
