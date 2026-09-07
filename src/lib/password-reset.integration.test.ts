import { randomBytes, randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma";
import { hashPassword, verifyPassword } from "./auth/password";
import { hashPasswordResetToken, isPasswordResetTokenUsable, resetPasswordWithToken } from "./auth/password-reset";
import { provisionSuperAdminResetLink } from "../../scripts/admin-account";

const optedIn = process.env.SECURITY_INTEGRATION === "1";
if (optedIn && !["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname)) {
  throw new Error("Password reset integration tests require an explicitly selected local test database");
}

describe.runIf(optedIn)("one-time password reset", () => {
  const suffix = randomUUID();
  const userIds: string[] = [];

  beforeAll(async () => {
    await prisma.organization.findUniqueOrThrow({ where: { id: "default-organization" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("creates a SUPER_ADMIN with an unusable initial password and a hashed reset token", async () => {
    const token = randomBytes(32).toString("base64url");
    const login = `provision-${suffix}`;
    const result = await provisionSuperAdminResetLink(prisma, {
      login,
      displayName: "Provisioned admin",
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { login } });
    userIds.push(user.id);
    const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });

    expect(result.created).toBe(true);
    expect(user.role).toBe("SUPER_ADMIN");
    expect(stored.tokenHash).toBe(hashPasswordResetToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    await expect(isPasswordResetTokenUsable(token)).resolves.toBe(true);
    await expect(provisionSuperAdminResetLink(prisma, {
      login,
      displayName: "Provisioned admin",
      token,
      expiresAt: new Date(Date.now() + 120_000),
    })).resolves.toMatchObject({ created: false });
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it("changes the password once and revokes every active session", async () => {
    const token = randomBytes(32).toString("base64url");
    const oldPassword = `old-password-${suffix}`;
    const newPassword = `new-password-${suffix}`;
    const user = await prisma.user.create({
      data: {
        organizationId: "default-organization",
        login: `reset-${suffix}`,
        displayName: "Reset admin",
        role: "SUPER_ADMIN",
        passwordHash: await hashPassword(oldPassword),
      },
    });
    userIds.push(user.id);
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashPasswordResetToken(token), expiresAt: new Date(Date.now() + 60_000) },
    });

    await expect(resetPasswordWithToken({ token, password: newPassword })).resolves.toEqual({ reset: true, revokedSessions: 1 });
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(verifyPassword(newPassword, updated.passwordHash)).resolves.toBe(true);
    await expect(isPasswordResetTokenUsable(token)).resolves.toBe(false);
    await expect(resetPasswordWithToken({ token, password: `${newPassword}-again` })).rejects.toMatchObject({ code: "PASSWORD_RESET_INVALID" });
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  it("rejects expired links without changing the password", async () => {
    const token = randomBytes(32).toString("base64url");
    const password = `unchanged-${suffix}`;
    const user = await prisma.user.create({
      data: {
        organizationId: "default-organization",
        login: `expired-${suffix}`,
        displayName: "Expired link admin",
        role: "SUPER_ADMIN",
        passwordHash: await hashPassword(password),
      },
    });
    userIds.push(user.id);
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashPasswordResetToken(token), expiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(resetPasswordWithToken({ token, password: `replacement-${suffix}` })).rejects.toMatchObject({ code: "PASSWORD_RESET_INVALID" });
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(verifyPassword(password, unchanged.passwordHash)).resolves.toBe(true);
  });
});
