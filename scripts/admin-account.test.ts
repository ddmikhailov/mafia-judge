import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client";
import { createAdminAccount, parseAdminCredentials, resetSuperAdminPassword } from "./admin-account";

const credentials = { login: " ADMIN ", displayName: "Admin", password: "test-only-password-12345" };

function fakeDatabase(existingUsers = 0, duplicate = false, resetTarget: { id: string; role: string; isActive: boolean } | null = { id: "admin-id", role: "SUPER_ADMIN", isActive: true }) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    user: { count: vi.fn().mockResolvedValue(existingUsers), findUnique: vi.fn().mockImplementation(({ select }) => select?.role ? resetTarget : duplicate ? { id: "existing" } : null), create: vi.fn().mockResolvedValue({ id: "new" }), update: vi.fn().mockResolvedValue({ id: resetTarget?.id }) },
    session: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    organization: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "default-organization" }) },
  };
  const prisma = { $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaClient;
  return { prisma, tx };
}

describe("initial admin bootstrap", () => {
  it("normalizes the login without trimming the password", () => {
    expect(parseAdminCredentials(credentials).login).toBe("admin");
    expect(parseAdminCredentials({ ...credentials, password: " password with spaces " }).password).toBe(" password with spaces ");
  });
  it("rejects short passwords and bcrypt truncation", () => {
    expect(() => parseAdminCredentials({ ...credentials, password: "short" })).toThrow();
    expect(() => parseAdminCredentials({ ...credentials, password: "я".repeat(37) })).toThrow();
  });
  it("creates the first admin with a password hash", async () => {
    const { prisma, tx } = fakeDatabase();
    await expect(createAdminAccount(prisma, credentials, true)).resolves.toEqual({ created: true });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.user.create).toHaveBeenCalledOnce();
    const data = tx.user.create.mock.calls[0][0].data;
    expect(data.role).toBe("SUPER_ADMIN");
    expect(data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(data).not.toHaveProperty("password");
  });
  it("never overwrites or creates users when bootstrap has already run", async () => {
    const { prisma, tx } = fakeDatabase(1, true);
    await expect(createAdminAccount(prisma, credentials, true)).resolves.toEqual({ created: false });
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it("the explicit CLI refuses duplicate logins", async () => {
    const { prisma, tx } = fakeDatabase(1, true);
    await expect(createAdminAccount(prisma, credentials)).rejects.toThrow("уже существует");
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it("resets only an active SUPER_ADMIN and revokes every live session", async () => {
    const { prisma, tx } = fakeDatabase();
    await expect(resetSuperAdminPassword(prisma, credentials)).resolves.toEqual({ reset: true, revokedSessions: 2 });
    expect(tx.user.update).toHaveBeenCalledOnce();
    expect(tx.user.update.mock.calls[0][0].data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "admin-id", revokedAt: null }, data: { revokedAt: expect.any(Date) },
    });
  });
  it("refuses reset for missing, inactive, or non-admin accounts", async () => {
    for (const target of [null, { id: "judge", role: "JUDGE", isActive: true }, { id: "admin", role: "SUPER_ADMIN", isActive: false }]) {
      const { prisma, tx } = fakeDatabase(0, false, target);
      await expect(resetSuperAdminPassword(prisma, credentials)).rejects.toThrow("SUPER_ADMIN");
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.session.updateMany).not.toHaveBeenCalled();
    }
  });
});
