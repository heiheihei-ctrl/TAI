import { describe, expect, it } from 'vitest';
import { getTextRequestTimeout } from './textRequestTimeout';

describe('text request timeout budgets', () => {
  it.each(['gpt-6-astra', ' GPT-6-ASTRA ', 'gpt-6'])('allows slow non-streaming generation for %s', (model) => {
    const budget = getTextRequestTimeout(model);
    expect(budget.attemptMs).toBe(90000);
    expect(budget.totalMs).toBeGreaterThan(budget.attemptMs * 2);
    expect(budget.totalMs).toBeLessThan(240000);
  });

  it('keeps fast model budgets unchanged', () => {
    expect(getTextRequestTimeout('gemini-2.5-flash-official')).toEqual({
      attemptMs: 20000, totalMs: 45000,
    });
  });
});