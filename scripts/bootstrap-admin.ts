import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { createAdminAccount } from "./admin-account";

// Disabled unless explicitly enabled by the owner in Amvera's secret settings.
if (process.env.BOOTSTRAP_ADMIN === "1") {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = await createAdminAccount(prisma, {
      login: process.env.ADMIN_LOGIN,
      displayName: process.env.ADMIN_DISPLAY_NAME,
      password: process.env.ADMIN_PASSWORD,
    }, true);
    console.log(result.created ? "Initial SUPER_ADMIN created. Remove bootstrap secrets now." : "Bootstrap skipped: users already exist. No accounts changed.");
  } catch {
    // Deliberately do not log credentials, Prisma arguments, or raw DB errors.
    console.error("Initial admin bootstrap failed. Check bootstrap settings; no account overwrite was attempted.");
    process.exitCode = 1;
  } finally {
    delete process.env.ADMIN_PASSWORD;
    await prisma.$disconnect();
  }
}
