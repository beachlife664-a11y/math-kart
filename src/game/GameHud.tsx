import type { CSSProperties } from 'react';
import { Flag, Gauge, Pause, Route, ShieldCheck, Volume2, VolumeX, Zap } from 'lucide-react';
import { Track } from './track';
import type { GameSnapshot, PlayerIndex } from './types';

const mapTrack = new Track();
const mapPath = mapTrack.mapPoints.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ') + ' Z';

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`;
}

interface GameHudProps {
  snapshot: GameSnapshot;
  onPause: () => void;
  onMute: () => void;
}

export default function GameHud({ snapshot, onPause, onMute }: GameHudProps) {
  const primary = snapshot.racers.find((racer) => racer.playerIndex === 0)!;
  const renderSpeed = (playerIndex: PlayerIndex) => {
    const racer = snapshot.racers.find((item) => item.playerIndex === playerIndex)!;
    const player = snapshot.players[playerIndex];
    const speed = Math.round(racer.speed * 7.2);
    const speedDegrees = Math.min(270, speed / 260 * 270);
    return (
      <div className={`player-speed player-${playerIndex + 1}`} key={playerIndex}>
        {snapshot.playerCount === 2 && <b className="speed-player-label">P{playerIndex + 1}</b>}
        <div className="speed-dial" style={{ '--speed-fill': `${speedDegrees}deg` } as CSSProperties}>
          <div><Gauge size={18} /><strong>{speed}</strong><span>km/h</span></div>
        </div>
        {player.powerUp && (
          <div className={`powerup-chip ${player.powerUp}`}>
            {player.powerUp === 'shield' ? <ShieldCheck size={17} /> : <Zap size={17} />}
            {player.powerUp === 'shield' ? '护盾' : player.powerUp === 'overdrive' ? '超级涡轮' : '喷射'}
          </div>
        )}
      </div>
    );
  };
  return (
    <div className={`race-hud players-${snapshot.playerCount}`}>
      {snapshot.playerCount === 1 ? (
        <div className="hud-left">
          <div className="position-lockup">
            <span className="position-number">{primary.position}</span>
            <span className="position-suffix">/ 1<br /><b>单人挑战</b></span>
          </div>
          <div className="lap-strip"><Flag size={15} /> 第 {primary.lap} / {primary.totalLaps} 圈</div>
        </div>
      ) : (
        <div className="dual-position-lockups">
          {snapshot.racers.map((racer) => (
            <div className="dual-position" key={racer.playerIndex} style={{ '--racer-color': racer.color } as CSSProperties}>
              <b>P{racer.playerIndex + 1}</b><strong>{racer.position}</strong><span>/ 2<small>第 {racer.lap} / {racer.totalLaps} 圈</small></span>
            </div>
          ))}
        </div>
      )}
      <div className="race-clock"><span>{snapshot.playerCount === 2 ? '双人同屏 · 独立答题' : primary.name}</span><strong>{formatTime(snapshot.elapsed)}</strong></div>
      {snapshot.playerCount === 1 && (
        <div className="journey-strip">
          <div><span>{snapshot.sectionName}</span><b>{Math.round(snapshot.sectionProgress * 100)}%</b></div>
          <i><em style={{ width: `${snapshot.sectionProgress * 100}%` }} /></i>
        </div>
      )}
      <div className="hud-actions">
        <button className="icon-button" onClick={onMute} aria-label={snapshot.muted ? '开启声音' : '静音'}>
          {snapshot.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <button className="icon-button" onClick={onPause} aria-label="暂停比赛"><Pause size={20} /></button>
      </div>
      <div className="minimap" aria-label="五段赛道小地图">
        <svg viewBox="0 0 100 100" role="img">
          <path d={mapPath} fill="none" stroke="rgba(255,255,255,.24)" strokeWidth="7" strokeLinejoin="round" />
          <path d={mapPath} fill="none" stroke="#fff0cf" strokeWidth="1.5" strokeLinejoin="round" />
          {snapshot.racers.map((racer) => {
            const point = mapTrack.mapPoints[Math.min(mapTrack.mapPoints.length - 1, Math.floor(racer.trackProgress * mapTrack.mapPoints.length))];
            return <circle key={racer.playerIndex} cx={point.x} cy={point.y} r={snapshot.playerCount === 2 ? 3.8 : 4.2} fill={racer.color} stroke="#fff" strokeWidth="1.2" />;
          })}
        </svg>
      </div>
      <div className="auto-pilot-chip"><Route size={17} /><div><b>{snapshot.playerCount === 2 ? '双人 AUTO 已接管' : 'AUTO 已接管'}</b><span>{snapshot.playerCount === 2 ? '两位玩家独立答题加速 · 自动走线避障' : snapshot.autoStatus}</span></div></div>
      <div className={`speed-cluster ${snapshot.playerCount === 2 ? 'dual-speed-cluster' : ''}`}>
        {snapshot.players.map((player) => renderSpeed(player.playerIndex))}
      </div>
      {snapshot.cameraMode === 'split' && (
        <>
          <div className="split-camera-divider" aria-hidden="true" />
          <div className="split-camera-label p1">P1 独立镜头</div>
          <div className="split-camera-label p2">P2 独立镜头</div>
          <div className="split-camera-notice">距离拉开 · 双镜头各自追踪</div>
        </>
      )}
      <div className="event-banner" key={snapshot.eventLabel}>{snapshot.eventLabel}</div>
    </div>
  );
}
