import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { DISPLAY_NAME_MAX, LOGIN_MAX, normalizeLogin } from "../src/lib/input-limits";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const rl = createInterface({ input: stdin, output: stdout });

async function value(envName: string, prompt: string) {
  return process.env[envName]?.trim() || (await rl.question(prompt)).trim();
}

try {
  const login = normalizeLogin(await value("ADMIN_LOGIN", "Логин SUPER_ADMIN: "));
  const displayName = await value("ADMIN_DISPLAY_NAME", "Отображаемое имя: ");
  const password = await value("ADMIN_PASSWORD", "Пароль (ввод будет виден в интерактивном режиме): ");
  if (!login || login.length > LOGIN_MAX) throw new Error("Некорректная длина логина");
  if (!displayName || displayName.length > DISPLAY_NAME_MAX) throw new Error("Некорректная длина имени");
  if (await prisma.user.findUnique({ where: { login } })) throw new Error("Пользователь с таким логином уже существует");
  const organization = await prisma.organization.findUnique({ where: { id: "default-organization" } });
  if (!organization) throw new Error("Default organization not found; apply migrations first");
  await prisma.user.create({ data: { organizationId: organization.id, login, displayName, passwordHash: await hashPassword(password), role: "SUPER_ADMIN" } });
  console.log(`SUPER_ADMIN ${login} создан. Пароль не выводится и не сохраняется в открытом виде.`);
} finally {
  rl.close();
  await prisma.$disconnect();
}
