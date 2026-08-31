import { hash } from "bcryptjs";
import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";

const credentialsSchema = z.object({
  login: z.string().trim().min(1).max(254).transform((value) => value.toLocaleLowerCase("ru-RU")),
  displayName: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(200).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Пароль должен занимать не более 72 байт UTF-8"),
});

export function parseAdminCredentials(input: unknown) {
  return credentialsSchema.parse(input);
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
