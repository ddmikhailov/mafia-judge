"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { gameCommandAction } from "@/app/actions";

function Fields({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <fieldset disabled={pending} className="command-fieldset">{children}{pending ? <span className="saving-state" role="status">Сохраняем…</span> : null}</fieldset>;
}

export function CommandForm({ gameId, intent, children, className }: { gameId: string; intent: string; children: React.ReactNode; className?: string }) {
  const [actionToken] = useState(() => crypto.randomUUID());
  return <form action={gameCommandAction} className={className}><input type="hidden" name="gameId" value={gameId} /><input type="hidden" name="intent" value={intent} /><input type="hidden" name="actionToken" value={actionToken} /><Fields>{children}</Fields></form>;
}
