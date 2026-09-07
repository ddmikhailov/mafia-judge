"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ResetPasswordForm } from "./reset-password-form";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const subscribe = () => () => undefined;
const serverSnapshot = (): string | null | undefined => undefined;

function browserSnapshot(): string | null | undefined {
  const candidate = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
  return TOKEN_PATTERN.test(candidate) ? candidate : null;
}

export function ResetPasswordTokenLoader() {
  const token = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);

  if (token === undefined) return <p className="muted" role="status">Проверяем ссылку…</p>;
  if (token === null) return <><p className="error" role="alert">Ссылка недействительна или срок её действия истёк.</p><Link className="button secondary" href="/login">Вернуться ко входу</Link></>;
  return <><p className="muted">После сохранения ссылка перестанет работать.</p><ResetPasswordForm token={token} /></>;
}
