import {execa} from 'execa';

export type CodexAction = {
  kind: 'resume' | 'fork';
  sessionId: string;
  prompt?: string;
};

export type CodexRunResult =
  | {ok: true}
  | {
      ok: false;
      exitCode: number;
      message: string;
    };

export type CodexExecutorResult = {
  failed: boolean;
  exitCode: number;
  shortMessage?: string;
};

export type CodexExecutor = (args: string[]) => Promise<CodexExecutorResult>;

export function buildCodexArgs(action: CodexAction): string[] {
  return [action.kind, action.sessionId, ...(action.prompt ? [action.prompt] : [])];
}

export async function runCodexAction(
  action: CodexAction,
  execute: CodexExecutor = executeCodex
): Promise<CodexRunResult> {
  try {
    const result = await execute(buildCodexArgs(action));

    if (result.failed || result.exitCode !== 0) {
      return {
        ok: false,
        exitCode: result.exitCode,
        message: result.shortMessage ?? `codex exited with code ${result.exitCode}`
      };
    }

    return {ok: true};
  } catch (error) {
    return {
      ok: false,
      exitCode: 1,
      message: error instanceof Error ? error.message : 'codex failed'
    };
  }
}

async function executeCodex(args: string[]): Promise<CodexExecutorResult> {
  const result = await execa('codex', args, {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    reject: false
  });

  return {
    failed: result.failed,
    exitCode: result.exitCode ?? 1,
    shortMessage: result.shortMessage
  };
}
