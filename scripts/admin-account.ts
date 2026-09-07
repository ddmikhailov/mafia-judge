import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";

const credentialsSchema = z.object({
  login: z.string().trim().min(1).max(254).transform((value) => value.toLocaleLowerCase("ru-RU")),
  displayName: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(200).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Пароль должен занимать не более 72 байт UTF-8"),
});

const passwordResetSchema = credentialsSchema.pick({ login: true, password: true });

const resetLinkProvisionSchema = z.object({
  login: credentialsSchema.shape.login,
  displayName: credentialsSchema.shape.displayName,
  token: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  expiresAt: z.date().refine((value) => value > new Date(), "Срок действия ссылки должен быть в будущем"),
});

function resetTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseAdminCredentials(input: unknown) {
  return credentialsSchema.parse(input);
}

export function parseAdminPasswordReset(input: unknown) {
  return passwordResetSchema.parse(input);
}

export async function createAdminAccount(prisma: PrismaClient, input: unknown, initialOnly = false) {
  const credentials = parseAdminCredentials(input);
  const passwordHash = await hash(credentials.password, 12);
  return prisma.$transaction(async (tx) => {
    // Serialize bootstrap attempts; no table names or user values are interpolated.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(735119204)`;
    if (initialOnly && await tx.user.count() > 0) return { created: false };
    if (await tx.user.findUnique({ where: { login: credentials.login }, select: { id: true } })) {
      throw new Error("Пользователь с таким логином уже существует");
    }
    await tx.organization.findUniqueOrThrow({ where: { id: "default-organization" }, select: { id: true } });
    await tx.user.create({ data: {
      organizationId: "default-organization", login: credentials.login,
      displayName: credentials.displayName, passwordHash, role: "SUPER_ADMIN",
    } });
    return { created: true };
  });
}

export async function resetSuperAdminPassword(prisma: PrismaClient, input: unknown) {
  const credentials = parseAdminPasswordReset(input);
  const passwordHash = await hash(credentials.password, 12);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(735119204)`;
    const user = await tx.user.findUnique({
      where: { login: credentials.login },
      select: { id: true, role: true, isActive: true },
    });
    if (!user || user.role !== "SUPER_ADMIN" || !user.isActive) {
      throw new Error("Активный SUPER_ADMIN с таким логином не найден");
    }
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    const sessions = await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { reset: true, revokedSessions: sessions.count };
  });
}

export async function provisionSuperAdminResetLink(prisma: PrismaClient, input: unknown) {
  const parsed = resetLinkProvisionSchema.parse(input);
  const unusablePasswordHash = await hash(randomBytes(48).toString("base64url"), 12);
  const tokenHash = resetTokenHash(parsed.token);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(735119204)`;
    let user = await tx.user.findUnique({
      where: { login: parsed.login },
      select: { id: true, role: true, isActive: true },
    });
    if (user && (user.role !== "SUPER_ADMIN" || !user.isActive)) {
      throw new Error("Логин уже занят другой или отключённой учётной записью");
    }
    let created = false;
    if (!user) {
      await tx.organization.findUniqueOrThrow({ where: { id: "default-organization" }, select: { id: true } });
      user = await tx.user.create({
        data: {
          organizationId: "default-organization",
          login: parsed.login,
          displayName: parsed.displayName,
          passwordHash: unusablePasswordHash,
          role: "SUPER_ADMIN",
        },
        select: { id: true, role: true, isActive: true },
      });
      created = true;
    }
    const now = new Date();
    const existingToken = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, usedAt: true },
    });
    if (existingToken && (existingToken.userId !== user.id || existingToken.usedAt)) {
      throw new Error("Токен уже принадлежит другой операции или был использован");
    }
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, ...(existingToken ? { id: { not: existingToken.id } } : {}) },
      data: { usedAt: now },
    });
    if (existingToken) {
      await tx.passwordResetToken.update({ where: { id: existingToken.id }, data: { expiresAt: parsed.expiresAt } });
    } else {
      await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt: parsed.expiresAt },
      });
    }
    return { created, expiresAt: parsed.expiresAt };
  });
}
