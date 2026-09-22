import { ReviewQueue } from "@/components/ReviewQueue";
import { loadCarts } from "@/lib/carts";
import { buildQueue } from "@/lib/queue";

/** Reads stored evaluations on every request. Never runs the agent. */
export const dynamic = "force-dynamic";

export default async function Home() {
  const queue = await buildQueue(loadCarts());
  return <ReviewQueue initialQueue={queue} />;
}
