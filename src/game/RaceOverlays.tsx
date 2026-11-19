import { ArrowRight, Check, ChevronLeft, ChevronRight, Flag, Gauge, MousePointer2, Pause, Play, RotateCcw, Trophy, Zap } from 'lucide-react';
import { KART_SPECS } from './config';
import type { GameSnapshot, KartId } from './types';

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`;
}

interface RaceOverlaysProps {
  snapshot: GameSnapshot;
  onSelect: (id: KartId) => void;
  onStart: () => void;
  onResume: () => void;
  onResetView: () => void;
}

export default function RaceOverlays({ snapshot, onSelect, onStart, onResume, onResetView }: RaceOverlaysProps) {
  if (snapshot.phase === 'countdown') {
    return <div className="countdown-overlay"><span>自动驾驶已接管</span><strong>{Math.max(1, Math.ceil(snapshot.countdown))}</strong><small>只需点击答案 · 答对立即喷射</small></div>;
  }
  if (snapshot.phase === 'paused') {
    return (
      <div className="modal-scrim">
        <section className="pause-panel">
          <Pause size={30} /><span className="eyebrow">比赛已暂停</span><h2>在维修区喘口气</h2>
          <p>当前进度、自动走线和答题连对都已保留。</p>
          <button className="primary-action" onClick={onResume}><Play size={19} />继续比赛</button>
          <button className="secondary-action" onClick={onStart}><RotateCcw size={18} />重新发车</button>
          <small>按 P 或 Esc 也可以继续</small>
        </section>
      </div>
    );
  }
  if (snapshot.phase === 'finished') {
    const playerResult = snapshot.results.find((result) => result.isPlayer)!;
    return (
      <div className="modal-scrim results-scrim">
        <section className="results-panel">
          <div className="results-heading"><Trophy size={34} /><div><span className="eyebrow">海岛五段大奖赛 · 最终排名</span><h2>第 {playerResult.rank} 名完赛</h2></div></div>
          <div className="results-summary"><span>用时 <b>{formatTime(playerResult.time)}</b></span><span>答对 <b>{snapshot.correctCount}</b> 题</span><span>最佳连对 <b>{snapshot.bestStreak}</b></span><span>超车 <b>{snapshot.overtakeCount}</b></span></div>
          <ol className="ranking-list">
            {snapshot.results.map((result) => (
              <li key={result.id} className={result.isPlayer ? 'player-result' : ''}>
                <span className="rank-number">{result.rank}</span><i style={{ background: result.color }} /><b>{result.name}</b>
                {result.isPlayer && <span className="you-label">你</span>}<time>{formatTime(result.time)}</time>
              </li>
            ))}
          </ol>
          <button className="primary-action" onClick={onStart}><RotateCcw size={19} />再赛一场</button>
        </section>
      </div>
    );
  }
  if (snapshot.phase !== 'menu') return null;
  const selectedIndex = Math.max(0, KART_SPECS.findIndex((spec) => spec.id === snapshot.selectedKart));
  const selectedSpec = KART_SPECS[selectedIndex];
  const cycleKart = (direction: number) => onSelect(KART_SPECS[(selectedIndex + direction + KART_SPECS.length) % KART_SPECS.length].id);
  return (
    <div className="start-layout">
      <section className="start-panel">
        <header className="start-brand">
          <span className="start-brand-mark"><Flag size={21} /></span>
          <div><span>COASTAL GRAND PRIX</span><h1>MATH <b>KART</b></h1></div>
          <strong>GP</strong>
        </header>
        <div className="start-tagline"><strong>算力狂飙</strong><span>答得越快，冲得越猛</span></div>
        <div className="race-format"><span>5 段赛道</span><i /><span>2 圈竞速</span><i /><span>5 车同场</span></div>
        <div className="kart-picker-label"><span><small>SELECT YOUR KART</small>选择赛车</span><b>{String(selectedIndex + 1).padStart(2, '0')} / 07</b></div>
        <div className="kart-picker">
          {KART_SPECS.map((spec, index) => (
            <button key={spec.id} className={snapshot.selectedKart === spec.id ? 'selected' : ''} onClick={() => onSelect(spec.id)} aria-label={`选择${spec.name}`} aria-pressed={snapshot.selectedKart === spec.id}>
              <span className="kart-number">{String(index + 1).padStart(2, '0')}</span>
              <img src={`./models/thumbnails/${spec.id}.png`} alt="" draggable={false} />
              <span className="kart-name">{spec.name}</span>
              {snapshot.selectedKart === spec.id && <Check size={15} />}
            </button>
          ))}
        </div>
        <button className="primary-action start-action" onClick={onStart} aria-label="开始比赛"><span><small>READY TO RACE</small>开始比赛</span><ArrowRight size={25} /></button>
        <div className="drive-features"><span><Gauge size={15} />自动走线</span><span><MousePointer2 size={14} />答题喷射</span><span><Zap size={14} />连对强化</span></div>
      </section>
      <aside className="showroom-ui" aria-label="360度赛车展台">
        <div className="showroom-copy">
          <span>360° 玩具车库 · {String(selectedIndex + 1).padStart(2, '0')} / 07</span>
          <strong>{selectedSpec.englishName}</strong>
          <small>{selectedSpec.description}</small>
        </div>
        <div className="showroom-actions">
          <button className="showroom-icon" onClick={() => cycleKart(-1)} aria-label="上一台赛车"><ChevronLeft size={21} /></button>
          <button className="showroom-reset" onClick={onResetView} aria-label="重置赛车视角"><RotateCcw size={16} /><span>重置视角</span></button>
          <button className="showroom-icon" onClick={() => cycleKart(1)} aria-label="下一台赛车"><ChevronRight size={21} /></button>
        </div>
        <div className="showroom-hint">拖动旋转查看全车 <span>滚轮缩放</span></div>
      </aside>
    </div>
  );
}
