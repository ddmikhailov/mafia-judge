import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/errors";
import { hashPassword } from "./password";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const invalidLink = () => new DomainError("Ссылка недействительна или срок её действия истёк.", "PASSWORD_RESET_INVALID", 400);

const resetSchema = z.object({
  token: z.string().regex(TOKEN_PATTERN),
  password: z.string().min(12, "Пароль должен содержать не менее 12 символов").max(200)
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Пароль должен занимать не более 72 байт UTF-8"),
});

export function isPasswordResetTokenFormat(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function isPasswordResetTokenUsable(token: unknown) {
  if (!isPasswordResetTokenFormat(token)) return false;
  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash: hashPasswordResetToken(token),
      usedAt: null,
      expiresAt: { gt: new Date() },
      user: { isActive: true },
    },
    select: { id: true },
  });
  return Boolean(record);
}

export async function resetPasswordWithToken(input: unknown) {
  const parsed = resetSchema.parse(input);
  const tokenHash = hashPasswordResetToken(parsed.token);
  const existing = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, expiresAt: true, usedAt: true, user: { select: { id: true, isActive: true } } },
  });
  const now = new Date();
  if (!existing || existing.usedAt || existing.expiresAt <= now || !existing.user.isActive) throw invalidLink();

  const passwordHash = await hashPassword(parsed.password);
  const claimTime = new Date();
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: existing.id, usedAt: null, expiresAt: { gt: claimTime } },
      data: { usedAt: claimTime },
    });
    if (claimed.count !== 1) throw invalidLink();
    const user = await tx.user.findUnique({ where: { id: existing.user.id }, select: { id: true, isActive: true } });
    if (!user?.isActive) throw invalidLink();
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    const sessions = await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: claimTime },
    });
    return { reset: true, revokedSessions: sessions.count };
  });
}
