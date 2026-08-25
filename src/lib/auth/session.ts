import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/errors";
import { SESSION_COOKIE } from "./constants";

const SESSION_DAYS = 7;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing) await prisma.session.updateMany({ where: { tokenHash: tokenHash(existing), revokedAt: null }, data: { revokedAt: new Date() } });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.updateMany({ where: { tokenHash: tokenHash(token), revokedAt: null }, data: { revokedAt: new Date() } });
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findFirst({
    where: { tokenHash: tokenHash(token), revokedAt: null, expiresAt: { gt: new Date() }, user: { isActive: true } },
    select: { user: { select: { id: true, organizationId: true, login: true, displayName: true, role: true, isActive: true } } },
  });
  return session?.user ?? null;
}

export type AuthUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new DomainError("Требуется вход в систему", "AUTH_REQUIRED", 401);
  return user;
}

export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
