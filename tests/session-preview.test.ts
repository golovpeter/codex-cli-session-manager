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

  test('keeps early and late excerpts for a larger default preview', () => {
    const lines = Array.from({length: 12}, (_, index) =>
      JSON.stringify({
        type: 'response_item',
        payload: {
          role: index % 2 === 0 ? 'user' : 'assistant',
          content: [{type: index % 2 === 0 ? 'input_text' : 'output_text', text: `message ${index + 1}`}]
        }
      })
    );

    const preview = extractSessionPreviewFromLines(lines);

    expect(preview.excerpts.map(excerpt => excerpt.text)).toEqual([
      'message 1',
      'message 2',
      'message 3',
      'message 4',
      'message 9',
      'message 10',
      'message 11',
      'message 12'
    ]);
  });
});
