import {basename, dirname} from 'node:path';
import {homedir} from 'node:os';
import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useInput, usePaste, useWindowSize} from 'ink';
import {filterSessions} from './session-filter.js';
import {groupSessionsByDirectory, type SessionDirectoryGroup} from './session-groups.js';
import type {CodexSession} from './session-store.js';

export type AppAction =
  | {
      kind: 'resume' | 'fork';
      sessionId: string;
      dangerouslyBypassApprovalsAndSandbox?: boolean;
    }
  | {
      kind: 'delete';
      sessionId: string;
      logPath: string | undefined;
    };

export type AppActionResult = {ok: true} | {ok: false; message: string};

export type AppProps = {
  sessions: readonly CodexSession[];
  currentCwd: string;
  onAction: (action: AppAction) => AppActionResult | void | Promise<AppActionResult | void>;
};

type ViewMode = 'directories' | 'sessions';

export function App({sessions, currentCwd, onAction}: AppProps) {
  const {exit} = useApp();
  const windowSize = useWindowSize();
  const columns = Math.max(60, windowSize.columns ?? 100);
  const rows = Math.max(12, windowSize.rows ?? 24);
  const visibleRows = Math.max(4, rows - 8);
  const [localSessions, setLocalSessions] = useState(() => [...sessions]);
  const [mode, setMode] = useState<ViewMode>('directories');
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCwd, setSelectedCwd] = useState<string | undefined>();
  const [deleteCandidate, setDeleteCandidate] = useState<CodexSession | undefined>();
  const [dangerousResumeCandidate, setDangerousResumeCandidate] = useState<CodexSession | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const directoryGroups = useMemo(() => {
    const groups = groupSessionsByDirectory(localSessions);
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery || mode !== 'directories') {
      return groups;
    }

    return groups.filter(group => directoryMatchesQuery(group, normalizedQuery));
  }, [localSessions, mode, query]);

  const selectedGroup = useMemo(() => {
    const group = directoryGroups.find(item => item.cwd === selectedCwd);
    if (group || !selectedCwd || mode !== 'sessions') {
      return group;
    }

    return {
      cwd: selectedCwd,
      latestUpdatedAt: new Date(0),
      sessions: []
    };
  }, [directoryGroups, mode, selectedCwd]);

  const visibleSessions = useMemo(() => {
    if (!selectedGroup) {
      return [];
    }

    return filterSessions(selectedGroup.sessions, {query, scope: 'all', currentCwd});
  }, [currentCwd, query, selectedGroup]);

  const currentRows = mode === 'directories' ? directoryGroups : visibleSessions;

  useEffect(() => {
    setSelectedIndex(index => clamp(index, 0, Math.max(currentRows.length - 1, 0)));
  }, [currentRows.length]);

  usePaste(text => {
    if (isSearching) {
      setQuery(value => `${value}${text}`);
    }
  });

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    if (isSearching) {
      handleSearchInput(input, key, setQuery, setIsSearching);
      return;
    }

    if (deleteCandidate) {
      if (key.return && !isDeleting) {
        void confirmDelete(deleteCandidate);
        return;
      }

      if (input === 'n' || key.escape) {
        setDeleteCandidate(undefined);
      }

      return;
    }

    if (dangerousResumeCandidate) {
      if (key.return) {
        onAction({
          kind: 'resume',
          sessionId: dangerousResumeCandidate.id,
          dangerouslyBypassApprovalsAndSandbox: true
        });
        exit();
        return;
      }

      if (input === 'n' || key.escape) {
        setDangerousResumeCandidate(undefined);
      }

      return;
    }

    if (input === 'q') {
      exit();
      return;
    }

    if (input === '/') {
      setIsSearching(true);
      return;
    }

    if (mode === 'sessions' && (key.escape || key.backspace || key.delete || input === 'b')) {
      setMode('directories');
      setSelectedCwd(undefined);
      setSelectedIndex(0);
      setQuery('');
      setDeleteCandidate(undefined);
      setDangerousResumeCandidate(undefined);
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelectedIndex(index => clamp(index + 1, 0, Math.max(currentRows.length - 1, 0)));
      return;
    }

    if (key.upArrow || input === 'k') {
      setSelectedIndex(index => clamp(index - 1, 0, Math.max(currentRows.length - 1, 0)));
      return;
    }

    if (mode === 'directories') {
      const selectedDirectory = directoryGroups[selectedIndex];
      if (key.return && selectedDirectory) {
        setSelectedCwd(selectedDirectory.cwd);
        setMode('sessions');
        setSelectedIndex(0);
        setQuery('');
      }

      return;
    }

    const selectedSession = visibleSessions[selectedIndex];

    if (key.return && selectedSession?.available) {
      onAction({kind: 'resume', sessionId: selectedSession.id});
      exit();
      return;
    }

    if (input === 'f' && selectedSession?.available) {
      onAction({kind: 'fork', sessionId: selectedSession.id});
      exit();
      return;
    }

    if (input === 'd' && selectedSession) {
      setDeleteCandidate(selectedSession);
      setErrorMessage(undefined);
      return;
    }

    if (input === '!' && selectedSession?.available) {
      setDangerousResumeCandidate(selectedSession);
    }
  });

  async function confirmDelete(session: CodexSession): Promise<void> {
    setIsDeleting(true);
    setErrorMessage(undefined);

    const result = await onAction({kind: 'delete', sessionId: session.id, logPath: session.logPath});

    if (result?.ok === false) {
      setErrorMessage(result.message);
      setIsDeleting(false);
      return;
    }

    setLocalSessions(items => items.filter(item => item.id !== session.id));
    setDeleteCandidate(undefined);
    setIsDeleting(false);
  }

  const windowStart = calculateWindowStart(selectedIndex, currentRows.length, visibleRows);
  const rowsToRender = currentRows.slice(windowStart, windowStart + visibleRows);

  return (
    <Box flexDirection="column" width={columns} minHeight={rows}>
      <Header
        mode={mode}
        query={query}
        isSearching={isSearching}
        totalDirectories={directoryGroups.length}
        totalSessions={localSessions.length}
        selectedGroup={selectedGroup}
      />

      <Box flexDirection="column" flexGrow={1}>
        {deleteCandidate ? (
          <DeleteConfirmation session={deleteCandidate} isDeleting={isDeleting} errorMessage={errorMessage} />
        ) : undefined}

        {dangerousResumeCandidate ? <DangerousResumeConfirmation session={dangerousResumeCandidate} /> : undefined}

        {mode === 'directories' ? (
          <DirectoryList
            groups={rowsToRender as SessionDirectoryGroup[]}
            selectedIndex={selectedIndex}
            windowStart={windowStart}
            columns={columns}
          />
        ) : (
          <SessionList
            sessions={rowsToRender as CodexSession[]}
            selectedIndex={selectedIndex}
            windowStart={windowStart}
            columns={columns}
          />
        )}
      </Box>

      <Footer
        mode={mode}
        isConfirmingDelete={Boolean(deleteCandidate)}
        isConfirmingDangerousResume={Boolean(dangerousResumeCandidate)}
      />
    </Box>
  );
}

