import { requirePageUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/authorization";
import { listUsers } from "@/lib/platform-service";
import { createUserAction, resetPasswordAction, setUserActiveAction } from "@/app/platform-actions";
import { PendingSubmit } from "@/components/pending-submit";

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requirePageUser(); requireRole(actor, "SUPER_ADMIN");
  const users = await listUsers(actor); const { error } = await searchParams;
  return <main className="page"><p className="eyebrow">Администрирование</p><h1>Судьи</h1>{error ? <p className="error card">{error}</p> : null}<section className="card"><h2>Создать пользователя</h2><form action={createUserAction} className="stack-form"><input name="login" maxLength={254} placeholder="Логин или email" required /><input name="displayName" maxLength={100} placeholder="Отображаемое имя" required /><select name="role"><option value="JUDGE">Судья</option><option value="HEAD_JUDGE">Главный судья</option></select><input name="password" type="password" minLength={12} maxLength={200} autoComplete="new-password" placeholder="Временный пароль, минимум 12 символов" required /><PendingSubmit>Создать</PendingSubmit></form></section><section className="user-list">{users.map((user) => <article className="card" key={user.id}><div><b>{user.displayName}</b><small>{user.login} · {user.role} · {user.isActive ? "Активен" : "Отключён"}</small></div>{user.id !== actor.id ? <form action={setUserActiveAction}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="isActive" value={user.isActive ? "false" : "true"} /><PendingSubmit className="button secondary">{user.isActive ? "Деактивировать" : "Активировать"}</PendingSubmit></form> : null}<details><summary>Сбросить пароль</summary><form action={resetPasswordAction} className="inline-form"><input type="hidden" name="userId" value={user.id} /><input name="password" type="password" minLength={12} maxLength={200} autoComplete="new-password" placeholder="Новый пароль" required /><PendingSubmit>Сохранить</PendingSubmit></form></details></article>)}</section></main>;
}
