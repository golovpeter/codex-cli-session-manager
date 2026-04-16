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

describe('App', () => {
  test('renders directory choices before session choices', () => {
    const {lastFrame} = render(
      <App
        sessions={[session, secondSession]}
        currentCwd="/workspace/codex-session-manager"
        onAction={() => {}}
      />
    );

    expect(lastFrame()).toContain('Codex Sessions');
    expect(lastFrame()).toContain('Choose a directory');
    expect(lastFrame()).toContain('codex-session-manager');
    expect(lastFrame()).toContain('actual');
    expect(lastFrame()).not.toContain('Build Codex session navigator');
    expect(lastFrame()).toContain('Enter open');
    expect(lastFrame()).toContain('/ search');
  });

  test('opens the selected directory before showing its available sessions', async () => {
    const {lastFrame, stdin} = render(
      <App sessions={[session]} currentCwd="/workspace/codex-session-manager" onAction={() => {}} />
    );

    stdin.write('\r');
    await new Promise(resolve => {
      setTimeout(resolve, 0);
    });

    expect(lastFrame()).toContain('Build Codex session navigator');
    expect(lastFrame()).toContain('Esc back');
    expect(lastFrame()).toContain('Enter resume');
  });

  test('renders an empty state when no sessions match', () => {
    const {lastFrame} = render(<App sessions={[]} currentCwd="/tmp" onAction={() => {}} />);

    expect(lastFrame()).toContain('No directories found');
  });
});
