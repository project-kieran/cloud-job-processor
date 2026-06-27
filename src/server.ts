/**
 * Application entry point.
 *
 * Starts the Express server on the configured port. The PORT environment
 * variable can be used in deployed environments, while local development
 * defaults to port 3000.
 */

import { app } from "./app";

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Cloud Job Processor API running on port ${port}`);
});