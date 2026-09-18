import type { Api, Context, Model } from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  SYNTHETIC_ANTHROPIC_BASE_URL,
  SYNTHETIC_PROVIDER_ID,
  SYNTHETIC_REQUEST_HEADERS,
} from "../constants";
import type { SyntheticModel } from "../models";
import { createAnthropicMessagesApi } from "./anthropic-messages";
import type { AnyStreamSimple } from "./types";

const baseModel: SyntheticModel = {
  id: "syn:static",
  name: "syn:static",
  reasoning: false,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 16384,
};

const reasoningModel: SyntheticModel = {
  ...baseModel,
  id: "hf:some/reasoning",
  reasoning: true,
  // Static catalog override; the anthropic surface intentionally replaces it.
  thinkingLevelMap: {
    off: "none",
    minimal: null,
    low: null,
    medium: "medium",
    high: null,
    xhigh: null,
  },
  compat: { supportsReasoningEffort: true },
};

describe("stamping", () => {
  const stamped = createAnthropicMessagesApi().stampModels([
    baseModel,
    reasoningModel,
  ]);

  it("stamps api, messages baseUrl, and headers", () => {
    for (const model of stamped) {
      expect(model.api).toBe("anthropic-messages");
      expect(model.provider).toBe(SYNTHETIC_PROVIDER_ID);
      // The Anthropic SDK appends /v1/messages itself.
      expect(model.baseUrl).toBe(SYNTHETIC_ANTHROPIC_BASE_URL);
      expect(model.baseUrl).not.toMatch(/\/v1$/);
      expect(model.headers).toEqual(SYNTHETIC_REQUEST_HEADERS);
    }
  });

  it("keeps stock anthropic reasoning semantics without adaptive forcing", () => {
    for (const model of stamped) {
      const compat = model.compat as Record<string, unknown>;
      expect(compat.supportsTemperature).toBe(true);
      expect(compat.supportsStrictTools).toBe(false);
      expect(compat.forceAdaptiveThinking).toBeUndefined();
      expect(compat.supportsReasoningEffort).toBeUndefined();
    }
  });

  it("maps off to disabled and nulls positive levels for reasoning models", () => {
    expect(stamped[1].thinkingLevelMap).toEqual({
      off: "none",
      minimal: null,
      low: null,
      medium: null,
      high: null,
      xhigh: null,
      max: null,
    });
  });

  it("leaves non-reasoning models unable to disable (nothing to disable)", () => {
    expect(stamped[0].thinkingLevelMap?.off).toBeNull();
  });

  it("keeps off null for models that cannot disable reasoning", () => {
    const glm: SyntheticModel = {
      ...reasoningModel,
      id: "hf:zai-org/GLM-5.3-Flash",
    };
    const alias: SyntheticModel = {
      ...reasoningModel,
      id: "syn:large:text",
    };
    const [stampedGlm, stampedAlias] = createAnthropicMessagesApi().stampModels(
      [glm, alias],
    );
    expect(stampedGlm.thinkingLevelMap?.off).toBeNull();
    expect(stampedAlias.thinkingLevelMap?.off).toBeNull();
  });

  it("maps off to none for models that verified-disable via thinking.disabled", () => {
    const ids = [
      "syn:small:text",
      "syn:small:vision",
      "syn:large:vision",
      "hf:openai/gpt-oss-120b",
      "hf:moonshotai/Kimi-K3",
    ];
    for (const model of createAnthropicMessagesApi().stampModels(
      ids.map((id) => ({ ...reasoningModel, id })),
    )) {
      expect(model.thinkingLevelMap?.off).toBe("none");
    }
  });
});

describe("streaming", () => {
  function fakeStreamSimple() {
    return vi.fn<AnyStreamSimple>(() => createAssistantMessageEventStream());
  }

  it("delegates streamSimple with caller options untouched", () => {
    const fake = fakeStreamSimple();
    const onPayload = vi.fn();
    const model = { id: "x" } as Model<Api>;
    createAnthropicMessagesApi({ streamSimple: fake }).streamSimple(
      model,
      { messages: [] } as Context,
      { onPayload } as never,
    );

    expect(fake).toHaveBeenCalledOnce();
    expect(fake.mock.calls[0]?.[0]).toBe(model);
    expect(fake.mock.calls[0]?.[2]?.onPayload).toBe(onPayload);
  });

  it("injects Authorization Bearer from the resolved api key", () => {
    const fake = fakeStreamSimple();
    createAnthropicMessagesApi({ streamSimple: fake }).streamSimple(
      { id: "x" } as Model<Api>,
      { messages: [] } as Context,
      { apiKey: "syn-key" } as never,
    );

    const options = fake.mock.calls[0]?.[2] as {
      apiKey?: string;
      headers?: Record<string, string | null>;
    };
    expect(options.apiKey).toBe("syn-key");
    expect(options.headers?.Authorization).toBe("Bearer syn-key");
  });

  it("merges the Bearer header with caller headers", () => {
    const fake = fakeStreamSimple();
    createAnthropicMessagesApi({ streamSimple: fake }).streamSimple(
      { id: "x" } as Model<Api>,
      { messages: [] } as Context,
      { apiKey: "k", headers: { "X-Custom": "v" } } as never,
    );

    const options = fake.mock.calls[0]?.[2] as {
      headers?: Record<string, string | null>;
    };
    expect(options.headers).toEqual({
      "X-Custom": "v",
      Authorization: "Bearer k",
    });
  });

  it("leaves options without an api key untouched (anonymous)", () => {
    const fake = fakeStreamSimple();
    const anonymous = {} as never;
    createAnthropicMessagesApi({ streamSimple: fake }).streamSimple(
      { id: "x" } as Model<Api>,
      { messages: [] } as Context,
      anonymous,
    );

    expect(fake.mock.calls[0]?.[2]).toBe(anonymous);
  });
});
