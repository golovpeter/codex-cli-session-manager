import {resolve} from 'node:path';
import type {CodexSession} from './session-store.js';

export type SessionFilterScope = 'all' | 'current-cwd';

export type SessionFilterOptions = {
  query: string;
  scope: SessionFilterScope;
  currentCwd?: string;
};

export function filterSessions(
  sessions: readonly CodexSession[],
  options: SessionFilterOptions
): CodexSession[] {
  const query = options.query.trim().toLowerCase();
  const currentCwd = options.currentCwd ? normalizePath(options.currentCwd) : undefined;

  return sessions.filter(session => {
    if (
      options.scope === 'current-cwd' &&
      currentCwd &&
      normalizePath(session.cwd) !== currentCwd
    ) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [session.id, session.title, session.cwd ?? '', session.updatedAt.toISOString()]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

function normalizePath(path: string | undefined): string | undefined {
  return path ? resolve(path) : undefined;
}
