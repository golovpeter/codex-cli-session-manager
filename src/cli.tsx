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
  .name('cx')
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
    let selectedAction: AppAction | undefined;

    const app = render(
      <App
        sessions={sessions}
        currentCwd={options.cwd}
        onAction={action => {
          selectedAction = action;
        }}
      />
    );

    await app.waitUntilExit();

    if (selectedAction) {
      if (selectedAction.kind === 'delete') {
        try {
          const result = await deleteCodexSession({
            codexHome: options.codexHome,
            sessionId: selectedAction.sessionId,
            logPath: selectedAction.logPath
          });
          console.log(
            `Deleted session ${selectedAction.sessionId} (${result.deletedIndexRows} index row${
              result.deletedIndexRows === 1 ? '' : 's'
            }, ${result.deletedLogFile ? 'rollout removed' : 'no rollout removed'})`
          );
        } catch (error) {
          console.error(`cx: ${error instanceof Error ? error.message : 'failed to delete session'}`);
          process.exitCode = 1;
        }

        return;
      }

      const result = await runCodexAction(selectedAction);
      if (!result.ok) {
        console.error(`cx: ${result.message}`);
        process.exitCode = result.exitCode;
      }
    }
  });

await program.parseAsync();
