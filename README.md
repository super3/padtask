# PadTask

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

## License

MIT
