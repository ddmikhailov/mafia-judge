import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return <main className="page login-page"><p className="eyebrow">Судья миникапа</p><h1>Вход</h1><p className="lead">Доступ только для назначенных судей.</p><LoginForm /></main>;
}
