"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function signal() {
  navigator.vibrate?.([180, 80, 180]);
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  oscillator.connect(context.destination);
  oscillator.frequency.value = 880;
  oscillator.start();
  oscillator.stop(context.currentTime + 0.25);
}

declare global {
  interface Window { webkitAudioContext?: typeof AudioContext }
}

export function GameTimer({ duration, timerKey }: { duration: number; timerKey: string }) {
  const storageKey = `mafia-timer:${timerKey}`;
  const [remaining, setRemaining] = useState(duration);
  const [deadline, setDeadline] = useState<number | null>(null);
  const signaled = useRef(false);
  const warningSignaled = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;
    const parsed = JSON.parse(stored) as { deadline: number | null; remaining: number };
    const restore = window.setTimeout(() => {
      setDeadline(parsed.deadline);
      setRemaining(parsed.deadline ? Math.max(0, Math.ceil((parsed.deadline - Date.now()) / 1000)) : parsed.remaining);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ deadline, remaining }));
  }, [deadline, remaining, storageKey]);

  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (duration === 60 && next <= 10 && next > 0 && !warningSignaled.current) {
        warningSignaled.current = true;
        signal();
      }
      if (next === 0 && !signaled.current) {
        signaled.current = true;
        signal();
        setDeadline(null);
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [deadline, duration]);

  const start = useCallback(() => {
    signaled.current = false;
    warningSignaled.current = false;
    setDeadline(Date.now() + remaining * 1000);
  }, [remaining]);

  const pause = useCallback(() => {
    if (deadline) setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    setDeadline(null);
  }, [deadline]);

  const reset = useCallback(() => {
    signaled.current = false;
    warningSignaled.current = false;
    setDeadline(null);
    setRemaining(duration);
  }, [duration]);

  return (
    <div className={`timer ${remaining === 0 ? "expired" : remaining <= 10 ? "warning" : ""}`}>
      <strong aria-live="polite">{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</strong>
      <div className="timer-actions">
        <button type="button" onClick={deadline ? pause : start}>{deadline ? "Пауза" : remaining < duration ? "Продолжить" : "Старт"}</button>
        <button type="button" onClick={reset}>Сброс</button>
      </div>
    </div>
  );
}
