# Puzzle Lab Server

Express.js server with support for both local and AWS Lambda deployments.

## Setup

```bash
npm install
```

## Development

Run the server locally:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

## Production

### Local Deployment

```bash
npm run build
npm start
```

### AWS Lambda Deployment

The Lambda handler is exported from `dist/lambda.js`. Deploy this alongside your Lambda configuration:

```bash
npm run build
npm run lambda
```

## Project Structure

- `src/app.ts` - Main Express application configuration
- `src/local.ts` - Local server entry point
- `src/lambda.ts` - AWS Lambda handler entry point
