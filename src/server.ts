import express from "express";
import morgan from "morgan";
import cors from "cors";
import dotenv from "dotenv";
import type { Application } from "express";
import authRoutes from "./routes/auth.routes.js";
import profileRoutes from "./routes/profile.routes.js";

dotenv.config();

const app: Application = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (req, res) =>
  res.send({ message: "Bienvenido a la API de Tresa ContaFlow" })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);

export default app;
