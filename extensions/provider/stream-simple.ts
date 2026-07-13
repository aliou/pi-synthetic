// Synthetic's response body reports cache-read token counts, but not the
// billing mode used for the request. The response quota header does expose
// subscription quota shapes, so this wrapper keeps that header observation
// request-scoped and adjusts only the finalized assistant usage cost.
import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Context,
  createAssistantMessageEventStream,
  type Model,
  type SimpleStreamOptions,
  type Usage,
} from "@earendil-works/pi-ai";
import { parseQuotaHeader, type QuotasResponse } from "../../src/types/quotas";

/** How a Synthetic request is billed. Determined from the response quota
 *  header: subscription accounts carry one of the subscription quota
 *  windows (`subscription`, `weeklyTokenLimit`, `rollingFiveHourLimit`);
 *  PAYG accounts either omit the header or only carry legacy
 *  `search`/`freeToolCalls` fields. */
export type BillingMode = "subscription" | "pay-as-you-go";

// Synthetic's public docs describe subscription credits and cache token fields,
// but do not document the cache-read discount. Back-to-back runtime validation
// against subscription quota deltas shows cached reads are billed at 20% of the
// raw cache-read price returned by /openai/v1/models.
const SUBSCRIPTION_CACHE_READ_MULTIPLIER = 0.2;

export type SyntheticStreamSimple = (
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

export function detectBillingMode(
  quotas: QuotasResponse | undefined,
): BillingMode {
  return quotas?.subscription ||
    quotas?.weeklyTokenLimit ||
    quotas?.rollingFiveHourLimit
    ? "subscription"
    : "pay-as-you-go";
}

export function calculateSyntheticUsageCost(
  model: Pick<Model<Api>, "cost">,
  usage: Pick<Usage, "input" | "output" | "cacheRead" | "cacheWrite">,
  billingMode: BillingMode,
): Usage["cost"] {
  const cacheReadRate =
    billingMode === "subscription"
      ? model.cost.cacheRead * SUBSCRIPTION_CACHE_READ_MULTIPLIER
      : model.cost.cacheRead;

  const input = (model.cost.input / 1_000_000) * usage.input;
  const output = (model.cost.output / 1_000_000) * usage.output;
  const cacheRead = (cacheReadRate / 1_000_000) * usage.cacheRead;
  const cacheWrite = (model.cost.cacheWrite / 1_000_000) * usage.cacheWrite;

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
  };
}

function withAdjustedUsageCost(
  model: Model<Api>,
  message: AssistantMessage,
  billingMode: BillingMode,
): AssistantMessage {
  return {
    ...message,
    usage: {
      ...message.usage,
      cost: calculateSyntheticUsageCost(model, message.usage, billingMode),
    },
  };
}

function adjustFinalEventCost(
  model: Model<Api>,
  event: AssistantMessageEvent,
  billingMode: BillingMode,
): AssistantMessageEvent {
  if (event.type === "done") {
    return {
      ...event,
      message: withAdjustedUsageCost(model, event.message, billingMode),
    };
  }

  if (event.type === "error") {
    return {
      ...event,
      error: withAdjustedUsageCost(model, event.error, billingMode),
    };
  }

  return event;
}

function createErrorMessage(
  model: Model<Api>,
  billingMode: BillingMode,
  err: unknown,
): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: "synthetic",
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: calculateSyntheticUsageCost(
        model,
        { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        billingMode,
      ),
    },
    stopReason: "error",
    errorMessage: err instanceof Error ? err.message : String(err),
    timestamp: Date.now(),
  };
}

async function forwardSyntheticStream(
  inner: AssistantMessageEventStream,
  outer: AssistantMessageEventStream,
  model: Model<Api>,
  getBillingMode: () => BillingMode,
): Promise<void> {
  let terminated = false;
  try {
    for await (const event of inner) {
      const adjusted = adjustFinalEventCost(model, event, getBillingMode());
      if (adjusted.type === "done" || adjusted.type === "error") {
        terminated = true;
      }
      outer.push(adjusted);
    }
  } catch (err) {
    // The streamSimple contract says errors are encoded as stream error
    // events, but if an unexpected exception escapes, emit one so consumers
    // waiting on result() get a terminal event instead of a hung stream.
    outer.push({
      type: "error",
      reason: "error",
      error: createErrorMessage(model, getBillingMode(), err),
    });
    terminated = true;
  } finally {
    // If the base stream ended without a terminal done/error event, emit a
    // fallback error so result() resolves instead of hanging forever.
    if (!terminated) {
      outer.push({
        type: "error",
        reason: "error",
        error: createErrorMessage(
          model,
          getBillingMode(),
          new Error("synthetic stream ended without a terminal event"),
        ),
      });
    }
    outer.end();
  }
}

export function wrapSyntheticStreamSimple(
  base: SyntheticStreamSimple,
): SyntheticStreamSimple {
  return (model, context, options = {}) => {
    let billingMode: BillingMode = "pay-as-you-go";
    const outer = createAssistantMessageEventStream();

    const inner = base(model, context, {
      ...options,
      onResponse: async (response, responseModel) => {
        billingMode = detectBillingMode(parseQuotaHeader(response.headers));
        await options.onResponse?.(response, responseModel);
      },
    });

    void forwardSyntheticStream(inner, outer, model, () => billingMode);

    return outer;
  };
}