function DangerousResumeConfirmation({session}: {session: CodexSession}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="red">Resume without approvals or sandbox?</Text>
      <Text>{session.title}</Text>
      <Text color="yellow">Codex will run with --dangerously-bypass-approvals-and-sandbox.</Text>
    </Box>
  );
}

function DeleteConfirmation({
  session,
  isDeleting,
  errorMessage
}: {
  session: CodexSession;
  isDeleting: boolean;
  errorMessage: string | undefined;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="yellow">Delete this session?</Text>
      <Text>{session.title}</Text>
      {isDeleting ? <Text color="gray">Deleting...</Text> : undefined}
      {errorMessage ? <Text color="red">{errorMessage}</Text> : undefined}
    </Box>
  );
}

function Header({
  mode,
  query,
  isSearching,
  totalDirectories,
  totalSessions,
  selectedGroup
}: {
  mode: ViewMode;
  query: string;
  isSearching: boolean;
  totalDirectories: number;
  totalSessions: number;
  selectedGroup: SessionDirectoryGroup | undefined;
}) {
  const title = mode === 'directories' ? 'Choose a directory' : projectLabel(selectedGroup?.cwd);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Codex Sessions</Text>
      <Text>{title}</Text>
      <Text color="gray">
        Search: {isSearching ? <Text color="cyan">{query || ' '}</Text> : query || ' '} |{' '}
        {totalDirectories} dirs | {totalSessions} sessions
      </Text>
    </Box>
  );
}

function DirectoryList({
  groups,
  selectedIndex,
  windowStart,
  columns
}: {
  groups: SessionDirectoryGroup[];
  selectedIndex: number;
  windowStart: number;
  columns: number;
}) {
  if (groups.length === 0) {
    return <Text color="yellow">No directories found</Text>;
  }

  return (
    <Box flexDirection="column">
      {groups.map((group, index) => {
        const absoluteIndex = windowStart + index;
        return (
          <DirectoryRow
            key={group.cwd}
            group={group}
            isSelected={absoluteIndex === selectedIndex}
            columns={columns}
          />
        );
      })}
    </Box>
  );
}

