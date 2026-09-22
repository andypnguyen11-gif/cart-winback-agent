import rawCarts from "@/data/carts.json";
import { CartsSchema } from "./schemas";
import type { Cart } from "./types";

/**
 * Loads the stale-cart fixture and validates it at load time.
 * Throws on malformed data rather than letting a bad record reach the pipeline.
 */
export function loadCarts(): Cart[] {
  return CartsSchema.parse(rawCarts);
}
