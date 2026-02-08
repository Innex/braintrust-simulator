# Braintrust Multi-Turn Simulator

A standalone web application for testing AI agents with automated multi-turn conversation simulations. Works with any conversational agent — results are logged directly to Braintrust experiments.

## Features

- **Two target modes**: API endpoint or remote eval server
- **5 preset user personas**: Direct, Exploratory, Frustrated, Friendly, Confused
- **Custom personas**: Create your own user personas with custom system prompts
- **Dataset-sourced profiles**: Extract persona/goal pairs from production conversation datasets
- **Goal-based testing**: Define goals and success criteria for simulated users
- **Smart termination**: LLM-based goal achievement detection
- **Dynamic scorer discovery**: Automatically detects scorers defined in your eval file
- **Real-time progress**: SSE streaming for live simulation updates
- **Braintrust integration**: Results logged as experiments for comparison

## Getting started

### Prerequisites

- Node.js 18+
- pnpm
- OpenAI API key (for the simulator LLM)
- Braintrust API key

### Installation

```bash
cd braintrust-sim
pnpm install
cp .env.example .env.local
# Add your OpenAI API key to .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to use the simulator.

## Target modes

braintrust-sim supports two ways to connect to your agent.

### API mode

Send messages directly to your agent's HTTP endpoint. Your agent should accept POST requests:

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
{ "choices": [{ "message": { "content": "Response text" } }] }
{ "message": "Response text" }
{ "content": "Response text" }
{ "response": "Response text" }
{ "text": "Response text" }
{ "output": "Response text" }
```

In API mode, braintrust-sim runs the simulation loop itself: generating user messages, calling your agent, checking goal achievement, and logging results to Braintrust.

### Remote eval mode

Connect to a Braintrust eval dev server. This is the recommended mode for agents that already have an eval file.

#### 1. Write an eval file

Create an eval file that defines your agent's task and scorers. The simulator sends `input` (persona + goal) and `parameters` (settings) to your eval:

```typescript
// evals/my-agent.eval.ts
import { Eval } from "braintrust";
import { myAgent } from "../lib/my-agent";

Eval("my-project", {
  data: () => [],  // data is injected by the simulator at runtime
  task: async (input, hooks) => {
    const persona = input.persona;
    const goal = input.goal;
    const params = hooks.metadata?.parameters ?? {};

    // Run your simulation loop
    const conversation = await runConversation(myAgent, persona, goal, params);
    return { conversation };
  },
  scores: [
    // Your custom scorers — these are auto-detected by the simulator UI
    myGoalChecker,
    myQualityScorer,
  ],
});
```

#### 2. Start the dev server

```bash
npx braintrust eval --dev evals/my-agent.eval.ts
```

This starts a dev server (default port 8300) that exposes `/list` and `/eval` endpoints.

#### 3. Configure in braintrust-sim

1. Select **Remote eval** as the target type
2. Enter the dev server URL (e.g., `http://localhost:8300`)
3. Click **Discover** to detect available evaluators and their scorers
4. Select your evaluator from the dropdown
5. Organization name is auto-detected from your Braintrust account

#### How remote eval works

```
braintrust-sim                    eval dev server
     │                                  │
     │  POST /eval                      │
     │  { name, data, parameters,       │
     │    experiment_name, stream }      │
     │ ──────────────────────────────>   │
     │                                  │  runs task() for each data row
     │  SSE: event: progress            │  with persona/goal from input
     │  SSE: event: result              │
     │  SSE: event: done                │
     │ <──────────────────────────────   │
     │                                  │
```

All data rows are sent in a single `/eval` request so they land in one experiment.

## Simulation profiles

### Manual mode (matrix)

Add personas and goals separately. The simulator runs every combination:

- 3 personas x 2 goals = 6 simulation runs

### Dataset mode (paired)

Extract persona/goal pairs from a Braintrust dataset containing production conversations. Each conversation produces one paired simulation run.

#### Supported dataset formats

The extraction supports many common conversation formats:

| Format | Example |
|--------|---------|
| Messages array | `input: [{ role: "user", content: "..." }, ...]` |
| Nested messages | `input: { messages: [...] }` |
| Conversation key | `input: { conversation: [...] }` |
| Chat/turns/history keys | `input: { chat: [...] }`, `input: { turns: [...] }` |
| Text field instead of content | `{ role: "user", text: "..." }` |
| Input/output string pairs | `input: "question"`, `output: "answer"` |

