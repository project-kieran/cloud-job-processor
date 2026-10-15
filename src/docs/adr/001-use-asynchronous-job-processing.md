# ADR 001: Use asynchronous queue-based job processing

## Status
Accepted

## Context
The initial application processed jobs within the API process using in-memory storage.

This approach is suitable for early development, but it couples job submission to job execution and would not scale well for longer-running or unreliable work.

The application needs to support asynchronous processing, retries and failed-job handling.

## Decision
Use a queue-based architecture where the API submits a job and publishes its ID to a queue.

A worker consumes queued jobs independently from the request that created them.

Jobs can be retried when failures are considered temporary. Permanently failed jobs, or jobs that exhaust their retry attempts, are sent to a dead-letter queue.

The current implementation uses in-memory queues, with AWS SQS planned as the production implementation.

## Consequences
### Positive
- API requests do not need to wait for job processing to complete.
- Job submission and processing are decoupled.
- Retry and dead-letter handling can be added cleanly.
- The design maps naturally to SQS and separate worker services later.

### Negative
- The application becomes more complex than direct synchronous processing.
- Job state must be tracked separately from the request.
- Queue and worker failures need to be monitored.
- In-memory queues are not durable and are only suitable for local development.