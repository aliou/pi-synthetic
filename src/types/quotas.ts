export interface QuotasResponse {
  subscription: {
    limit: number;
    requests: number;
    renewsAt: string;
  };
  search: {
    hourly: {
      limit: number;
      requests: number;
      renewsAt: string;
    };
  };
  freeToolCalls: {
    limit: number;
    requests: number;
    renewsAt: string;
  };
}
