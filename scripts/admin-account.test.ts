import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client";
import { createAdminAccount, parseAdminCredentials } from "./admin-account";

const credentials = { login: " ADMIN ", displayName: "Admin", password: "test-only-password-12345" };

function fakeDatabase(existingUsers = 0, duplicate = false) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    user: { count: vi.fn().mockResolvedValue(existingUsers), findUnique: vi.fn().mockResolvedValue(duplicate ? { id: "existing" } : null), create: vi.fn().mockResolvedValue({ id: "new" }) },
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
});
