import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { createAdminAccount } from "./admin-account";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const rl = createInterface({ input: stdin, output: stdout });

async function value(envName: string, prompt: string) {
  return process.env[envName]?.trim() || (await rl.question(prompt)).trim();
}

try {
  const login = await value("ADMIN_LOGIN", "Логин SUPER_ADMIN: ");
  const displayName = await value("ADMIN_DISPLAY_NAME", "Отображаемое имя: ");
  const password = await value("ADMIN_PASSWORD", "Пароль (ввод будет виден в интерактивном режиме): ");
  await createAdminAccount(prisma, { login, displayName, password });
  console.log(`SUPER_ADMIN ${login} создан. Пароль не выводится и не сохраняется в открытом виде.`);
} catch {
  console.error("Не удалось создать SUPER_ADMIN. Проверьте доступ к БД, уникальность логина и требования к паролю; существующие аккаунты не изменены.");
  process.exitCode = 1;
} finally {
  rl.close();
  await prisma.$disconnect();
}
