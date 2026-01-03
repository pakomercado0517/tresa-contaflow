const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const migrationName = process.argv[2];

if (!migrationName) {
  console.error("Error: Debes proporcionar un nombre para la migración");
  console.error("Uso: node scripts/generate-migration.cjs nombre-de-migracion");
  process.exit(1);
}

try {
  // Generar migración con Sequelize CLI
  console.log(`Generando migración: ${migrationName}...`);
  execSync(`sequelize-cli migration:generate --name ${migrationName}`, {
    stdio: "inherit",
  });

  // Buscar el archivo .js más reciente en migrations/
  const migrationsDir = path.join(process.cwd(), "src", "database", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => ({
      name: file,
      path: path.join(migrationsDir, file),
      time: fs.statSync(path.join(migrationsDir, file)).mtime,
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length > 0) {
    const latestFile = files[0];
    const newPath = latestFile.path.replace(".js", ".cjs");
    fs.renameSync(latestFile.path, newPath);
    console.log(`✅ Migración renombrada a: ${path.basename(newPath)}`);
  }
} catch (error) {
  console.error("Error al generar migración:", error.message);
  process.exit(1);
}

