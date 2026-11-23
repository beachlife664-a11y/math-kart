import { useEffect, useRef } from 'react';
import { GameEngine } from './GameEngine';
import type { GameSnapshot } from './types';

interface GameCanvasProps {
  onReady: (engine: GameEngine) => void;
  onSnapshot: (snapshot: GameSnapshot) => void;
}

export default function GameCanvas({ onReady, onSnapshot }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  const snapshotRef = useRef(onSnapshot);

  useEffect(() => { readyRef.current = onReady; }, [onReady]);
  useEffect(() => { snapshotRef.current = onSnapshot; }, [onSnapshot]);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new GameEngine(containerRef.current, (snapshot) => snapshotRef.current(snapshot));
    readyRef.current(engine);
    return () => engine.dispose();
  }, []);

  return <div className="game-canvas" ref={containerRef} />;
}
