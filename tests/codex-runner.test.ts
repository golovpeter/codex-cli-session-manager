import {describe, expect, test} from 'vitest';
import {buildCodexArgs, runCodexAction} from '../src/codex-runner.js';

describe('buildCodexArgs', () => {
  test('builds a resume invocation for a selected session', () => {
    expect(buildCodexArgs({kind: 'resume', sessionId: 'session-123'})).toEqual(['resume', 'session-123']);
  });

  test('builds a fork invocation for a selected session', () => {
    expect(buildCodexArgs({kind: 'fork', sessionId: 'session-123'})).toEqual(['fork', 'session-123']);
  });

  test('appends an optional prompt after the session id', () => {
    expect(buildCodexArgs({kind: 'resume', sessionId: 'session-123', prompt: 'continue here'})).toEqual([
      'resume',
      'session-123',
      'continue here'
    ]);
  });

  test('places the dangerous bypass flag before the resume command', () => {
    expect(
      buildCodexArgs({
        kind: 'resume',
        sessionId: 'session-123',
        dangerouslyBypassApprovalsAndSandbox: true
      })
    ).toEqual(['--dangerously-bypass-approvals-and-sandbox', 'resume', 'session-123']);
  });

  test('returns a failed result instead of throwing when codex exits non-zero', async () => {
    const result = await runCodexAction({kind: 'resume', sessionId: 'session-123'}, () =>
      Promise.resolve({
        failed: true,
        exitCode: 2,
        shortMessage: 'codex failed'
      })
    );

    expect(result).toEqual({
      ok: false,
      exitCode: 2,
      message: 'codex failed'
    });
  });
});
