"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return <form action={action} className="card login-card">
    <label className="field">Логин<input name="login" autoComplete="username" maxLength={254} required autoFocus /></label>
    <label className="field">Пароль<input name="password" type="password" autoComplete="current-password" maxLength={200} required /></label>
    {state.error ? <p className="error" role="alert">{state.error}</p> : null}
    <button className="button" disabled={pending} type="submit">{pending ? "Входим…" : "Войти"}</button>
  </form>;
}
