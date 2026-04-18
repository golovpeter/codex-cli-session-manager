import type {CodexSession} from './session-store.js';

export type SessionDirectoryGroup = {
  cwd: string;
  latestUpdatedAt: Date;
  sessions: CodexSession[];
};

export function groupSessionsByDirectory(sessions: readonly CodexSession[]): SessionDirectoryGroup[] {
  const groups = new Map<string, CodexSession[]>();

  for (const session of sessions) {
    if (!session.available || !session.cwd) {
      continue;
    }

    const group = groups.get(session.cwd) ?? [];
    group.push(session);
    groups.set(session.cwd, group);
  }

  return [...groups.entries()]
    .map(([cwd, groupSessions]) => {
      const sortedSessions = [...groupSessions].sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
      );

      return {
        cwd,
        latestUpdatedAt: sortedSessions[0]?.updatedAt ?? new Date(0),
        sessions: sortedSessions
      };
    })
    .sort((left, right) => right.latestUpdatedAt.getTime() - left.latestUpdatedAt.getTime());
}
