import type { CSSProperties } from 'react';
import { Flag, Gauge, Pause, Route, ShieldCheck, Volume2, VolumeX, Zap } from 'lucide-react';
import { Track } from './track';
import type { GameSnapshot } from './types';

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
  const player = snapshot.racers.find((racer) => racer.isPlayer)!;
  const speed = Math.round(player.speed * 7.2);
  const speedDegrees = Math.min(270, speed / 260 * 270);
  return (
    <div className="race-hud">
      <div className="hud-left">
        <div className="position-lockup">
          <span className="position-number">{player.position}</span>
          <span className="position-suffix">/ {snapshot.racers.length}<br /><b>当前名次</b></span>
        </div>
        <div className="lap-strip"><Flag size={15} /> 第 {player.lap} / {player.totalLaps} 圈</div>
      </div>
      <div className="race-clock"><span>{snapshot.sectionName}</span><strong>{formatTime(snapshot.elapsed)}</strong></div>
      <div className="journey-strip">
        <div><span>{snapshot.sectionName}</span><b>{Math.round(snapshot.sectionProgress * 100)}%</b></div>
        <i><em style={{ width: `${snapshot.sectionProgress * 100}%` }} /></i>
      </div>
      {snapshot.rivalAlert && <div className="rival-alert">{snapshot.rivalAlert}</div>}
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
            return <circle key={racer.id} cx={point.x} cy={point.y} r={racer.isPlayer ? 3.8 : 2.5} fill={racer.color} stroke={racer.isPlayer ? '#fff' : 'none'} strokeWidth="1.2" />;
          })}
        </svg>
      </div>
      <div className="auto-pilot-chip"><Route size={17} /><div><b>AUTO 已接管</b><span>{snapshot.autoStatus}</span></div></div>
      <div className="speed-cluster">
        <div className="speed-dial" style={{ '--speed-fill': `${speedDegrees}deg` } as CSSProperties}>
          <div><Gauge size={18} /><strong>{speed}</strong><span>km/h</span></div>
        </div>
        {snapshot.powerUp && (
          <div className={`powerup-chip ${snapshot.powerUp}`}>
            {snapshot.powerUp === 'shield' ? <ShieldCheck size={17} /> : <Zap size={17} />}
            {snapshot.powerUp === 'shield' ? '护盾' : snapshot.powerUp === 'overdrive' ? '超级涡轮' : '喷射'}
          </div>
        )}
      </div>
      <div className="event-banner" key={snapshot.eventLabel}>{snapshot.eventLabel}</div>
    </div>
  );
}
