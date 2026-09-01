import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { createAdminAccount, resetSuperAdminPassword } from "./admin-account";

const bootstrapEnabled = process.env.BOOTSTRAP_ADMIN === "1";
const recoveryEnabled = process.env.RESET_SUPER_ADMIN === "1";

// Both paths are disabled unless explicitly enabled by the owner in Amvera.
if (bootstrapEnabled || recoveryEnabled) {
  if (bootstrapEnabled && recoveryEnabled) throw new Error("Choose bootstrap or recovery, not both");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    if (recoveryEnabled) {
      await resetSuperAdminPassword(prisma, {
        login: process.env.RECOVERY_ADMIN_LOGIN,
        password: process.env.RECOVERY_ADMIN_PASSWORD,
      });
      console.log("SUPER_ADMIN password reset. Existing sessions revoked. Remove recovery secrets now.");
    } else {
      const result = await createAdminAccount(prisma, {
        login: process.env.ADMIN_LOGIN,
        displayName: process.env.ADMIN_DISPLAY_NAME,
        password: process.env.ADMIN_PASSWORD,
      }, true);
      console.log(result.created ? "Initial SUPER_ADMIN created. Remove bootstrap secrets now." : "Bootstrap skipped: users already exist. No accounts changed.");
    }
  } catch {
    // Deliberately do not log credentials, Prisma arguments, or raw DB errors.
    console.error("Admin bootstrap/recovery failed. Check settings; no plaintext credentials were logged.");
    process.exitCode = 1;
  } finally {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.RECOVERY_ADMIN_PASSWORD;
    await prisma.$disconnect();
  }
}