function SessionList({
  sessions,
  selectedIndex,
  windowStart,
  columns
}: {
  sessions: CodexSession[];
  selectedIndex: number;
  windowStart: number;
  columns: number;
}) {
  if (sessions.length === 0) {
    return <Text color="yellow">No sessions found in this directory</Text>;
  }

  return (
    <Box flexDirection="column">
      {sessions.map((session, index) => {
        const absoluteIndex = windowStart + index;
        return (
          <SessionRow
            key={session.id}
            session={session}
            isSelected={absoluteIndex === selectedIndex}
            columns={columns}
          />
        );
      })}
    </Box>
  );
}

function DirectoryRow({
  group,
  isSelected,
  columns
}: {
  group: SessionDirectoryGroup;
  isSelected: boolean;
  columns: number;
}) {
  const marker = isSelected ? '>' : ' ';
  const count = `${group.sessions.length} ${group.sessions.length === 1 ? 'session' : 'sessions'}`;
  const prefix = `${marker} ${formatDate(group.latestUpdatedAt)}  ${padRight(count, 10)}  `;
  const cwdText = directoryLabel(group.cwd);

  return (
    <Text inverse={isSelected}>
      {prefix}
      {truncate(cwdText, columns - prefix.length)}
    </Text>
  );
}

function SessionRow({
  session,
  isSelected,
  columns
}: {
  session: CodexSession;
  isSelected: boolean;
  columns: number;
}) {
  const marker = isSelected ? '>' : ' ';
  const prefix = `${marker} ${formatDate(session.updatedAt)}  `;

  return (
    <Text color={session.available ? undefined : 'gray'} inverse={isSelected}>
      {prefix}
      {truncate(session.title, columns - prefix.length)}
    </Text>
  );
}

function Footer({
  mode,
  isConfirmingDelete,
  isConfirmingDangerousResume
}: {
  mode: ViewMode;
  isConfirmingDelete: boolean;
  isConfirmingDangerousResume: boolean;
}) {
  const hint = isConfirmingDangerousResume
    ? 'Enter confirm unsafe resume   n/Esc cancel'
    : isConfirmingDelete
    ? 'Enter confirm delete   n/Esc cancel'
    : mode === 'directories'
      ? 'Enter open   j/k move   / search directories   q quit'
      : 'Enter resume   ! unsafe resume   f fork   d delete   Esc back   j/k move   / search sessions   q quit';

  return (
    <Box marginTop={1}>
      <Text color="gray">{hint}</Text>
    </Box>
  );
}

function handleSearchInput(
  input: string,
  key: Parameters<Parameters<typeof useInput>[0]>[1],
  setQuery: React.Dispatch<React.SetStateAction<string>>,
  setIsSearching: React.Dispatch<React.SetStateAction<boolean>>
) {
  if (key.escape) {
    setIsSearching(false);
    return;
  }

  if (key.return) {
    setIsSearching(false);
    return;
  }

  if (key.backspace || key.delete) {
    setQuery(value => value.slice(0, -1));
    return;
  }

  if (input && !key.ctrl && !key.meta) {
    setQuery(value => `${value}${input}`);
  }
}

function directoryMatchesQuery(group: SessionDirectoryGroup, query: string): boolean {
  return [group.cwd, projectLabel(group.cwd), directoryLabel(group.cwd)]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

function calculateWindowStart(selectedIndex: number, totalRows: number, visibleRows: number): number {
  if (totalRows <= visibleRows) {
    return 0;
  }

  return clamp(selectedIndex - Math.floor(visibleRows / 2), 0, totalRows - visibleRows);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function directoryLabel(cwd: string): string {
  const parent = dirname(cwd);
  const leaf = basename(cwd);
  return `${projectLabel(parent)}/${leaf}`;
}

function projectLabel(cwd: string | undefined): string {
  if (!cwd) {
    return 'unknown';
  }

  const home = homedir();
  if (cwd === home) {
    return '~';
  }

  if (cwd.startsWith(`${home}/`)) {
    return `~/${cwd.slice(home.length + 1)}`;
  }

  return cwd;
}

function padRight(value: string, width: number): string {
  if (value.length >= width) {
    return value.slice(0, width);
  }

  return `${value}${' '.repeat(width - value.length)}`;
}

function truncate(value: string, width: number): string {
  if (width <= 1) {
    return '';
  }

  if (value.length <= width) {
    return value;
  }

  return `${value.slice(0, width - 1)}…`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
