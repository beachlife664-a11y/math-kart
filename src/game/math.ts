import type { IMathQuestion } from './types';

export function createMathQuestion(random: () => number, id: number): IMathQuestion {
  const kind = Math.floor(random() * 5);
  let answer = 0;
  let text = '';
  if (kind === 0) {
    const a = 8 + Math.floor(random() * 73);
    const b = 4 + Math.floor(random() * 55);
    answer = a + b;
    text = `${a} + ${b} = ?`;
  } else if (kind === 1) {
    const a = 28 + Math.floor(random() * 65);
    const b = 3 + Math.floor(random() * (a - 3));
    answer = a - b;
    text = `${a} − ${b} = ?`;
  } else if (kind === 2) {
    const a = 2 + Math.floor(random() * 9);
    const b = 2 + Math.floor(random() * 9);
    answer = a * b;
    text = `${a} × ${b} = ?`;
  } else if (kind === 3) {
    const divisor = 2 + Math.floor(random() * 8);
    answer = 2 + Math.floor(random() * 9);
    text = `${divisor * answer} ÷ ${divisor} = ?`;
  } else {
    const a = 3 + Math.floor(random() * 8);
    const b = 2 + Math.floor(random() * 7);
    const c = 4 + Math.floor(random() * 18);
    answer = a * b + c;
    text = `${a} × ${b} + ${c} = ?`;
  }

  return { id, text, answer, submittedAnswer: null, isCorrect: null, challenge: null, rewardLabel: null };
}
