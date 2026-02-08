# Braintrust Multi-Turn Simulator

A standalone web application for testing AI agents with automated multi-turn conversation simulations. Results are logged directly to Braintrust experiments.

## Features

- **5 Preset User Personas**: Direct, Exploratory, Frustrated, Friendly, Confused
- **Custom Personas**: Create your own user personas with custom system prompts
- **Goal-Based Testing**: Define goals and success criteria for simulated users
- **Smart Termination**: LLM-based goal achievement detection
- **Real-Time Progress**: SSE streaming for live simulation updates
- **Braintrust Integration**: Results logged as experiments for analysis

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- OpenAI API key
- Braintrust API key

### Installation

```bash
# Navigate to the project
cd braintrust-sim

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Add your OpenAI API key to .env.local
# OPENAI_API_KEY=sk-...

# Start the development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to use the simulator.

### Configuration

1. **Enter your Braintrust API key** in the UI (stored in localStorage)
2. **Select a project** from your Braintrust account
3. **Configure your target agent** - provide the API endpoint of your chatbot
4. **Select personas** - choose which user types to simulate
5. **Define goals** - what should the simulated users try to achieve
6. **Run the simulation** - results will appear in your Braintrust project

## Target Agent API Format

Your agent's API endpoint should accept POST requests with this format:

```json
{
  "messages": [
    { "role": "user", "content": "Hello, I need help..." },
    { "role": "assistant", "content": "Hi! How can I help?" }
  ]
}
```

And respond with one of these formats:

```json
// OpenAI-style
{ "choices": [{ "message": { "content": "Response text" } }] }

// Simple formats
{ "message": "Response text" }
{ "content": "Response text" }
{ "response": "Response text" }
{ "text": "Response text" }
{ "output": "Response text" }
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Simulation Flow                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. Configure personas, goals, and target agent             │
│                          ↓                                   │
│   2. For each (persona × goal) combination:                  │
│      a. Generate initial user message based on persona/goal  │
│      b. Send to target agent, get response                   │
│      c. Check if goal achieved (LLM evaluation)              │
│      d. If not achieved and turns < max, generate next msg   │
│      e. Repeat until goal achieved or max turns              │
│                          ↓                                   │
│   3. Log results to Braintrust experiment                    │
│      - Conversation transcript                               │
│      - Goal achievement score                                │
│      - Efficiency score (fewer turns = better)               │
│      - Metadata (persona, goal, settings)                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
braintrust-sim/
├── app/
│   ├── api/
│   │   ├── simulate/route.ts      # SSE simulation endpoint
│   │   └── braintrust/            # Braintrust API proxies
│   ├── layout.tsx
│   └── page.tsx                   # Main configuration page
├── components/
│   ├── simulation-config.tsx      # Main form component
│   └── ui/                        # shadcn/ui components
├── hooks/
│   ├── use-braintrust.ts          # Braintrust API hook
│   └── use-simulation.ts          # Simulation state hook
├── lib/
│   ├── simulation-engine.ts       # Core simulation logic
│   ├── simulated-user.ts          # User message generation
│   ├── goal-checker.ts            # Goal achievement detection
│   ├── target-agents.ts           # Target agent implementations
│   ├── personas.ts                # Preset persona definitions
│   ├── types.ts                   # TypeScript types
│   └── schemas.ts                 # Zod validation schemas
└── README.md
```

## Deployment

Deploy to Vercel:

```bash
vercel deploy
```

Or build for production:

```bash
pnpm build
pnpm start
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for the simulator LLM |

Note: Braintrust API key is provided by the user in the UI and stored in localStorage.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **Forms**: React Hook Form + Zod
- **Streaming**: Server-Sent Events (SSE)
- **AI**: OpenAI SDK, Braintrust SDK

## License

MIT
