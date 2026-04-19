import { describe, expect, it } from 'bun:test';
import { formatPrompt } from './approval.ts';

describe('formatPrompt', () => {
  it('formats question with default choices', () => {
    const result = formatPrompt('Continue?');
    expect(result).toBe('Continue? [y/N] ');
  });

  it('formats question with custom choices and default', () => {
    const result = formatPrompt('Approve plan?', {
      choices: ['y', 'n', 'edit'],
      defaultChoice: 'n',
    });
    expect(result).toBe('Approve plan? [y/N/edit] ');
  });

  it('capitalizes the default choice', () => {
    const result = formatPrompt('Continue?', { choices: ['y', 'n'], defaultChoice: 'y' });
    expect(result).toBe('Continue? [Y/n] ');
  });

  it('capitalizes N when N is default', () => {
    const result = formatPrompt('Continue?', { choices: ['y', 'n'], defaultChoice: 'n' });
    expect(result).toBe('Continue? [y/N] ');
  });
});
