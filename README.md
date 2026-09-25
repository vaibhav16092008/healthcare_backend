# Premium Healthcare Platform - Backend

This is the secure, scalable backend for the healthcare platform, built using NestJS, TypeScript, and PostgreSQL (via Supabase).

## Project Status

**Current Phase:** Phase 1 (Project Foundation)
- Initial NestJS structure set up.
- Security middlewares (Helmet, CORS) configured.
- Global request validation set up.
- Application configured to use environment variables.
- Health-check endpoint established.

## Technology Stack

- **Runtime:** Node.js
- **Backend Framework:** NestJS
- **Language:** TypeScript
- **API Style:** REST
- **Package Manager:** npm

*(Database, File Storage, and Authentication will be integrated in subsequent phases)*

## Requirements

- Node.js (>= 20)
- npm (>= 10)

## Installation

```bash
$ npm install
```

## Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Update the `.env` file with the appropriate values.
*(Note: Never commit your `.env` file containing actual secrets)*

## Running the Application

```bash
# Development
$ npm run start

# Watch mode
$ npm run start:dev

# Production mode
$ npm run start:prod
```

## Testing

```bash
# Unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# Test coverage
$ npm run test:cov
```

## API Health Endpoint

Once the application is running, you can verify the status at:

`GET http://localhost:3000/api/v1/health`

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-09-24T10:00:00.000Z",
  "message": "Healthcare API is running smoothly."
}
```
