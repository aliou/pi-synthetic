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
import { parseQuotaHeader, type QuotasResponse } from "../../types/quotas";

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

export function isSubscriptionQuotas(
  quotas: QuotasResponse | undefined,
): boolean {
  return Boolean(
    quotas?.subscription ||
      quotas?.weeklyTokenLimit ||
      quotas?.rollingFiveHourLimit,
  );
}

export function calculateSyntheticUsageCost(
  model: Pick<Model<Api>, "cost">,
  usage: Pick<Usage, "input" | "output" | "cacheRead" | "cacheWrite">,
  subscription: boolean,
): Usage["cost"] {
  const cacheReadRate = subscription
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
  subscription: boolean,
): AssistantMessage {
  return {
    ...message,
    usage: {
      ...message.usage,
      cost: calculateSyntheticUsageCost(model, message.usage, subscription),
    },
  };
}

function adjustFinalEventCost(
  model: Model<Api>,
  event: AssistantMessageEvent,
  subscription: boolean,
): AssistantMessageEvent {
  if (event.type === "done") {
    return {
      ...event,
      message: withAdjustedUsageCost(model, event.message, subscription),
    };
  }

  if (event.type === "error") {
    return {
      ...event,
      error: withAdjustedUsageCost(model, event.error, subscription),
    };
  }

  return event;
}

async function forwardSyntheticStream(
  inner: AssistantMessageEventStream,
  outer: AssistantMessageEventStream,
  model: Model<Api>,
  isSubscription: () => boolean,
): Promise<void> {
  try {
    for await (const event of inner) {
      outer.push(adjustFinalEventCost(model, event, isSubscription()));
    }
  } finally {
    outer.end();
  }
}

export function wrapSyntheticStreamSimple(
  base: SyntheticStreamSimple,
): SyntheticStreamSimple {
  return (model, context, options = {}) => {
    let subscription = false;
    const outer = createAssistantMessageEventStream();

    const inner = base(model, context, {
      ...options,
      onResponse: async (response, responseModel) => {
        subscription = isSubscriptionQuotas(parseQuotaHeader(response.headers));
        await options.onResponse?.(response, responseModel);
      },
    });

    void forwardSyntheticStream(inner, outer, model, () => subscription);

    return outer;
  };
}
