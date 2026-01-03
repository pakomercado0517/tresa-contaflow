import express from "express";
import morgan from "morgan";
import cors from "cors";
import dotenv from "dotenv";
import type { Application, Request, Response, NextFunction } from "express";
import fileUpload from "express-fileupload";
import authRoutes from "./routes/auth.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";

dotenv.config();

const app: Application = express();

app.use(cors());
app.use(morgan("dev"));

// Middleware para webhooks de Stripe (debe estar ANTES de express.json())
// Stripe necesita el body raw para verificar la firma
app.use(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  (req: Request, res: Response, next: NextFunction) => {
    next();
  }
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo
  abortOnLimit: true,
}));

app.get("/", (req, res) =>
  res.send({ message: "Bienvenido a la API de Tresa ContaFlow" })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/webhooks", webhookRoutes);

export default app;
