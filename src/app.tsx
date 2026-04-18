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
  terminalSize?: {
    columns: number;
    rows: number;
  };
};

type ViewMode = 'directories' | 'sessions';

export function App({sessions, currentCwd, onAction, terminalSize}: AppProps) {
  const app = useApp();
  const windowSize = useWindowSize();
  const columns = Math.max(60, terminalSize?.columns ?? windowSize.columns ?? 100);
  const rows = Math.max(12, terminalSize?.rows ?? windowSize.rows ?? 24);
  const isWideLayout = columns >= 120;
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

  function exit(): void {
    app.exit();
  }

  function dispatchActionAndExit(action: Extract<AppAction, {kind: 'resume' | 'fork'}>): void {
    void Promise.resolve(onAction(action)).catch(() => undefined);
    exit();
  }

  const directoryGroups = useMemo(() => {
    const groups = groupSessionsByDirectory(localSessions);
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery || mode !== 'directories') {
      return groups;
    }

    return groups.filter(group => directoryMatchesQuery(group, normalizedQuery));
  }, [localSessions, mode, query]);

  const selectedGroup = useMemo(() => {
    if (mode === 'directories') {
      return directoryGroups[selectedIndex];
    }

    const group = directoryGroups.find(item => item.cwd === selectedCwd);
    if (group || !selectedCwd) {
      return group;
    }

    return {
      cwd: selectedCwd,
      latestUpdatedAt: new Date(0),
      sessions: []
    };
  }, [directoryGroups, mode, selectedCwd, selectedIndex]);

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
        dispatchActionAndExit({
          kind: 'resume',
          sessionId: dangerousResumeCandidate.id,
          dangerouslyBypassApprovalsAndSandbox: true
        });
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
      dispatchActionAndExit({kind: 'resume', sessionId: selectedSession.id});
      return;
    }

    if (input === 'f' && selectedSession?.available) {
      dispatchActionAndExit({kind: 'fork', sessionId: selectedSession.id});
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

    const result = await onAction({
      kind: 'delete',
      sessionId: session.id,
      logPath: session.logPath
    });

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
  const selectedSession = visibleSessions[mode === 'sessions' ? selectedIndex : 0];

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

        {isWideLayout ? (
          <WideCommandCenter
            groups={directoryGroups}
            sessions={visibleSessions}
            mode={mode}
            selectedDirectoryIndex={
              mode === 'directories' ? selectedIndex : directoryGroups.findIndex(group => group.cwd === selectedCwd)
            }
            selectedSessionIndex={mode === 'sessions' ? selectedIndex : 0}
            previewSession={selectedSession}
            columns={columns}
            rows={rows}
          />
        ) : mode === 'directories' ? (
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

        {!isWideLayout && mode === 'sessions' ? (
          <PreviewPanel session={selectedSession} columns={columns - 4} />
        ) : undefined}
      </Box>

      <Footer
        mode={mode}
        isConfirmingDelete={Boolean(deleteCandidate)}
        isConfirmingDangerousResume={Boolean(dangerousResumeCandidate)}
      />
    </Box>
  );
}

function WideCommandCenter({
  groups,
  sessions,
  mode,
  selectedDirectoryIndex,
  selectedSessionIndex,
  previewSession,
  columns,
  rows
}: {
  groups: SessionDirectoryGroup[];
  sessions: CodexSession[];
  mode: ViewMode;
  selectedDirectoryIndex: number;
  selectedSessionIndex: number;
  previewSession: CodexSession | undefined;
  columns: number;
  rows: number;
}) {
  const leftWidth = Math.max(62, Math.floor(columns * 0.58));
  const rightWidth = Math.max(38, columns - leftWidth - 1);
  const panelRows = Math.max(4, Math.floor((rows - 9) / 2));
  const safeDirectoryIndex = Math.max(0, selectedDirectoryIndex);
  const directoryWindowStart = calculateWindowStart(safeDirectoryIndex, groups.length, panelRows);
  const sessionWindowStart = calculateWindowStart(selectedSessionIndex, sessions.length, panelRows);

  return (
    <Box gap={1}>
      <Box flexDirection="column" width={leftWidth}>
        <Box
          borderStyle="round"
          borderColor={mode === 'directories' ? 'cyan' : 'gray'}
          flexDirection="column"
          paddingX={1}
        >
          <PanelTitle title="Directories" hint="Enter open" />
          <DirectoryList
            groups={groups.slice(directoryWindowStart, directoryWindowStart + panelRows)}
            selectedIndex={safeDirectoryIndex}
            windowStart={directoryWindowStart}
            columns={leftWidth - 6}
          />
        </Box>

        <Box
          borderStyle="round"
          borderColor={mode === 'sessions' ? 'cyan' : 'gray'}
          flexDirection="column"
          marginTop={1}
          paddingX={1}
        >
          <PanelTitle title="Sessions" hint="Enter resume" />
          <SessionList
            sessions={sessions.slice(sessionWindowStart, sessionWindowStart + panelRows)}
            selectedIndex={selectedSessionIndex}
            windowStart={sessionWindowStart}
            columns={leftWidth - 6}
          />
        </Box>
      </Box>

      <PreviewPanel session={previewSession} columns={rightWidth - 6} boxed />
    </Box>
  );
}

function PanelTitle({title, hint}: {title: string; hint: string}) {
  return (
    <Box justifyContent="space-between">
      <Text color="green" bold>
        {title}
      </Text>
      <Text color="gray">{hint}</Text>
    </Box>
  );
}

function PreviewPanel({
  session,
  columns,
  boxed = false
}: {
  session: CodexSession | undefined;
  columns: number;
  boxed?: boolean;
}) {
  const content = (
    <Box flexDirection="column">
      <PanelTitle title="Preview" hint="raw excerpts" />
      {session ? (
        <>
          <Text bold>{truncate(session.title, columns)}</Text>
          <Text color="gray">{session.id.slice(0, 8)}</Text>
          <Box marginTop={1} flexDirection="column">
            {session.preview?.excerpts.length ? (
              session.preview.excerpts.map((excerpt, index) => (
                <Text key={`${excerpt.role}-${index}`} color={excerpt.role === 'user' ? 'cyan' : 'green'}>
                  {excerpt.role}: {truncate(excerpt.text, Math.max(12, columns - excerpt.role.length - 2))}
                </Text>
              ))
            ) : (
              <Text color="gray">No visible text preview in this rollout.</Text>
            )}
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">cwd: {truncate(projectLabel(session.cwd), Math.max(12, columns - 5))}</Text>
            <Text color="gray">updated: {formatDate(session.updatedAt)}</Text>
          </Box>
        </>
      ) : (
        <Text color="gray">Select a session to preview.</Text>
      )}
    </Box>
  );

  if (!boxed) {
    return (
      <Box borderStyle="round" borderColor="gray" flexDirection="column" marginTop={1} paddingX={1}>
        {content}
      </Box>
    );
  }

  return (
    <Box borderStyle="round" borderColor="green" flexDirection="column" width={columns + 6} paddingX={1}>
      {content}
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
    <Box flexDirection="column" marginBottom={1} borderStyle="round" borderColor="green" paddingX={1}>
      <Text bold color="green">
        cdx-sessions
      </Text>
      <Text>{title}</Text>
      <Text color="gray">
        Search: {isSearching ? <Text color="cyan">{query || ' '}</Text> : query || ' '} | {totalDirectories} dirs |{' '}
        {totalSessions} sessions
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
          <DirectoryRow key={group.cwd} group={group} isSelected={absoluteIndex === selectedIndex} columns={columns} />
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

function SessionRow({session, isSelected, columns}: {session: CodexSession; isSelected: boolean; columns: number}) {
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
  return [group.cwd, projectLabel(group.cwd), directoryLabel(group.cwd)].join(' ').toLowerCase().includes(query);
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
