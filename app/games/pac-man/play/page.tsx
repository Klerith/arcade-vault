'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/app/context/UserContext';
import MobileGamepad from '@/components/MobileGamepad';

const PacManGame = dynamic(() => import('@/components/games/PacManGame'), {
  ssr: false,
});

const START_LIVES = 3;

function livesLabel(l: number) {
  return l > 0 ? '♥'.repeat(l) : '—';
}

export default function PacManPlay() {
  const { user, username } = useUser();
  const scoreRef = useRef(0);
  const scoreEl = useRef<HTMLSpanElement>(null);
  const levelEl = useRef<HTMLSpanElement>(null);
  const livesEl = useRef<HTMLSpanElement>(null);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [name, setName] = useState('INVITADO');
  const [saved, setSaved] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const [finalScore, setFinalScore] = useState(0);

  const handleScoreChange = useCallback((s: number) => {
    scoreRef.current = s;
    if (scoreEl.current)
      scoreEl.current.textContent = s.toLocaleString('es-ES');
  }, []);
  const handleLevelChange = useCallback((l: number) => {
    if (levelEl.current)
      levelEl.current.textContent = String(l).padStart(2, '0');
  }, []);
  const handleLivesChange = useCallback((l: number) => {
    if (livesEl.current) livesEl.current.textContent = livesLabel(l);
  }, []);
  const openGameOver = useCallback(
    (score: number) => {
      scoreRef.current = score;
      if (scoreEl.current)
        scoreEl.current.textContent = score.toLocaleString('es-ES');
      setFinalScore(score);
      setName(username ?? localStorage.getItem('av_player_name') ?? 'INVITADO');
      setOver(true);
    },
    [username],
  );

  function restart() {
    scoreRef.current = 0;
    if (scoreEl.current) scoreEl.current.textContent = '0';
    if (levelEl.current) levelEl.current.textContent = '01';
    if (livesEl.current) livesEl.current.textContent = livesLabel(START_LIVES);
    setPaused(false);
    setOver(false);
    setSaved(false);
    setName(username ?? 'INVITADO');
    setGameKey((k) => k + 1);
  }

  async function saveScore() {
    if (!user) return;
    setSaved(true);
    localStorage.setItem('av_player_name', name);
    const supabase = createClient();
    await supabase.from('scores').insert({
      game_id: 'pac-man',
      player_name: name,
      score: scoreRef.current,
      user_id: user.id,
    });
  }

  const keyMap = { up: 'w', down: 's', left: 'a', right: 'd' };

  return (
    <div className="av-player fade-in">
      <div className="hidden md:block">
        <div className="player-hud">
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div className="hud-stat">
              <div className="l">Jugador</div>
              <div className="v" style={{ color: 'var(--ink)' }}>
                {username ?? 'INVITADO'}
              </div>
            </div>
            <div className="hud-stat">
              <div className="l">Puntuación</div>
              <div className="v">
                <span ref={scoreEl}>0</span>
              </div>
            </div>
            <div className="hud-stat lives">
              <div className="l">Vidas</div>
              <div className="v">
                <span ref={livesEl}>{livesLabel(START_LIVES)}</span>
              </div>
            </div>
            <div className="hud-stat level">
              <div className="l">Nivel</div>
              <div className="v">
                <span ref={levelEl}>01</span>
              </div>
            </div>
          </div>
          <div className="hud-actions">
            <button className="btn yellow" onClick={() => setPaused((p) => !p)}>
              {paused ? 'REANUDAR' : 'PAUSA'}
            </button>
            <button
              className="btn magenta"
              onClick={() => openGameOver(scoreRef.current)}
            >
              FIN
            </button>
            <Link href="/games/pac-man" className="btn ghost">
              SALIR
            </Link>
          </div>
        </div>
      </div>

      <div className="crt w-full max-w-[800px] mx-auto">
        <div
          className="crt-screen crt-screen--scale-canvas"
          style={{ aspectRatio: '19/21' }}
        >
          <PacManGame
            key={gameKey}
            paused={paused}
            onScoreChange={handleScoreChange}
            onLevelChange={handleLevelChange}
            onLivesChange={handleLivesChange}
            onGameOver={openGameOver}
          />
          {paused && (
            <div
              className="crt-content"
              style={{ background: 'rgba(0,0,0,0.6)', zIndex: 5 }}
            >
              <div>
                <div className="pixel neon-yellow" style={{ fontSize: 22 }}>
                  EN PAUSA
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-dim)',
                    marginTop: 10,
                    letterSpacing: '0.16em',
                  }}
                >
                  PULSA REANUDAR PARA CONTINUAR
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>PAC-MAN · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>

      <MobileGamepad
        keyMap={keyMap}
        paused={paused}
        onPauseToggle={() => setPaused((p) => !p)}
        skin="classic"
        onSkinChange={() => {}} // TODO: cablear cuando se aplique skin-designer
        backHref="/games/pac-man"
      />

      {over && (
        <div className="modal-bd">
          <div className="modal">
            <h2>FIN DEL JUEGO</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{finalScore.toLocaleString('es-ES')}</div>
            {!user ? (
              <div className="final-label">
                <Link href="/auth">
                  INICIA SESIÓN PARA GUARDAR TU PUNTUACIÓN
                </Link>
              </div>
            ) : !saved ? (
              <div className="input-row">
                <input
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value.toUpperCase().slice(0, 10))
                  }
                  placeholder="TUS INICIALES"
                />
                <button className="btn yellow" onClick={saveScore}>
                  GUARDAR PUNTUACIÓN
                </button>
              </div>
            ) : (
              <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
            )}
            <div className="actions">
              <button className="btn" onClick={restart}>
                JUGAR DE NUEVO
              </button>
              <Link href="/games/pac-man#leaderboard" className="btn cyan">
                VER LEADERBOARD
              </Link>
              <Link href="/games" className="btn magenta">
                VOLVER AL VAULT
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
