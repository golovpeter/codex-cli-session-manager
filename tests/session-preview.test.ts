import {describe, expect, test} from 'vitest';
import {extractSessionPreviewFromLines} from '../src/session-preview.js';

describe('extractSessionPreviewFromLines', () => {
  test('extracts short raw user and assistant excerpts from response items', () => {
    const preview = extractSessionPreviewFromLines([
      JSON.stringify({
        type: 'response_item',
        payload: {
          role: 'user',
          content: [{type: 'input_text', text: 'Make the terminal interface more colorful and add a preview pane.'}]
        }
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          role: 'assistant',
          content: [{type: 'output_text', text: 'I will inspect the current Ink layout and session files.'}]
        }
      })
    ]);

    expect(preview.excerpts).toEqual([
      {
        role: 'user',
        text: 'Make the terminal interface more colorful and add a preview pane.'
      },
      {
        role: 'assistant',
        text: 'I will inspect the current Ink layout and session files.'
      }
    ]);
  });

  test('clips excerpts and ignores tool, encrypted, and malformed rows', () => {
    const preview = extractSessionPreviewFromLines(
      [
        '{bad json',
        JSON.stringify({
          type: 'response_item',
          payload: {
            type: 'function_call',
            name: 'exec_command',
            arguments: '{"cmd":"npm test"}'
          }
        }),
        JSON.stringify({
          type: 'response_item',
          payload: {
            role: 'assistant',
            encrypted_content: 'opaque'
          }
        }),
        JSON.stringify({
          type: 'response_item',
          payload: {
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'This is a very long answer that should be clipped so the preview stays compact.'
              }
            ]
          }
        })
      ],
      {maxExcerptLength: 42}
    );

    expect(preview.excerpts).toEqual([
      {
        role: 'assistant',
        text: 'This is a very long answer that should...'
      }
    ]);
    expect(preview.excerpts[0]?.text.length).toBeLessThanOrEqual(42);
  });
});
