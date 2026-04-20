import type { AuthStorage, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import {
  clearPendingMigrationNotice,
  configLoader,
  emitSyntheticConfigUpdated,
  hasPendingMigrationNotice,
  registerSyntheticSettings,
  SYNTHETIC_EXTENSIONS_REGISTER_EVENT,
  SYNTHETIC_EXTENSIONS_REQUEST_EVENT,
  type SyntheticExtensionsRegisterPayload,
  type SyntheticFeatureId,
  seedSyntheticConfigIfMissing,
} from "../../config";
import { getSyntheticApiKey } from "../../lib/env";
import { QuotaStore } from "../../services/quota-store";
import {
  parseQuotaHeader,
  type QuotasResponse,
  SYNTHETIC_QUOTAS_REQUEST_EVENT,
  SYNTHETIC_QUOTAS_UPDATED_EVENT,
} from "../../types/quotas";
import { fetchQuotas } from "../../utils/quotas";
import { SYNTHETIC_MODELS } from "./models";

const MIGRATION_NOTICE_MESSAGE_TYPE = "synthetic:migration-notice";
const MIGRATION_NOTICE_TITLE = "pi-synthetic";
const MIGRATION_NOTICE_CONTENT = [
  "New optional features added to `pi-synthetic`:",
  "- Usage widget",
  "- Quotas warnings",
  "",
  "Enable them either with `pi config` or inside of `pi` with `/synthetic:settings`.",
].join("\n");

/** Wrap lines in a rounded Unicode frame with 1-char inner padding. */
function wrapInRoundedBorder(
  lines: string[],
  width: number,
  colorFn: (text: string) => string,
): string[] {
  const innerWidth = Math.max(1, width - 2);
  const hBar = "\u2500".repeat(innerWidth);
  const top = colorFn(`\u256D${hBar}\u256E`);
  const bottom = colorFn(`\u2570${hBar}\u256F`);
  const left = colorFn("\u2502");
  const right = colorFn("\u2502");

  const wrapped = lines.map((line) => {
    const contentWidth = visibleWidth(line);
    const fill = Math.max(0, innerWidth - contentWidth);
    return `${left}${line}${" ".repeat(fill)}${right}`;
  });

  return [top, ...wrapped, bottom];
}

/** Highlight `backtick-wrapped` spans using the accent color. */
function highlightInlineCode(
  text: string,
  colorFn: (text: string) => string,
): string {
  return text.replace(/`([^`]+)`/g, (_, code) => colorFn(code));
}

export function registerSyntheticProvider(pi: ExtensionAPI): void {
  pi.registerProvider("synthetic", {
    baseUrl: "https://api.synthetic.new/openai/v1",
    apiKey: "SYNTHETIC_API_KEY",
    api: "openai-completions",
    headers: {
      Referer: "https://pi.dev",
      "X-Title": "npm:@aliou/pi-synthetic",
    },
    models: SYNTHETIC_MODELS.map(({ provider: _provider, ...model }) => ({
      ...model,
      compat: {
        supportsDeveloperRole: false,
        maxTokensField: "max_tokens",
        ...model.compat,
      },
    })),
  });
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  await seedSyntheticConfigIfMissing();
  registerSyntheticProvider(pi);

  pi.registerMessageRenderer(
    MIGRATION_NOTICE_MESSAGE_TYPE,
    (message, _options, theme) => {
      const rawContent =
        typeof message.content === "string"
          ? message.content
          : MIGRATION_NOTICE_CONTENT;
      const accent = (t: string) => theme.fg("accent", t);
      const borderColor = accent;
      const title = theme.bold(accent(MIGRATION_NOTICE_TITLE));
      const body = highlightInlineCode(rawContent, accent);

      return {
        render(width: number) {
          // border (2) + inner padding (2)
          const contentWidth = Math.max(1, width - 4);
          const bodyLines = wrapTextWithAnsi(body, contentWidth);
          const lines = [title, "", ...bodyLines];
          const padded = lines.map((line) => ` ${line} `);
          return wrapInRoundedBorder(padded, width, borderColor);
        },
        handleInput() {
          return false;
        },
        invalidate() {},
      };
    },
  );

  const loadedFeatures = new Set<SyntheticFeatureId>();

  pi.events.on(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, (data: unknown) => {
    const { feature } = data as SyntheticExtensionsRegisterPayload;
    loadedFeatures.add(feature);
  });

  registerSyntheticSettings(pi, {
    getLoadedFeatures: () => loadedFeatures,
  });

  // --- Quota store ---
  const quotaStore = new QuotaStore();
  let currentAuthStorage: AuthStorage | undefined;

  async function fetchQuotasFromAuth(): Promise<QuotasResponse | undefined> {
    if (!currentAuthStorage) return undefined;
    const apiKey = await getSyntheticApiKey(currentAuthStorage);
    if (!apiKey) return undefined;
    const result = await fetchQuotas(apiKey);
    return result.success ? result.data.quotas : undefined;
  }

  // Bridge: when the store emits a snapshot, broadcast via pi.events
  quotaStore.subscribe((snapshot) => {
    pi.events.emit(SYNTHETIC_QUOTAS_UPDATED_EVENT, {
      quotas: snapshot.quotas,
      source: snapshot.source,
    });
  });

  // Ingest quotas from the x-synthetic-quotas response header
  pi.on("after_provider_response", (event, ctx) => {
    if (ctx.model?.provider !== "synthetic") return;
    const quotas = parseQuotaHeader(event.headers);
    if (quotas) quotaStore.ingest(quotas, "header");
  });

  // Respond to quota requests from other extensions (e.g. on model_select)
  pi.events.on(SYNTHETIC_QUOTAS_REQUEST_EVENT, async () => {
    await quotaStore.refreshFromApi(fetchQuotasFromAuth);
  });

  pi.on("session_start", async (_event, ctx) => {
    loadedFeatures.clear();
    quotaStore.clear();
    currentAuthStorage = ctx.modelRegistry.authStorage;
    pi.events.emit(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, undefined);
    emitSyntheticConfigUpdated(pi);

    // Initial quota fetch for the session so consumers have data before
    // any provider response fires.
    if (ctx.model?.provider === "synthetic") {
      await quotaStore.refreshFromApi(fetchQuotasFromAuth);
    }

    if (hasPendingMigrationNotice()) {
      clearPendingMigrationNotice();
      pi.sendMessage(
        {
          customType: MIGRATION_NOTICE_MESSAGE_TYPE,
          content: MIGRATION_NOTICE_CONTENT,
          display: true,
        },
        { triggerTurn: false },
      );
    }
  });
}
