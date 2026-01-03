import sequelize, { sequelize as sequelizeNamed } from "../config";
import type { Sequelize } from "sequelize";

// Importar modelos
import User from "./User.model.js";
import Profile from "./Profile.model.js";
import Subscription from "./Subscription.model.js";
import PaymentEvent from "./PaymentEvent.model.js";
import Invoice from "./Invoice.model.js";
import Expense from "./Expense.model.js";

// Las relaciones ya están definidas en cada modelo

export {
  sequelize,
  User,
  Profile,
  Subscription,
  PaymentEvent,
  Invoice,
  Expense,
};
export type { Sequelize };
