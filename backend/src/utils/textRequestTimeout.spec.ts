import { describe, expect, it } from 'vitest';
import { getTextRequestTimeout } from './textRequestTimeout';

describe('text request timeout budgets', () => {
  it.each(['gpt-6-astra', ' GPT-6-ASTRA ', 'gpt-6'])('allows slow non-streaming generation for %s', (model) => {
    const budget = getTextRequestTimeout(model);
    expect(budget.attemptMs).toBe(55000);
    expect(budget.totalMs).toBeGreaterThan(budget.attemptMs * 2);
    expect(budget.totalMs).toBeLessThan(120000);
  });

  it('reserves time for both hosts and response processing', () => {
    expect(getTextRequestTimeout('gemini-2.5-flash-official')).toEqual({
      attemptMs: 55000, totalMs: 115000,
    });
  });
});