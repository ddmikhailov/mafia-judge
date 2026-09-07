"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPasswordResetToken, resetPasswordWithToken } from "@/lib/auth/password-reset";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { publicError } from "@/lib/errors";

export type PasswordResetState = { error?: string };

const formSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/, "Ссылка недействительна или срок её действия истёк."),
  password: z.string().min(12, "Пароль должен содержать не менее 12 символов").max(200)
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Пароль должен занимать не более 72 байт UTF-8"),
  confirmation: z.string().min(1, "Повторите пароль").max(200),
}).refine((value) => value.password === value.confirmation, {
  message: "Пароли не совпадают",
  path: ["confirmation"],
});

export async function resetPasswordAction(_state: PasswordResetState, formData: FormData): Promise<PasswordResetState> {
  let key: string | undefined;
  try {
    const parsed = formSchema.parse({
      token: formData.get("token"),
      password: formData.get("password"),
      confirmation: formData.get("confirmation"),
    });
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    key = `password-reset:${ip}:${hashPasswordResetToken(parsed.token).slice(0, 16)}`;
    consumeRateLimit(key, 5, 15 * 60 * 1000);
    await resetPasswordWithToken({ token: parsed.token, password: parsed.password });
    resetRateLimit(key);
  } catch (error) {
    return { error: publicError(error, "Не удалось изменить пароль.").message };
  }
  redirect("/login?passwordReset=1");
}
