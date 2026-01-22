import sequelize, { sequelize as sequelizeNamed } from "../config.js";
import type { Sequelize } from "sequelize";

// Importar modelos
import User from "./User.model.js";
import Profile from "./Profile.model.js";
import Subscription from "./Subscription.model.js";
import PaymentEvent from "./PaymentEvent.model.js";
import Invoice from "./Invoice.model.js";
import Expense from "./Expense.model.js";
import DiscountCode from "./DiscountCode.model.js";
import PaymentComplement from "./PaymentComplement.model.js";
import PaymentComplementItem from "./PaymentComplementItem.model.js";
import SatProductService from "./SatProductService.model.js";
import SatSearchLog from "./SatSearchLog.model.js";

// Las relaciones ya están definidas en cada modelo

export {
  sequelize,
  User,
  Profile,
  Subscription,
  PaymentEvent,
  Invoice,
  Expense,
  DiscountCode,
  PaymentComplement,
  PaymentComplementItem,
  SatProductService,
  SatSearchLog,
};
export type { Sequelize };
