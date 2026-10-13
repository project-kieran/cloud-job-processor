/**
 * Application entry point.
 *
 * Starts the Express server on the configured port. The PORT environment
 * variable can be used in deployed environments, while local development
 * defaults to port 3000.
 */
import { setTimeout as delay } from "node:timers/promises";
import { app } from "./app";
import { jobWorker } from "./routes/jobRoutes";

const port = process.env.PORT || 3000;
let stopping = false;

async function runWorker(): Promise<void> {
  while (!stopping) {
    try {
      await jobWorker.processNextJob();
    } catch (error) {
      console.error("Worker error:", error);
    }
    if (!stopping) {
      await delay(250);
    }
  }
}

const server = app.listen(port, () => {
  console.log(`Cloud Job Processor API running on port ${port}`);
});

const workerLoop = runWorker();

async function shutdown(): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;

  const serverClosed = new Promise<void>((resolve, reject) => {
    server.close((error => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }));
  });

  await Promise.all([serverClosed, workerLoop]);
}

function handleShutdown(): void {
    void shutdown().catch((error) => {
      console.error("Shutdown failed:", error);
      process.exitCode = 1;
    });
  }
  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
