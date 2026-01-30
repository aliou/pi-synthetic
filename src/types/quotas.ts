export interface QuotasResponse {
  subscription: {
    limit: number;
    requests: number;
    renewsAt: string;
  };
}
