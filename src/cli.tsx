#!/usr/bin/env node
import React from 'react';
import {Command} from 'commander';
import {render} from 'ink';
import {loadCodexSessions} from './session-store.js';
import {App, type AppAction} from './app.js';
import {runCodexAction} from './codex-runner.js';
import {deleteCodexSession} from './session-delete.js';

const program = new Command();

program
  .name('cdx-sessions')
  .description('Interactive Codex session navigator')
  .version('0.1.0')
  .option('--codex-home <path>', 'Path to the Codex home directory')
  .option('--cwd <path>', 'Current working directory used for the scope toggle', process.cwd())
  .option('--include-subagents', 'Show sessions created by delegated Codex subagents')
  .action(async options => {
    const sessions = await loadCodexSessions({
      codexHome: options.codexHome,
      includeSubagents: options.includeSubagents
    });
    let selectedAction: Extract<AppAction, {kind: 'resume' | 'fork'}> | undefined;

    const app = render(
      <App
        sessions={sessions}
        currentCwd={options.cwd}
        onAction={async action => {
          if (action.kind === 'delete') {
            try {
              await deleteCodexSession({
                codexHome: options.codexHome,
                sessionId: action.sessionId,
                logPath: action.logPath
              });
              return {ok: true};
            } catch (error) {
              return {
                ok: false,
                message: error instanceof Error ? error.message : 'failed to delete session'
              };
            }
          }

          selectedAction = action;
          return {ok: true};
        }}
      />
    );

    await app.waitUntilExit();

    if (selectedAction) {
      const result = await runCodexAction(selectedAction);
      if (!result.ok) {
        console.error(`cdx-sessions: ${result.message}`);
        process.exitCode = result.exitCode;
      }
    }
  });

await program.parseAsync();
