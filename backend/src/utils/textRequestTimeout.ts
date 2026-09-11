/** Two host attempts fit inside the frontend's 120-second text deadline. */
export function getTextRequestTimeout(_model: string): {
  attemptMs: number;
  totalMs: number;
} {
  return { attemptMs: 55000, totalMs: 115000 };
}