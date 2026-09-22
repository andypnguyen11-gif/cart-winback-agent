import { formatReport, summarizeRuns } from "../lib/report";
import { readRuns } from "../lib/storage";

/** `npm run eval:report`: tokens, latency, and estimated cost from data/runs.jsonl. */
async function main() {
  const runs = await readRuns();
  if (runs.length === 0) {
    console.log("No runs logged yet. Run the agent from the UI or POST /api/evaluate, then try again.");
    return;
  }
  console.log(formatReport(summarizeRuns(runs)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
