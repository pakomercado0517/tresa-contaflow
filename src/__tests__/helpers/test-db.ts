import { User, Profile, Invoice, Expense, Subscription, PaymentEvent, sequelize } from "../../database/models/index.js";

/**
 * Limpia todas las tablas de la base de datos de pruebas
 */
export async function cleanDatabase(): Promise<void> {
  // Eliminar en orden inverso de dependencias
  await PaymentEvent.destroy({ where: {}, force: true });
  await Invoice.destroy({ where: {}, force: true });
  await Expense.destroy({ where: {}, force: true });
  await Subscription.destroy({ where: {}, force: true });
  await Profile.destroy({ where: {}, force: true });
  await User.destroy({ where: {}, force: true });
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
