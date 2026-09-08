/** Non-streaming GPT-6 needs a longer response window than fast text models. */
export function getTextRequestTimeout(model: string): {
  attemptMs: number;
  totalMs: number;
} {
  return model.trim().toLowerCase().startsWith('gpt-6')
    ? { attemptMs: 90000, totalMs: 185000 }
    : { attemptMs: 20000, totalMs: 45000 };
}