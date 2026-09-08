import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { logoutAction } from "@/app/login/actions";
import { BrandMark } from "@/components/brand-mark";

const roleLabels = { SUPER_ADMIN: "Администратор", HEAD_JUDGE: "Главный судья", JUDGE: "Судья" } as const;

export async function AppHeader() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <header className="app-header"><div className="app-header-inner"><BrandMark /><nav aria-label="Основная навигация"><Link href="/">Турниры</Link>{user.role === "SUPER_ADMIN" ? <Link href="/admin/users">Судьи</Link> : null}</nav><div className="session-user"><span><b>{user.displayName}</b><small>{roleLabels[user.role]}</small></span><form action={logoutAction}><button type="submit" className="link-button">Выйти</button></form></div></div></header>;
}
