import { BrandMark } from "@/components/brand-mark";
import { ResetPasswordTokenLoader } from "./reset-password-token-loader";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return <main className="page login-page"><section className="login-shell"><div className="login-intro"><BrandMark linked={false} /><div className="login-symbols" aria-hidden="true"><span>♠</span><span>♥</span></div><p className="eyebrow">Защищённый доступ</p><h1>Верните доступ к платформе</h1><p className="lead">Задайте новый пароль для учётной записи администратора.</p><div className="login-benefits"><span>Одноразовая ссылка</span><span>Старые сессии будут закрыты</span></div></div><div className="login-panel"><p className="eyebrow">Восстановление доступа</p><h2>Новый пароль</h2><ResetPasswordTokenLoader /></div></section></main>;
}
