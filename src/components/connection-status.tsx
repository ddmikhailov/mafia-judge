"use client";

import { useEffect, useState } from "react";

export function ConnectionStatus({ gameId, snapshot }: { gameId: string; snapshot: string }) {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    localStorage.setItem(`mafia-game:${gameId}`, snapshot);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [gameId, snapshot]);
  return <span className={`connection ${online ? "" : "offline"}`}>{online ? "Сохранено" : "Нет сети"}</span>;
}
