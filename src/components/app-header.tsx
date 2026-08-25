import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { logoutAction } from "@/app/login/actions";

const roleLabels = { SUPER_ADMIN: "Администратор", HEAD_JUDGE: "Главный судья", JUDGE: "Судья" } as const;

export async function AppHeader() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <header className="app-header"><Link href="/" className="app-brand">Мафия</Link><nav><Link href="/">Турниры</Link>{user.role !== "JUDGE" ? <Link href="/audit">Аудит</Link> : null}{user.role === "SUPER_ADMIN" ? <Link href="/admin/users">Судьи</Link> : null}</nav><div className="session-user"><span><b>{user.displayName}</b><small>{roleLabels[user.role]}</small></span><form action={logoutAction}><button type="submit" className="link-button">Выйти</button></form></div></header>;
}
