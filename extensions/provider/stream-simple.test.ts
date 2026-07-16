import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  createAssistantMessageEventStream,
  type Model,
} from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  calculateSyntheticUsageCost,
  detectBillingMode,
  type SyntheticStreamSimple,
  wrapSyntheticStreamSimple,
} from "./stream-simple";

const model: Model<Api> = {
  id: "hf:test/model",
  name: "test/model",
  api: "openai-completions",
  provider: "synthetic",
  baseUrl: "https://api.synthetic.new/openai/v1",
  reasoning: false,
  input: ["text"],
  cost: {
    input: 1,
    output: 2,
    cacheRead: 10,
    cacheWrite: 3,
  },
  contextWindow: 128_000,
  maxTokens: 4096,
};

const context: Context = {
  messages: [],
};

function makeMessage(): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "openai-completions",
    provider: "synthetic",
    model: model.id,
    usage: {
      input: 1_000,
      output: 2_000,
      cacheRead: 5_000,
      cacheWrite: 100,
      totalTokens: 8_100,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: 0,
  };
}

function expectCostToEqual(
  actual: AssistantMessage["usage"]["cost"],
  expected: AssistantMessage["usage"]["cost"],
): void {
  expect(actual.input).toBeCloseTo(expected.input);
  expect(actual.output).toBeCloseTo(expected.output);
  expect(actual.cacheRead).toBeCloseTo(expected.cacheRead);
  expect(actual.cacheWrite).toBeCloseTo(expected.cacheWrite);
  expect(actual.total).toBeCloseTo(expected.total);
}

describe("Synthetic streamSimple wrapper", () => {
  it("detects subscription quotas", () => {
    expect(
      detectBillingMode({
        subscription: { limit: 1, requests: 0, renewsAt: "later" },
      }),
    ).toBe("subscription");
    expect(detectBillingMode({})).toBe("pay-as-you-go");
    expect(detectBillingMode(undefined)).toBe("pay-as-you-go");
  });

  it("calculates raw pay-as-you-go cost", () => {
    expectCostToEqual(
      calculateSyntheticUsageCost(model, makeMessage().usage, "pay-as-you-go"),
      {
        input: 0.001,
        output: 0.004,
        cacheRead: 0.05,
        cacheWrite: 0.0003,
        total: 0.0553,
      },
    );
  });

  it("applies the subscription cache-read discount", () => {
    expectCostToEqual(
      calculateSyntheticUsageCost(model, makeMessage().usage, "subscription"),
      {
        input: 0.001,
        output: 0.004,
        cacheRead: 0.01,
        cacheWrite: 0.0003,
        total: 0.0153,
      },
    );
  });

  it("adjusts final message cost from the response quota header", async () => {
    const delegatedOnResponse = vi.fn();
    const base: SyntheticStreamSimple = (_model, _context, options) => {
      const stream = createAssistantMessageEventStream();
      void options?.onResponse?.(
        {
          status: 200,
          headers: {
            "x-synthetic-quotas": JSON.stringify({
              weeklyTokenLimit: {
                nextRegenAt: "later",
                percentRemaining: 50,
                maxCredits: "$24.00",
                remainingCredits: "$12.00",
                nextRegenCredits: "$0.48",
              },
            }),
          },
        },
        model,
      );
      stream.push({ type: "done", reason: "stop", message: makeMessage() });
      return stream;
    };

    const result = await wrapSyntheticStreamSimple(base)(model, context, {
      onResponse: delegatedOnResponse,
    }).result();

    expect(delegatedOnResponse).toHaveBeenCalledOnce();
    expectCostToEqual(result.usage.cost, {
      input: 0.001,
      output: 0.004,
      cacheRead: 0.01,
      cacheWrite: 0.0003,
      total: 0.0153,
    });
  });

  it("keeps raw cache-read cost without subscription quotas", async () => {
    const base: SyntheticStreamSimple = (_model, _context, options) => {
      const stream = createAssistantMessageEventStream();
      void options?.onResponse?.({ status: 200, headers: {} }, model);
      stream.push({ type: "done", reason: "stop", message: makeMessage() });
      return stream;
    };

    const result = await wrapSyntheticStreamSimple(base)(
      model,
      context,
    ).result();

    expectCostToEqual(result.usage.cost, {
      input: 0.001,
      output: 0.004,
      cacheRead: 0.05,
      cacheWrite: 0.0003,
      total: 0.0553,
    });
  });

  it("emits a fallback error when the base stream ends without a terminal event", async () => {
    const base: SyntheticStreamSimple = (_model, _context, options) => {
      const stream = createAssistantMessageEventStream();
      void options?.onResponse?.({ status: 200, headers: {} }, model);
      // Ends cleanly without pushing a done/error event.
      stream.end();
      return stream;
    };

    const result = await wrapSyntheticStreamSimple(base)(
      model,
      context,
    ).result();

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toMatch(/without a terminal event/);
  });

  it("emits an error event when the base stream throws", async () => {
    const base: SyntheticStreamSimple = (_model, _context, options) => {
      void options?.onResponse?.({ status: 200, headers: {} }, model);
      const iterator: AsyncIterator<never> = {
        async next() {
          throw new Error("upstream boom");
        },
      };
      return {
        [Symbol.asyncIterator]: () => iterator,
      } as unknown as AssistantMessageEventStream;
    };

    const result = await wrapSyntheticStreamSimple(base)(
      model,
      context,
    ).result();

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toBe("upstream boom");
  });
});
