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

### Get all jobs

```http
GET /api/jobs
```

### Get job by ID

```http
GET /api/jobs/:id
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

## Roadmap

### Phase 1: Backend foundation

- Node.js and TypeScript API
- Job creation and retrieval
- In-memory repository
- Basic validation
- Unit tests

### Phase 2: Event-driven processing

- Add AWS SQS
- Add worker service
- Add retry and failure handling
- Add dead-letter queue design

### Phase 3: Persistence

- Add DynamoDB job storage
- Store job status and results
- Add idempotency considerations

### Phase 4: Docker and Linux

- Add Dockerfile
- Add Docker Compose for local development
- Add Linux troubleshooting notes

### Phase 5: Terraform and AWS

- Provision AWS resources with Terraform
- Deploy API and worker
- Add CloudWatch logging

### Phase 6: CI/CD

- Add GitHub Actions workflow
- Run tests and build on pull requests

### Phase 7: Kubernetes

- Add local Kubernetes manifests
- Deploy API and worker using kind or minikube