import { CornerDownLeft, Delete, Keyboard, RotateCcw, Zap } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { IPlayerSnapshot, PlayerIndex, GameSnapshot } from './types';

interface MathPanelProps {
  snapshot: GameSnapshot;
  onDigit: (playerIndex: PlayerIndex, digit: number) => void;
  onBackspace: (playerIndex: PlayerIndex) => void;
  onClear: (playerIndex: PlayerIndex) => void;
  onSubmit: (playerIndex: PlayerIndex) => void;
}

interface PlayerMathPanelProps extends Omit<MathPanelProps, 'snapshot'> {
  player: IPlayerSnapshot;
  snapshot: GameSnapshot;
}

function PlayerMathPanel({ player, snapshot, onDigit, onBackspace, onClear, onSubmit }: PlayerMathPanelProps) {
  const question = player.question;
  const racer = snapshot.racers.find((item) => item.playerIndex === player.playerIndex)!;
  const locked = snapshot.phase !== 'racing' || !question || question.submittedAnswer !== null || racer.finished;
  const label = `P${player.playerIndex + 1}`;
  return (
    <section
      className={`math-panel player-math-panel ${player.questionFeedback ?? ''} ${question?.challenge ? 'challenge' : ''}`}
      aria-label={`${label} 数学加速面板`}
      data-player-index={player.playerIndex}
      style={{ '--player-color': racer.color } as CSSProperties}
    >
      <div className="math-meta">
        <span className="player-panel-title"><b>{label}</b><span>{racer.name}</span><small>第 {racer.position} 名 · {Math.round(racer.speed * 7.2)} km/h</small></span>
        <span className="energy-meter" aria-label={`${label} 连对能量 ${player.energy}%`}><i><em style={{ width: `${player.energy}%` }} /></i><b>能量 {player.energy}</b></span>
        <span className="math-score">答对 {player.correctCount} · 连对 {player.streak}</span>
      </div>
      <div className="question-row">
        <div className="question-entry">
          <div className="question-text">
            <small>{question?.challenge ? '奖励题 · 答对抄近道！' : '答对就加速！'}</small>
            <strong className={question && question.text.length > 11 ? 'long-formula' : ''}>{question?.text ?? '准备下一题'}</strong>
          </div>
          <div className={`numeric-answer ${player.answerInput ? 'has-value' : ''}`} aria-live="polite" aria-label={`${label} 当前输入 ${player.answerInput || '空'}`}>
            <span>你的答案</span><strong>{player.answerInput || '—'}</strong>
          </div>
          <button
            type="button"
            className="submit-answer"
            onClick={() => onSubmit(player.playerIndex)}
            disabled={locked || player.answerInput === ''}
            aria-label={`${label} 确认答案`}
          >
            <CornerDownLeft size={22} /><span>确认，冲！</span>
          </button>
          <div className="keyboard-hint"><Keyboard size={16} />{player.playerIndex === 0 ? '主键盘数字 · Enter 确认 · 退格修改' : '右侧小键盘 · 小键盘 Enter 确认 · Delete 修改'}</div>
        </div>
        <div className="numeric-keypad" aria-label={`${label} 屏幕数字键盘`}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button
              type="button"
              key={digit}
              className="keypad-key"
              onClick={() => onDigit(player.playerIndex, digit)}
              disabled={locked}
              data-digit={digit}
              aria-label={`${label} 数字 ${digit}`}
            >{digit}</button>
          ))}
          <button type="button" className="keypad-key utility" onClick={() => onClear(player.playerIndex)} disabled={locked} aria-label={`${label} 清空输入`}><RotateCcw size={23} /><small>清空</small></button>
          <button type="button" className="keypad-key zero" onClick={() => onDigit(player.playerIndex, 0)} disabled={locked} data-digit={0} aria-label={`${label} 数字 0`}>0</button>
          <button type="button" className="keypad-key utility" onClick={() => onBackspace(player.playerIndex)} disabled={locked} aria-label={`${label} 退格`}><Delete size={25} /><small>退格</small></button>
        </div>
      </div>
      <div className="panel-bottom-line">
        <div className="reward-hint"><Zap size={18} /><span>{question?.rewardLabel ?? '答对即时喷射 + 连对能量'}<br /><b>{player.inventory ? '道具将自动择机使用' : '赛车自动走线，无需方向键'}</b></span></div>
        {question?.submittedAnswer !== null && question ? (
          <div className={`answer-feedback ${question.isCorrect ? 'correct' : 'wrong'}`}>
            {question.isCorrect ? '太棒了！加速出发' : `答案是 ${question.answer}，继续加油！`}
          </div>
        ) : (
          <div className="answer-feedback neutral"><Keyboard size={14} />{racer.finished ? '已冲线，等待另一位玩家' : snapshot.phase === 'paused' ? '比赛已暂停' : snapshot.phase === 'countdown' ? '倒计时结束后开始答题' : player.playerIndex === 0 ? '主键盘输入 · Enter 确认' : '右侧小键盘输入 · Enter 确认'}</div>
        )}
      </div>
    </section>
  );
}

export default function MathPanel({ snapshot, onDigit, onBackspace, onClear, onSubmit }: MathPanelProps) {
  return (
    <div className={`math-panels players-${snapshot.playerCount}`}>
      {snapshot.players.map((player) => (
        <PlayerMathPanel
          key={player.playerIndex}
          player={player}
          snapshot={snapshot}
          onDigit={onDigit}
          onBackspace={onBackspace}
          onClear={onClear}
          onSubmit={onSubmit}
        />
      ))}
    </div>
  );
}