#### Extraction workflow

1. Switch to the **From dataset** tab in the profiles section
2. Select a dataset from the dropdown
3. Click **Extract profiles** — an LLM analyzes each conversation to extract:
   - Persona (personality type, communication style)
   - Goal (what the user was trying to accomplish, success criteria)
4. Review and edit the extracted profiles
5. Run the simulation — each profile produces one simulation run

## Scorers

### API mode

Select from built-in scorers (Factuality, Helpfulness, Relevance, Coherence) or online scorers configured in your Braintrust project.

### Remote eval mode

Scorers are defined in your eval file's `scores` array. The simulator auto-discovers them when you click **Discover** and displays them as badges in the UI.

## Prompt iteration workflow

The recommended workflow for iterating on your agent's prompt:

```
Edit prompt (Braintrust Playground or code)
        ↓
Run braintrust-sim (N simulations)
        ↓
Compare experiments in Braintrust UI
        ↓
Iterate on prompt
```

If your eval file uses `loadPrompt()` from the Braintrust SDK, changes in the Braintrust Playground are automatically picked up on the next simulation run. If your prompt is hardcoded in code, restart the dev server after editing.

## How it works

```
┌──────────────────────────────────────────────────────────┐
│                    Simulation flow                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   1. Configure personas, goals, and target agent         │
│                        ↓                                 │
│   2. For each (persona, goal) pair:                      │
│      a. Generate initial user message from persona/goal  │
│      b. Send to target agent, get response               │
│      c. Check if goal achieved (LLM evaluation)          │
│      d. If not achieved and turns < max, continue        │
│      e. Repeat until goal achieved or max turns          │
│                        ↓                                 │
│   3. Log results to Braintrust experiment                │
│      - Conversation transcript                           │
│      - Goal achievement + custom scorer results          │
│      - Efficiency score (fewer turns = better)           │
│      - Metadata (persona, goal, settings)                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Project structure

```
braintrust-sim/
├── app/
│   ├── api/
│   │   ├── simulate/route.ts         # SSE simulation endpoint
│   │   ├── extract-profiles/route.ts  # LLM profile extraction
│   │   └── braintrust/               # Braintrust API proxies
│   │       ├── projects/route.ts
│   │       ├── datasets/route.ts
│   │       ├── dataset-rows/route.ts
│   │       ├── eval-names/route.ts
│   │       ├── org/route.ts
│   │       └── scorers/route.ts
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── simulation-config.tsx          # Main configuration form
│   ├── extracted-profile-card.tsx     # Dataset profile card
│   └── ui/                           # shadcn/ui components
├── hooks/
│   ├── use-braintrust.ts             # Braintrust API hook
│   ├── use-dataset-profiles.ts       # Dataset extraction hook
│   └── use-simulation.ts             # Simulation state hook
├── lib/
│   ├── simulation-engine.ts          # Core simulation logic (API mode)
│   ├── remote-eval-runner.ts         # Remote eval client
│   ├── simulated-user.ts             # User message generation
│   ├── goal-checker.ts               # Goal achievement detection
│   ├── target-agents.ts              # Target agent adapters
│   ├── scorers.ts                    # Built-in scorer implementations
│   ├── personas.ts                   # Preset persona definitions
│   ├── types.ts                      # TypeScript types
│   └── schemas.ts                    # Zod validation schemas
└── README.md
```

## Deployment

### Vercel (recommended)

```bash
vercel --prod
```

Or connect your GitHub repo in the Vercel dashboard for automatic deployments.

### Self-hosted

```bash
pnpm build
pnpm start
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for the simulator LLM (user generation, goal checking, profile extraction) |
| `BRAINTRUST_API_URL` | No | Braintrust API base URL (default: `https://api.braintrust.dev/v1`) |
| `BRAINTRUST_APP_URL` | No | Braintrust web app URL (default: `https://www.braintrust.dev`) |

The Braintrust API key is provided by each user in the UI and stored in localStorage. It is never stored server-side.

## Tech stack

- **Framework**: Next.js 15 (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **Forms**: React Hook Form + Zod
- **Streaming**: Server-Sent Events (SSE)
- **AI**: OpenAI SDK, Braintrust SDK

## License

MIT
