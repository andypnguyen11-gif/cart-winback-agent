// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { actionableEvaluation, carts } from "@/evals/helpers/fixtures";
import type { QueueResponse } from "@/lib/queue";
import { ReviewQueue } from "./ReviewQueue";

const pricing = { asOf: "2026-09-22", source: "https://example.test/pricing" };
let empty: QueueResponse;
let afterRun: QueueResponse;

beforeAll(async () => {
  const a = await actionableEvaluation();
  empty = { results: carts.map((cart) => ({ cart, evaluation: null })), pricing };
  afterRun = {
    results: carts.map((cart) => ({ cart, evaluation: cart.cartId === "C-1002" ? { ...a, costUsd: 0.006 } : null })),
    pricing,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReviewQueue", () => {
  it("renders the empty state with a call to action when nothing has been evaluated", () => {
    render(<ReviewQueue initialQueue={empty} />);
    expect(screen.getByText(/no recommendations yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run agent on all carts/i })).toBeInTheDocument();
  });

  it("never calls the API on mount; only an explicit click runs the agent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(afterRun), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewQueue initialQueue={empty} />);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /run agent on all carts/i }));
    await waitFor(() => expect(screen.getByText("Fee waiver")).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/evaluate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({});
  });

  it("re-runs a single cart by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(afterRun), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewQueue initialQueue={afterRun} />);

    fireEvent.click(screen.getByRole("button", { name: /re-run agent/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cartId: "C-1002" });
  });

  it("shows an error message when the API fails and keeps the existing queue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "boom" }), { status: 500 })));
    render(<ReviewQueue initialQueue={afterRun} />);
    fireEvent.click(screen.getByRole("button", { name: /run agent on all carts/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/boom/));
    expect(screen.getByText("Fee waiver")).toBeInTheDocument();
  });
});
