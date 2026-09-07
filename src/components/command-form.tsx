"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { gameCommandAction } from "@/app/actions";

function Fields({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <fieldset disabled={pending} className="command-fieldset">{children}{pending ? <span className="saving-state" role="status">Сохраняем…</span> : null}</fieldset>;
}

export function CommandForm({ gameId, intent, children, className, confirmMessage }: { gameId: string; intent: string; children: React.ReactNode; className?: string; confirmMessage?: string }) {
  const [actionToken, setActionToken] = useState(() => crypto.randomUUID());
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const submit = async (formData: FormData) => {
    await gameCommandAction(formData);
    setActionToken(crypto.randomUUID());
    setConfirmationOpen(false);
  };
  return <form action={submit} className={className} onSubmit={(event) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const confirmed = submitter instanceof HTMLButtonElement && submitter.dataset.confirmed === "true";
    if (confirmMessage && !confirmed) {
      event.preventDefault();
      setConfirmationOpen(true);
    }
  }}><input type="hidden" name="gameId" value={gameId} /><input type="hidden" name="intent" value={intent} /><input type="hidden" name="actionToken" value={actionToken} /><Fields>{children}{confirmationOpen && confirmMessage ? <div className="confirmation-warning" role="alert"><p>{confirmMessage}</p><div className="actions"><button className="button danger" type="submit" data-confirmed="true">Подтвердить завершение</button><button className="button secondary" type="button" onClick={() => setConfirmationOpen(false)}>Отмена</button></div></div> : null}</Fields></form>;
}
