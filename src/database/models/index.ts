import sequelize, { sequelize as sequelizeNamed } from "../config.js";
import type { Sequelize } from "sequelize";

// Importar modelos
import User from "./User.model.js";
import Profile from "./Profile.model.js";
import Subscription from "./Subscription.model.js";
import PaymentEvent from "./PaymentEvent.model.js";
import Invoice from "./Invoice.model.js";
import AccruedExpense from "./AccruedExpense.model.js";
import Period from "./Period.model.js";
import ManualIncome from "./ManualIncome.model.js";
import DiscountCode from "./DiscountCode.model.js";
import PaymentComplement from "./PaymentComplement.model.js";
import ProfilePaymentComplement from "./ProfilePaymentComplement.model.js";
import PaymentComplementItem from "./PaymentComplementItem.model.js";
import SatProductService from "./SatProductService.model.js";
import SatRegimenFiscal from "./SatRegimenFiscal.model.js";
import SatSearchLog from "./SatSearchLog.model.js";
import Payroll from "./Payroll.model.js";
import Plugin from "./Plugin.model.js";
import SubscriptionPlugin from "./SubscriptionPlugin.model.js";
import PublicReportToken from "./PublicReportToken.model.js";

// Las relaciones ya están definidas en cada modelo

export {
  sequelize,
  User,
  Profile,
  PublicReportToken,
  Subscription,
  PaymentEvent,
  Invoice,
  AccruedExpense,
  Period,
  ManualIncome,
  Payroll,
  Plugin,
  SubscriptionPlugin,
  DiscountCode,
  PaymentComplement,
  ProfilePaymentComplement,
  PaymentComplementItem,
  SatProductService,
  SatRegimenFiscal,
  SatSearchLog,
};
export type { Sequelize };
