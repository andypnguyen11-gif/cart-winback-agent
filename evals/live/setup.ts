import path from "node:path";

// Pick up .env.local the way `next dev` would, without adding a dotenv dependency.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  // No .env.local: rely on the shell environment.
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("\n[eval:live] ANTHROPIC_API_KEY is not set. Live evals will be skipped. Add it to .env.local to run them.\n");
}
