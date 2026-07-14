# Cloud Job Processor

A cloud-native job processing platform built to demonstrate backend API development, asynchronous processing patterns, AWS architecture, infrastructure as code, containerisation and deployment practices.

The initial version provides a Node.js and TypeScript REST API for submitting and querying jobs. Later phases will add SQS-based asynchronous processing, persistent storage, Docker, Terraform, AWS deployment, CI/CD and optional Kubernetes manifests.

## Why this project exists

This project is designed to demonstrate practical backend and cloud engineering skills:

- Node.js and TypeScript API development
- REST API design
- Clean service/repository/controller structure
- Asynchronous job processing architecture
- AWS SQS and DynamoDB integration
- Docker and Linux-based runtime troubleshooting
- Terraform infrastructure
- CI/CD deployment workflow
- Optional Kubernetes deployment

## Planned architecture

```text
Client / Dashboard
  ↓
REST API
  ↓
Job Queue
  ↓
Worker Service
  ↓
Job Store
  ↓
Logs / Metrics / Monitoring
```

## Current functionality

- Health check endpoint
- Submit a job
- Retrieve a job by ID
- List submitted jobs
- In-memory job repository

## API endpoints

### Health check

```http
GET /health
```

Example response:

```json
{
  "status": "ok",
  "service": "cloud-job-processor"
}
```

### Create job

```http
POST /api/jobs
```

Example body:

```json
{
  "type": "CRAWL_URL",
  "payload": {
    "url": "https://example.com"
  }
}
```

Example response:

```json
{
  "id": "generated-job-id",
  "type": "CRAWL_URL",
  "payload": {
    "url": "https://example.com"
  },
  "status": "PENDING",
  "createdAt": "2026-01-01T12:00:00.000Z",
  "updatedAt": "2026-01-01T12:00:00.000Z"
}
```

### Get all jobs

```http
GET /api/jobs
```

Example response:

```json
[
  {
    "id": "generated-job-id",
    "type": "CRAWL_URL",
    "payload": {
      "url": "https://example.com"
    },
    "status": "PENDING",
    "createdAt": "2026-01-01T12:00:00.000Z",
    "updatedAt": "2026-01-01T12:00:00.000Z"
  }
]
```

### Get job by ID

```http
GET /api/jobs/:id
```

Example response:

```json
{
  "id": "generated-job-id",
  "type": "CRAWL_URL",
  "payload": {
    "url": "https://example.com"
  },
  "status": "PENDING",
  "createdAt": "2026-01-01T12:00:00.000Z",
  "updatedAt": "2026-01-01T12:00:00.000Z"
}
```

### Error responses

Example `404`

```json
{
  "error": "Job not found"
}
```

Example `400`

```json
{
  "error": "Invalid request"
}
```

## Running locally

```bash
npm install
npm run dev
```

The API will run on:

```text
http://localhost:3000
```

To execute unit tests, run:

```text
npm test
```

To check that the project builds:

```text
npm run build
```

NOTE - A correctly built `dist` directory will not contain unit tests

### Phase 1: Backend API foundation

- [x] Create a Node.js and TypeScript API
- [x] Add Express application structure
- [x] Add health check endpoint
- [x] Add job creation and retrieval endpoints
- [x] Add in-memory job repository
- [x] Add basic request validation
- [x] Add API tests for health check and job endpoints
- [x] Add consistent error responses
- [x] Add example API requests and responses to the README

### Phase 2: Local quality and developer workflow

- [x] Add automated test script
- [x] Add TypeScript build check
- [x] Add linting and formatting
- [x] Add a local `.env.example` file if configuration is introduced
- [ ] Document local development commands
- [ ] Document the difference between development, test and production build commands

### Phase 3: Docker and Linux runtime

- [ ] Add Dockerfile for the API
- [ ] Add `.dockerignore`
- [ ] Run the API locally in a container
- [ ] Add Docker Compose for local development if useful
- [ ] Document useful Docker commands
- [ ] Add Linux/container troubleshooting notes
- [ ] Confirm logs are written to stdout/stderr for container-friendly operation

### Phase 4: CI/CD foundation

- [ ] Add GitHub Actions workflow
- [ ] Run tests on pull requests
- [ ] Run TypeScript build on pull requests
- [ ] Add workflow status badge to README
- [ ] Document the CI/CD pipeline
- [ ] Add branch/PR workflow notes

### Phase 5: Application architecture documentation

- [ ] Add `docs/architecture.md`
- [ ] Add `docs/trade-offs.md`
- [ ] Add `docs/runbook.md`
- [ ] Add architecture diagram
- [ ] Add Architecture Decision Records under `docs/adr/`
- [ ] Document expected production behaviour
- [ ] Document failure scenarios and recovery approach

### Phase 6: Event-driven processing design

- [ ] Add queue abstraction in the application code
- [ ] Add worker service structure
- [ ] Move from synchronous job handling toward asynchronous processing
- [ ] Add retry and failure-handling design
- [ ] Add dead-letter queue design
- [ ] Document why a queue is used for job processing

### Phase 7: AWS services integration

- [ ] Add AWS SQS for job messages
- [ ] Add DynamoDB for job status and results
- [ ] Add S3 for optional job outputs or artifacts
- [ ] Add IAM permission considerations
- [ ] Add idempotency considerations
- [ ] Add local development strategy for AWS-dependent code
- [ ] Document the AWS service choices and trade-offs

### Phase 8: Terraform infrastructure

- [ ] Provision AWS resources with Terraform
- [ ] Add Terraform for SQS
- [ ] Add Terraform for DynamoDB
- [ ] Add Terraform for IAM permissions
- [ ] Add Terraform for CloudWatch log groups and alarms
- [ ] Add variables and outputs
- [ ] Document Terraform commands and state considerations
- [ ] Document how the infrastructure would differ between dev and production

### Phase 9: Observability and operations

- [ ] Add structured application logging
- [ ] Add request/job correlation IDs
- [ ] Add CloudWatch logging design
- [ ] Add CloudWatch alarm examples
- [ ] Monitor failed jobs and dead-letter queue depth
- [ ] Document useful operational queries
- [ ] Add runbook steps for common failure scenarios
- [ ] Document cost and reliability considerations

### Phase 10: Deployment

- [ ] Choose an AWS deployment target for the API
- [ ] Deploy the API and worker
- [ ] Connect deployed services to SQS and DynamoDB
- [ ] Document deployment steps
- [ ] Document rollback considerations
- [ ] Add environment-specific configuration notes

### Phase 11: Optional platform engineering extensions

- [ ] Add reusable infrastructure modules
- [ ] Add OpenTelemetry or vendor-neutral observability notes
- [ ] Add local Kubernetes manifests only if useful
- [ ] Add kind or minikube deployment only as a later learning exercise
- [ ] Compare ECS, Lambda and Kubernetes as deployment options
