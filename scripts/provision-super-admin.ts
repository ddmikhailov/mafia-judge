import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { provisionSuperAdminResetLink } from "./admin-account";

if (process.env.PROVISION_SUPER_ADMIN === "1") {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = await provisionSuperAdminResetLink(prisma, {
      login: process.env.PROVISION_ADMIN_LOGIN,
      displayName: process.env.PROVISION_ADMIN_DISPLAY_NAME,
      token: process.env.PROVISION_ADMIN_RESET_TOKEN,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    console.log(result.created
      ? "SUPER_ADMIN created and one-time reset link activated for two hours. Remove provisioning settings now."
      : "Existing SUPER_ADMIN found and one-time reset link renewed for two hours. Remove provisioning settings now.");
  } catch {
    console.error("SUPER_ADMIN provisioning failed. Check settings; no login, token, or database details were logged.");
    process.exitCode = 1;
  } finally {
    delete process.env.PROVISION_ADMIN_RESET_TOKEN;
    await prisma.$disconnect();
  }
}
