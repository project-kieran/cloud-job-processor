# Cloud Job Processor Architecture

The architecture as it exists and as planned are recorded here and updated regularly

## Current Architecture

![Current Architecture](current-cjp-architecture.drawio.png)

## Planned Architecture

![Planned Architecture](planned-cjp-architecture.drawio.png)

## Key Components

- **Client** - submits jobs and queries status
- **API** - exposes endpoints and validates incoming requests
- **Queue (SQS)** - decouples job submission from processing
- **Worker service** - consumes queued jobs and performs the actual processing
- **Job storage (DynamoDB)** - stores job state, metadata and results
- **S3** - optional storage for larger objects
- **CloudWatch** - logs, metrics, alarms for observability/monitoring
- **Terraform(not in diagram)** - provisions and manages the cloud infrastructure

## Retry and Failure Handling

- Each job can be attempted up to 3 times.
- The attempt count is incremented when processing begins.
- If processing fails before the maximum number of attempts is reached, the job is returned to `PENDING` and re-enqueued.
- After the third failed attempt, the job is marked `FAILED` and added to a DLQ.
- Invalid jobs and permanent HTTP failures are not retryable

## Why it evolves this way

- The in-memory repository is useful for the initial API, but it is not durable
- Introducing SQS separates job submission from job execution
a worker allows longer-running jobs to be processed asynchronously
- DynamoDB gives persistent job state
- Terraform makes the infrastructure reproducible
- Observability becomes necessary once jobs run across distributed components
- Deployment automation becomes valuable once infrastructure and environments exist

## Expected Production Behaviour

- The API accepts a job request, validates it and stores the job with an initial `PENDING` status.
- The job ID is published to the queue for asynchronous processing.
- The API returns without waiting for the job to complete.
- A worker consumes queued jobs and updates their status to `PROCESSING`.
- Successful jobs are marked `COMPLETED`.
- Retryable failures are re-enqueued until the maximum attempt count is reached.
- Permanent failures and exhausted retries are marked `FAILED` and sent to the dead-letter queue.
- Job state is persisted outside the application process so that restarts do not lose submitted jobs.
- Logs and metrics should make it possible to trace job processing and identify failed or delayed jobs.

## Failure Scenarios and Recovery

- Invalid job payloads and HTTP 4xx errors are treated as permanent failures and are marked `FAILED` without retry.
- Retryable processing failures, such as network errors, timeouts or HTTP 5xx responses, are re-enqueued while attempts remain.
- Jobs that exhaust the maximum number of attempts are marked `FAILED` and sent to the dead-letter queue.
- If the worker process stops unexpectedly, persisted job state and queued messages should allow processing to resume after restart.
- Jobs in the dead-letter queue should be inspectable and, where appropriate, manually replayed after the underlying problem is corrected.