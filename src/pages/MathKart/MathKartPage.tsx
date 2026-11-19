import { useEffect, useState } from 'react';
import GameCanvas from '@/game/GameCanvas';
import type { GameEngine } from '@/game/GameEngine';
import GameHud from '@/game/GameHud';
import MathPanel from '@/game/MathPanel';
import RaceOverlays from '@/game/RaceOverlays';
import type { GameSnapshot } from '@/game/types';
import '@/game/math-kart.css';

export default function MathKartPage() {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);

  useEffect(() => {
    if (snapshot?.phase !== 'finished') return;
    const player = snapshot.results.find((result) => result.isPlayer);
    if (!player) return;
    try {
      const previous = JSON.parse(localStorage.getItem('math-kart:best') || 'null') as { time: number } | null;
      if (!previous || player.time < previous.time) localStorage.setItem('math-kart:best', JSON.stringify({ time: player.time, rank: player.rank }));
    } catch { /* 本地记录不可用时仍可正常完赛 */ }
  }, [snapshot]);

  return (
    <main className="math-kart-app">
      <GameCanvas onReady={setEngine} onSnapshot={setSnapshot} />
      {!snapshot ? (
        <div className="loading-screen"><span className="loading-wheel" /><strong>正在搭建海岸赛道</strong></div>
      ) : (
        <>
          {(snapshot.phase === 'racing' || snapshot.phase === 'countdown') && (
            <GameHud snapshot={snapshot} onPause={() => engine?.togglePause()} onMute={() => engine?.toggleMute()} />
          )}
          {snapshot.phase === 'racing' && <MathPanel snapshot={snapshot} onAnswer={(index) => engine?.answer(index)} />}
          <RaceOverlays
            snapshot={snapshot}
            onSelect={(id) => engine?.selectKart(id)}
            onStart={() => { void engine?.start(); }}
            onResume={() => engine?.togglePause()}
            onResetView={() => engine?.resetShowroom()}
          />
        </>
      )}
    </main>
  );
}
