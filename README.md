# PadTask

[![Frontend](https://img.shields.io/github/actions/workflow/status/super3/padtask/deploy.yml?branch=main&label=frontend)](https://github.com/super3/padtask/actions/workflows/deploy.yml)
[![Tests](https://img.shields.io/github/actions/workflow/status/super3/padtask/tests.yml?branch=main&label=tests)](https://github.com/super3/padtask/actions/workflows/tests.yml)

AI-powered task organizer using Claude.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Add your Anthropic API key to `.env`:
```
ANTHROPIC_API_KEY=your_key_here
```

## Usage

Start the server:
```bash
npm start
```

Development mode (auto-reload):
```bash
npm run dev
```

Open http://localhost:3000

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serves the web app |
| `/health` | GET | Health check |
| `/api/chat` | POST | Send message to Claude |
| `/api/clear` | POST | Clear conversation history |

## Testing

```bash
npm test              # Run tests
npm run test:coverage # Run tests with coverage
```
