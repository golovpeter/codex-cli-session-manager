import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, test} from 'vitest';
import {App} from '../src/app.js';
import type {CodexSession} from '../src/session-store.js';

const session = {
  id: '019d961e-e759-7dc1-8de3-e852fbbde4e7',
  title: 'Build Codex session navigator',
  updatedAt: new Date('2026-04-16T11:48:27.097Z'),
  cwd: '/workspace/codex-session-manager',
  cliVersion: '0.121.0',
  originator: 'codex-tui',
  modelProvider: 'openai',
  logPath: '/home/dev/.codex/sessions/2026/04/16/rollout.jsonl',
  available: true
} satisfies CodexSession;

const secondSession = {
  ...session,
  id: '019d961e-e759-7dc1-8de3-e852fbbde4e7-second',
  title: 'Fix Keycloak CA mount',
  cwd: '/workspace/actual',
  updatedAt: new Date('2026-04-15T11:48:27.097Z')
} satisfies CodexSession;

const previewSession = {
  ...session,
  preview: {
    excerpts: [
      {role: 'user', text: 'Make the terminal interface more colorful.'},
      {role: 'assistant', text: 'I will add a responsive preview panel.'}
    ]
  }
} satisfies CodexSession;

const longPreviewSession = {
  ...session,
  preview: {
    excerpts: Array.from({length: 8}, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text: `preview line ${index + 1}`
    }))
  }
} satisfies CodexSession;

const noop = () => undefined;

describe('App', () => {
  test('renders a wide command center with directories, sessions, and preview', () => {
    const props = {
      sessions: [previewSession, secondSession],
      currentCwd: '/workspace/codex-session-manager',
      onAction: noop,
      terminalSize: {columns: 140, rows: 32}
    };

    const {lastFrame} = render(<App {...props} />);

    expect(lastFrame()).toContain('Directories');
    expect(lastFrame()).toContain('Sessions');
    expect(lastFrame()).toContain('Preview');
    expect(lastFrame()).toContain('Build Codex session navigator');
    expect(lastFrame()).toContain('Make the terminal interface more colorful.');
    expect(lastFrame()).toContain('responsive preview panel');
  });

  test('renders directory choices before session choices', () => {
    const {lastFrame} = render(
      <App sessions={[session, secondSession]} currentCwd="/workspace/codex-session-manager" onAction={noop} />
    );

    expect(lastFrame()).toContain('cdx-sessions');
    expect(lastFrame()).toContain('Choose a directory');
    expect(lastFrame()).toContain('codex-session-manager');
    expect(lastFrame()).toContain('actual');
    expect(lastFrame()).not.toContain('Build Codex session navigator');
    expect(lastFrame()).toContain('Enter open');
    expect(lastFrame()).toContain('/ search');
  });

  test('opens the selected directory before showing its available sessions', async () => {
    const {lastFrame, stdin} = render(
      <App sessions={[session]} currentCwd="/workspace/codex-session-manager" onAction={noop} />
    );

    stdin.write('\r');
    await new Promise(resolve => {
      setTimeout(resolve, 0);
    });

    expect(lastFrame()).toContain('Build Codex session navigator');
    expect(lastFrame()).toContain('Esc back');
    expect(lastFrame()).toContain('Enter resume');
  });

  test('returns to the previously selected directory after leaving sessions', async () => {
    const {lastFrame, stdin} = render(
      <App sessions={[session, secondSession]} currentCwd="/workspace/codex-session-manager" onAction={noop} />
    );

    stdin.write('j');
    await waitForInput();
    stdin.write('\r');
    await waitForInput();
    stdin.write('b');
    await waitForInput();
    stdin.write('\r');
    await waitForInput();

    expect(lastFrame()).toContain('Fix Keycloak CA mount');
    expect(lastFrame()).not.toContain('Build Codex session navigator');
  });

  test('renders preview below sessions in compact layout', async () => {
    const {lastFrame, stdin} = render(
      <App sessions={[previewSession]} currentCwd="/workspace/codex-session-manager" onAction={noop} />
    );

    stdin.write('\r');
    await waitForInput();

    expect(lastFrame()).toContain('Preview');
    expect(lastFrame()).toContain('Make the terminal interface more colorful.');
    expect(lastFrame()).toContain('raw excerpts');
  });

  test('uses available wide preview space for a larger session preview', () => {
    const {lastFrame} = render(
      <App
        sessions={[longPreviewSession]}
        currentCwd="/workspace/codex-session-manager"
        onAction={noop}
        terminalSize={{columns: 140, rows: 34}}
      />
    );

    expect(lastFrame()).toContain('preview line 1');
    expect(lastFrame()).toContain('preview line 8');
    expect(lastFrame()).toContain('Raw preview only');
  });

  test('renders an empty state when no sessions match', () => {
    const {lastFrame} = render(<App sessions={[]} currentCwd="/tmp" onAction={noop} />);

    expect(lastFrame()).toContain('No directories found');
  });

  test('deletes a selected session after Enter confirmation without exiting', async () => {
    const actions: unknown[] = [];
    const {lastFrame, stdin} = render(
      <App
        sessions={[session]}
        currentCwd="/workspace/codex-session-manager"
        onAction={action => {
          actions.push(action);
          return {ok: true};
        }}
      />
    );

    stdin.write('\r');
    await waitForInput();
    stdin.write('d');
    await waitForInput();

    expect(lastFrame()).toContain('Delete this session?');
    expect(lastFrame()).toContain('Enter confirm');

    stdin.write('\r');
    await waitForInput();

    expect(actions).toEqual([
      {
        kind: 'delete',
        sessionId: session.id,
        logPath: session.logPath
      }
    ]);
    expect(lastFrame()).toContain('No sessions found in this directory');
    expect(lastFrame()).not.toContain('Deleted session');
  });

  test('cancels delete confirmation with n', async () => {
    const actions: unknown[] = [];
    const {lastFrame, stdin} = render(
      <App
        sessions={[session]}
        currentCwd="/workspace/codex-session-manager"
        onAction={action => {
          actions.push(action);
        }}
      />
    );

    stdin.write('\r');
    await waitForInput();
    stdin.write('d');
    await waitForInput();
    stdin.write('n');
    await waitForInput();

    expect(lastFrame()).toContain('Build Codex session navigator');
    expect(lastFrame()).not.toContain('Delete this session?');
    expect(actions).toEqual([]);
  });

  test('asks for confirmation before resuming with dangerous bypass mode', async () => {
    const actions: unknown[] = [];
    const {lastFrame, stdin} = render(
      <App
        sessions={[session]}
        currentCwd="/workspace/codex-session-manager"
        onAction={action => {
          actions.push(action);
        }}
      />
    );

    stdin.write('\r');
    await waitForInput();
    stdin.write('!');
    await waitForInput();

    expect(lastFrame()).toContain('Resume without approvals or sandbox?');
    expect(lastFrame()).toContain('Enter confirm');

    stdin.write('\r');
    await waitForInput();

    expect(actions).toEqual([
      {
        kind: 'resume',
        sessionId: session.id,
        dangerouslyBypassApprovalsAndSandbox: true
      }
    ]);
  });
});

async function waitForInput() {
  await new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}
