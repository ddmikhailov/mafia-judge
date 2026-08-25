"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { LOGIN_MAX, normalizeLogin } from "@/lib/input-limits";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { publicError } from "@/lib/errors";

export type LoginState = { error?: string };

const loginSchema = z.object({
  login: z.string().trim().min(1, "Введите логин").max(LOGIN_MAX),
  password: z.string().min(1, "Введите пароль").max(200),
});

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  try {
    const parsed = loginSchema.parse({ login: formData.get("login"), password: formData.get("password") });
    const login = normalizeLogin(parsed.login);
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const key = `login:${ip}:${login}`;
    consumeRateLimit(key, 5, 10 * 60 * 1000);
    const user = await prisma.user.findUnique({ where: { login } });
    const valid = user ? await verifyPassword(parsed.password, user.passwordHash) : false;
    if (!user || !valid || !user.isActive) return { error: "Неверный логин или пароль" };
    resetRateLimit(key);
    await createSession(user.id);
  } catch (error) {
    const safe = publicError(error, "Не удалось выполнить вход.");
    return { error: safe.status >= 500 ? safe.message : safe.message };
  }
  redirect("/");
}

export async function logoutAction() {
  const { destroySession } = await import("@/lib/auth/session");
  await destroySession();
  redirect("/login");
}
