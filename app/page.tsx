import { SimulationConfig } from "@/components/simulation-config";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground font-bold">
              B
            </div>
            <h1 className="text-xl font-semibold">Multi-Turn Simulator</h1>
          </div>
          <a
            href="https://www.braintrust.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Powered by Braintrust
          </a>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">
              Configure Simulation
            </h2>
            <p className="text-muted-foreground">
              Test your AI agent with automated multi-turn conversations. Select
              personas, define goals, and run simulations that log directly to
              Braintrust.
            </p>
          </div>

          <SimulationConfig />
        </div>
      </main>

      <footer className="border-t mt-16">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>
            Results are logged to your Braintrust project as experiments.{" "}
            <a
              href="https://www.braintrust.dev/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Learn more
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
