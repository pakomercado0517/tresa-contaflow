import {
  User,
  Profile,
  Invoice,
  AccruedExpense,
  Subscription,
  PaymentEvent,
  Period,
  ManualIncome,
  PaymentComplement,
  ProfilePaymentComplement,
  PaymentComplementItem,
  Payroll,
  Plugin,
  SubscriptionPlugin,
  DiscountCode,
  SatSearchLog,
  sequelize,
} from "../../database/models/index";

/**
 * Limpia todas las tablas de la base de datos de pruebas
 * NOTA: Solo elimina datos, no recrea las tablas (para evitar conflictos con la BD de producción)
 */
export async function cleanDatabase(): Promise<void> {
  // Un único TRUNCATE ... CASCADE limpia todas las tablas en un solo round-trip.
  // Esto es mucho más rápido y confiable que ~19 DELETE/TRUNCATE secuenciales
  // sobre la conexión lenta de la BD de test (Railway tarda ~6s solo en conectar).
  const models = [
    ManualIncome,
    PaymentComplementItem,
    ProfilePaymentComplement,
    PaymentComplement,
    AccruedExpense,
    Invoice,
    Payroll,
    Period,
    SubscriptionPlugin,
    PaymentEvent,
    Subscription,
    DiscountCode,
    SatSearchLog,
    Plugin,
    Profile,
    User,
  ];

  const tableNames = models.map((model) => `"${model.tableName}"`).join(", ");

  try {
    await sequelize.query(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`);
  } catch (error) {
    console.error("Error cleaning database:", error);
    throw error;
  }
}

/**
 * Cierra la conexión a la base de datos
 */
export async function closeDatabase(): Promise<void> {
  if (sequelize) {
    await sequelize.close();
  }
}

/**
 * Sincroniza la base de datos (útil para tests)
 */
export async function syncDatabase(force: boolean = false): Promise<void> {
  if (sequelize) {
    await sequelize.sync({ force });
  }
}
