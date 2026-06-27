/**
 * Creates and configures the Express application.
 *
 * This file is responsible for middleware, health checks and route mounting.
 * It is kept separate from server.ts so the app can later be imported into
 * automated tests without starting a listening server.
 */

import express from "express";
import jobRoutes from "./routes/jobRoutes";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "cloud-job-processor"
  });
});

app.use("/api", jobRoutes);