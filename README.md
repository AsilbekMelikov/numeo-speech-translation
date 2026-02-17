# NUMEO Backend

Real-time speech-to-text translation service powered by OpenAI's Realtime API. Streams audio from clients via WebSocket and returns translated text in real time.

## Tech Stack

- **Runtime:** Node.js 20, TypeScript
- **Server:** Express 5, WebSocket (`ws`)
- **AI:** OpenAI Realtime API (`gpt-4o-transcribe`)
- **Infra:** Docker, Nginx reverse proxy

## Project Structure

```
src/
├── server.ts                              # Entry point (HTTP + WebSocket server)
├── config/
│   ├── envData.ts                         # Environment variables
│   └── common.ts                          # Shared utilities
└── services/
    ├── websocket.services.ts              # WebSocket client management
    ├── realtime-translation.services.ts   # OpenAI Realtime API integration
    └── openai.services.ts                 # Legacy Whisper API service
```

## Setup

### Prerequisites

- Node.js 20+
- OpenAI API key with Realtime model access

### Environment Variables

Create a `.env` file in the project root:

```env
OPENAI_KEY=your-openai-api-key
OPENAI_REALTIME_MODEL=gpt-realtime
```

### Local Development

```bash
npm install
npm run dev
```

Server starts at `http://localhost:8080` with WebSocket at `/ws`.

### Docker

```bash
docker-compose up --build
```

Starts the backend (port 8080) behind Nginx (port 8090 HTTP, port 8450 HTTPS).

## WebSocket API

**Endpoint:** `ws://localhost:8080/ws`

### Client -> Server

```json
{
  "type": "SPEECH_TRANSLATION",
  "data": {
    "metadata": { "startTime": 0, "endTime": 1000 },
    "audioBase64": "<base64-encoded-audio>"
  }
}
```

### Server -> Client

```json
{
  "type": "SPEECH_TRANSLATION",
  "data": { "text": "Translated text here" }
}
```

### Connection Flow

1. Client connects to `/ws`
2. Server opens an OpenAI Realtime session
3. Client streams base64-encoded audio chunks
4. Server forwards audio to OpenAI and streams back translated text
5. Heartbeat ping every 10s keeps the connection alive

## Scripts

| Command       | Description                        |
| ------------- | ---------------------------------- |
| `npm run dev` | Start dev server with hot-reload   |
