import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/brand-mark";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ passwordReset?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { passwordReset } = await searchParams;
  return <main className="page login-page"><section className="login-shell"><div className="login-intro"><BrandMark linked={false} /><div className="login-symbols" aria-hidden="true"><span>♠</span><span>♥</span></div><p className="eyebrow">Российская Федерация Мафии</p><h1>Проведите миникап уверенно</h1><p className="lead">Рассадка, ход игры, баллы и итоговый протокол — в одном рабочем пространстве судьи.</p><div className="login-benefits"><span>10 игроков</span><span>5 игр</span><span>1 итог</span></div></div><div className="login-panel"><p className="eyebrow">Защищённый доступ</p><h2>Вход для судьи</h2><p className="muted">Используйте выданные организатором данные.</p>{passwordReset === "1" ? <p className="success" role="status">Пароль изменён. Теперь можно войти.</p> : null}<LoginForm /></div></section></main>;
}
