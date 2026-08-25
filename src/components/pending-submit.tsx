"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmit({ children, pendingText = "Сохраняем…", className = "button", name, value }: { children: React.ReactNode; pendingText?: string; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" name={name} value={value} disabled={pending}>{pending ? pendingText : children}</button>;
}
