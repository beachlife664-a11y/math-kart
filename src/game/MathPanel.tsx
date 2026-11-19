import { Check, Sigma, X, Zap } from 'lucide-react';
import type { GameSnapshot } from './types';

interface MathPanelProps {
  snapshot: GameSnapshot;
  onAnswer: (index: number) => void;
}

export default function MathPanel({ snapshot, onAnswer }: MathPanelProps) {
  const question = snapshot.question;
  const correctAnswer = question?.options[question.correctIndex];
  return (
    <section className={`math-panel ${snapshot.questionFeedback ?? ''} ${question?.challenge ? 'challenge' : ''}`} aria-label="数学加速题">
      <div className="math-meta">
        <span><Sigma size={16} /> {question?.challenge ? '路段奖励题' : '数学加油站'}</span>
        <span className="energy-meter" aria-label={`连对能量 ${snapshot.energy}%`}><i><em style={{ width: `${snapshot.energy}%` }} /></i><b>能量 {snapshot.energy}</b></span>
        <span className="math-score">答对 {snapshot.correctCount} · 连对 {snapshot.streak} · 超车 {snapshot.overtakeCount}</span>
      </div>
      {question ? (
        <>
          <div className="question-row">
            <div className="question-text"><small>{question.challenge ? '答对改变接下来路线' : '选择正确答案'}</small><strong>{question.text}</strong></div>
            <div className="answer-grid">
              {question.options.map((option, index) => {
                const selected = question.selectedIndex === index;
                const correct = question.selectedIndex !== null && question.correctIndex === index;
                return (
                  <button
                    key={`${question.id}-${option}`}
                    className={`answer-button ${selected ? 'selected' : ''} ${correct ? 'correct' : ''}`}
                    onClick={() => onAnswer(index)}
                    disabled={question.selectedIndex !== null}
                    aria-label={`答案 ${index + 1}：${option}`}
                  >
                    <kbd>{index + 1}</kbd><b>{option}</b>
                    {correct && <Check size={17} />}
                    {selected && question.isCorrect === false && <X size={17} />}
                  </button>
                );
              })}
            </div>
            <div className="reward-hint"><Zap size={18} /><span>{question.rewardLabel ?? '即时喷射 + 连对能量'}<br /><b>{snapshot.inventory ? '道具将自动择机使用' : '无需驾驶操作'}</b></span></div>
          </div>
          {question.selectedIndex !== null && (
            <div className={`answer-feedback ${question.isCorrect ? 'correct' : 'wrong'}`}>
              {question.isCorrect ? `奖励生效 · ${question.rewardLabel ?? '尾焰喷射，自动寻找超车线'}` : `正确答案：${correctAnswer} · 不停车、不倒退，下一题继续`}
            </div>
          )}
        </>
      ) : (
        <div className="question-wait"><Sigma size={20} /><span>自动驾驶进行中，下一题即将到来</span></div>
      )}
    </section>
  );
}
