"use client";

import { useActionState } from "react";
import { resetPasswordAction, type PasswordResetState } from "./actions";

const initialState: PasswordResetState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initialState);
  return <form action={action} className="card login-card">
    <input type="hidden" name="token" value={token} />
    <label className="field">Новый пароль<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={200} required autoFocus /></label>
    <label className="field">Повторите пароль<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={200} required /></label>
    <p className="muted form-hint">Не менее 12 символов. Не используйте пароль от других сервисов.</p>
    {state.error ? <p className="error" role="alert">{state.error}</p> : null}
    <button className="button" disabled={pending} type="submit">{pending ? "Сохраняем…" : "Сохранить новый пароль"}</button>
  </form>;
}
