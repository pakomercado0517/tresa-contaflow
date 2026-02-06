#!/usr/bin/env node
import { execSync } from "child_process";
import dotenv from "dotenv";

// Establecer NODE_ENV=test
process.env.NODE_ENV = "test";

// Cargar .env.test
dotenv.config({ path: ".env.test", override: true });

console.log("🔄 Ejecutando migraciones en BD de tests...");

try {
  // Ejecutar migraciones
  execSync("pnpm run db:migrate", {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test" },
  });
  console.log("✅ Migraciones completadas\n");
} catch (error) {
  console.error("❌ Error ejecutando migraciones:", error.message);
  process.exit(1);
}
