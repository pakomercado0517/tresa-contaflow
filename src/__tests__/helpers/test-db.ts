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
  try {
    // Desactivar foreign keys temporalmente para poder eliminar en cualquier orden
    await sequelize.query("SET session_replication_role = 'replica';");
    
    // Eliminar en orden inverso de dependencias (hijos primero, padres al final)
    await ManualIncome.destroy({ where: {}, truncate: true, cascade: true });
    await PaymentComplementItem.destroy({ where: {}, truncate: true, cascade: true });
    await PaymentComplement.destroy({ where: {}, truncate: true, cascade: true });
    await AccruedExpense.destroy({ where: {}, truncate: true, cascade: true });
    await Invoice.destroy({ where: {}, truncate: true, cascade: true });
    await Payroll.destroy({ where: {}, truncate: true, cascade: true });
    await Period.destroy({ where: {}, truncate: true, cascade: true });
    await SubscriptionPlugin.destroy({ where: {}, truncate: true, cascade: true });
    await PaymentEvent.destroy({ where: {}, truncate: true, cascade: true });
    await Subscription.destroy({ where: {}, truncate: true, cascade: true });
    await DiscountCode.destroy({ where: {}, truncate: true, cascade: true });
    await SatSearchLog.destroy({ where: {}, truncate: true, cascade: true });
    await Plugin.destroy({ where: {}, truncate: true, cascade: true });
    await Profile.destroy({ where: {}, truncate: true, cascade: true });
    await User.destroy({ where: {}, truncate: true, cascade: true });
    
    // Reactivar foreign keys
    await sequelize.query("SET session_replication_role = 'origin';");
  } catch (error) {
    console.error("Error cleaning database:", error);
    // Asegurar que foreign keys se reactiven incluso si hay error
    await sequelize.query("SET session_replication_role = 'origin';");
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
