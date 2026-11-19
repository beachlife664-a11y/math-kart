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

  const values = new Set<number>([answer]);
  const offsets = [-10, -5, -3, -2, -1, 1, 2, 3, 5, 10];
  while (values.size < 4) {
    const offset = offsets[Math.floor(random() * offsets.length)];
    const candidate = Math.max(0, answer + offset);
    values.add(candidate);
  }
  const options = [...values];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { id, text, options, correctIndex: options.indexOf(answer), selectedIndex: null, isCorrect: null, challenge: null, rewardLabel: null };
}
