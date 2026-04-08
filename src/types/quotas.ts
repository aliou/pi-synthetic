export interface QuotasResponse {
  subscription?: {
    limit: number;
    requests: number;
    renewsAt: string;
  };
  search?: {
    hourly?: {
      limit: number;
      requests: number;
      renewsAt: string;
    };
  };
  freeToolCalls?: {
    limit: number;
    requests: number;
    renewsAt: string;
  };
  weeklyTokenLimit?: {
    nextRegenAt: string;
    percentRemaining: number;
    maxCredits: string;
    remainingCredits: string;
    nextRegenCredits: string;
  };
  rollingFiveHourLimit?: {
    nextTickAt: string;
    tickPercent: number;
    remaining: number;
    max: number;
    limited: boolean;
  };
}
