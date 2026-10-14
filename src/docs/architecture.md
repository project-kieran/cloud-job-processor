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
- After the third failed attempt, the job is marked `FAILED`.
- Invalid jobs and permanent HTTP failures are not retryable

## Why it evolves this way

- The in-memory repository is useful for the initial API, but it is not durable
- Introducing SQS separates job submission from job execution
a worker allows longer-running jobs to be processed asynchronously
- DynamoDB gives persistent job state
- Terraform makes the infrastructure reproducible
- Observability becomes necessary once jobs run across distributed components
- Deployment automation becomes valuable once infrastructure and environments exist