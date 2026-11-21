import { ArrowRight, Check, ChevronLeft, ChevronRight, Flag, Pause, Play, RotateCcw, Trophy, User, Users } from 'lucide-react';
import { KART_SPECS } from './config';
import type { GameSnapshot, KartId, PlayerIndex } from './types';

const ASSET_BASE = `${(import.meta.env.MIAODA_CLIENT_BASE_PATH || '').replace(/\/$/, '')}/`;

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`;
}

interface RaceOverlaysProps {
  snapshot: GameSnapshot;
  onSelect: (playerIndex: PlayerIndex, id: KartId) => void;
  onPlayerCount: (count: 1 | 2) => void;
  onStart: () => void;
  onResume: () => void;
  onResetView: () => void;
}

export default function RaceOverlays({ snapshot, onSelect, onPlayerCount, onStart, onResume, onResetView }: RaceOverlaysProps) {
  if (snapshot.phase === 'paused') {
    return (
      <div className="modal-scrim">
        <section className="pause-panel">
          <Pause size={30} /><span className="eyebrow">比赛已暂停</span><h2>在维修区喘口气</h2>
          <p>两位玩家的题目、输入和赛车进度都已保留。</p>
          <button className="primary-action" onClick={onResume}><Play size={19} />继续比赛</button>
          <button className="secondary-action" onClick={onStart}><RotateCcw size={18} />重新发车</button>
          <small>按 P 或 Esc 也可以继续</small>
        </section>
      </div>
    );
  }

  if (snapshot.phase === 'finished') {
    const primaryResult = snapshot.results.find((result) => result.playerIndex === 0) ?? snapshot.results[0];
    const winner = snapshot.results[0];
    return (
      <div className="modal-scrim results-scrim">
        <section className="results-panel">
          <div className="results-heading"><Trophy size={34} /><div><span className="eyebrow">{snapshot.playerCount === 2 ? '双人同屏 · 最终排名' : '单人挑战 · 最终成绩'}</span><h2>{snapshot.playerCount === 2 ? `P${winner.playerIndex + 1} 获胜！` : '完成挑战！'}</h2></div></div>
          <div className={`player-result-summaries players-${snapshot.playerCount}`}>
            {snapshot.players.map((player) => {
              const result = snapshot.results.find((item) => item.playerIndex === player.playerIndex)!;
              return <div className="results-summary" key={player.playerIndex}><strong>P{player.playerIndex + 1} · {result.name}</strong><span>用时 <b>{formatTime(result.time)}</b></span><span>答对 <b>{player.correctCount}</b> 题</span><span>最佳连对 <b>{player.bestStreak}</b></span><span>超车 <b>{player.overtakeCount}</b></span></div>;
            })}
          </div>
          <ol className="ranking-list">
            {snapshot.results.map((result) => (
              <li key={result.playerIndex} className="player-result">
                <span className="rank-number">{result.rank}</span><i style={{ background: result.color }} /><b>{result.name}</b><span className="you-label">P{result.playerIndex + 1}</span><time>{formatTime(result.time)}</time>
              </li>
            ))}
          </ol>
          <button className="primary-action" onClick={onStart}><RotateCcw size={19} />同配置再赛一场</button>
          <div className="start-action-note">本地最佳（P1）：{(() => {
            try {
              const best = JSON.parse(localStorage.getItem('math-kart:best') || 'null') as { time: number } | null;
              return best && best.time <= primaryResult.time ? formatTime(best.time) : formatTime(primaryResult.time);
            } catch { return formatTime(primaryResult.time); }
          })()}</div>
        </section>
      </div>
    );
  }

  if (snapshot.phase === 'countdown') {
    return <div className="countdown-overlay"><span>{snapshot.playerCount === 2 ? '两位玩家准备' : '自动驾驶已接管'}</span><strong>{Math.max(1, Math.ceil(snapshot.countdown))}</strong><small>数字输入答案 · 确认后自己的赛车立即加速</small></div>;
  }
  if (snapshot.phase !== 'menu') return null;

  const selectedIndex = Math.max(0, KART_SPECS.findIndex((spec) => spec.id === snapshot.selectedKart));
  const selectedSpec = KART_SPECS[selectedIndex];
  const cycleKart = (direction: number) => {
    for (let step = 1; step <= KART_SPECS.length; step += 1) {
      const candidate = KART_SPECS[(selectedIndex + direction * step + KART_SPECS.length * step) % KART_SPECS.length].id;
      if (snapshot.playerCount === 1 || candidate !== snapshot.selectedKarts[1]) {
        onSelect(0, candidate);
        break;
      }
    }
  };
  return (
    <div className={`start-layout players-${snapshot.playerCount}`}>
      <section className="start-panel">
        <header className="start-brand">
          <span className="start-brand-mark"><Flag size={21} /></span>
          <div><span>COASTAL GRAND PRIX</span><h1>MATH <b>KART</b></h1></div>
          <strong>1–2P</strong>
        </header>
        <div className="start-tagline"><strong>算力狂飙</strong><span>真实玩家竞速 · 没有 AI 赛车</span></div>
        <div className="race-format"><span>5 段赛道</span><i /><span>2 圈竞速</span><i /><span>数字键输入</span><i /><span>独立题目</span></div>
        <div className="player-mode" role="group" aria-label="游玩人数">
          <button className={snapshot.playerCount === 1 ? 'selected' : ''} onClick={() => onPlayerCount(1)} aria-pressed={snapshot.playerCount === 1}><User size={19} /><span><b>1 人游玩</b><small>单人答题挑战</small></span></button>
          <button className={snapshot.playerCount === 2 ? 'selected' : ''} onClick={() => onPlayerCount(2)} aria-pressed={snapshot.playerCount === 2}><Users size={19} /><span><b>2 人同屏</b><small>同时答题对决</small></span></button>
        </div>
        <div className={`garage-players players-${snapshot.playerCount}`}>
          {snapshot.selectedKarts.map((selectedKart, playerIndex) => {
            const index = KART_SPECS.findIndex((spec) => spec.id === selectedKart);
            return (
              <div className="player-garage" key={playerIndex}>
                <div className="kart-picker-label"><span><small>PLAYER {playerIndex + 1} · SELECT KART</small>P{playerIndex + 1} 选择赛车</span><b>{String(index + 1).padStart(2, '0')} / 07</b></div>
                <div className="kart-picker" aria-label={`P${playerIndex + 1} 赛车选择`}>
                  {KART_SPECS.map((spec, specIndex) => {
                    const selected = selectedKart === spec.id;
                    const usedByOther = snapshot.selectedKarts.some((id, otherIndex) => otherIndex !== playerIndex && id === spec.id);
                    return (
                      <button key={spec.id} className={selected ? 'selected' : ''} onClick={() => onSelect(playerIndex as PlayerIndex, spec.id)} disabled={usedByOther} aria-label={`P${playerIndex + 1} 选择${spec.name}`} aria-pressed={selected}>
                        <span className="kart-number">{String(specIndex + 1).padStart(2, '0')}</span>
                        <img src={`${ASSET_BASE}models/thumbnails/${spec.id}.png`} alt="" draggable={false} />
                        <span className="kart-name">{spec.name}</span>
                        {selected && <Check size={15} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <button className="primary-action start-action" onClick={onStart} aria-label="开始比赛"><span><small>{snapshot.playerCount === 2 ? 'LOCAL TWO PLAYER RACE' : 'SOLO MATH RACE'}</small>{snapshot.playerCount === 2 ? '开始双人同屏对决' : '开始单人挑战'}</span><ArrowRight size={25} /></button>
        <div className="drive-features"><span><Check size={14} />数字键盘输入</span><span><Check size={14} />答错不停车</span><span><Check size={14} />只保留真实玩家</span></div>
      </section>
      <aside className="showroom-ui" aria-label="360度赛车展台">
        <div className="showroom-copy">
          <span>{snapshot.playerCount === 2 ? '双车库 · 7 HYPER3D KARTS' : `360° 玩具车库 · ${String(selectedIndex + 1).padStart(2, '0')} / 07`}</span>
          <strong>{snapshot.playerCount === 2 ? snapshot.selectedKarts.map((id) => KART_SPECS.find((spec) => spec.id === id)?.englishName).join(' × ') : selectedSpec.englishName}</strong>
          <small>{snapshot.playerCount === 2 ? '两车同场，答题快慢完全由两位玩家决定。' : selectedSpec.description}</small>
        </div>
        <div className="showroom-actions">
          <button className="showroom-icon" onClick={() => cycleKart(-1)} aria-label="P1 上一台赛车"><ChevronLeft size={21} /></button>
          <button className="showroom-reset" onClick={onResetView} aria-label="重置赛车视角"><RotateCcw size={16} /><span>重置视角</span></button>
          <button className="showroom-icon" onClick={() => cycleKart(1)} aria-label="P1 下一台赛车"><ChevronRight size={21} /></button>
        </div>
        <div className="showroom-hint">拖动旋转查看全车 <span>{snapshot.playerCount === 2 ? 'P1 主键盘 / P2 小键盘' : '滚轮缩放'}</span></div>
      </aside>
    </div>
  );
}
