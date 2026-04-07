import type {
  SessionInfo,
  RawMessage,
  AuditSummary,
  DailyReport,
  DailyReportStats,
  WaitingAlert,
} from "../types";

export class FleetApiClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  private async fetch<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`API ${res.status}: ${body}`);
    }
    return res.json();
  }

  async health(): Promise<{ version: string; status: string }> {
    return this.fetch("/health");
  }

  async listSessions(): Promise<SessionInfo[]> {
    return this.fetch("/sessions");
  }

  async getMessages(jsonlPath: string): Promise<RawMessage[]> {
    return this.fetch("/messages", { path: jsonlPath });
  }

  async killSession(pid: number): Promise<void> {
    await this.fetch("/stop", { pid: String(pid) });
  }

  async getAuditEvents(): Promise<AuditSummary> {
    return this.fetch("/audit");
  }

  async getWaitingAlerts(): Promise<WaitingAlert[]> {
    return this.fetch("/waiting_alerts");
  }

  async getDailyReport(date: string): Promise<DailyReport | null> {
    return this.fetch("/daily_report", { date });
  }

  async getDailyReportStats(
    from: string,
    to: string,
  ): Promise<DailyReportStats[]> {
    return this.fetch("/daily_report_stats", { from, to });
  }

  async generateDailyReport(date: string): Promise<DailyReport> {
    return this.fetch("/daily_report/generate", { date });
  }

  async searchSessions(
    query: string,
    limit = 20,
  ): Promise<
    Array<{
      sessionId: string;
      snippet: string;
      rank: number;
    }>
  > {
    return this.fetch("/search", { q: query, limit: String(limit) });
  }

  /** SSE event source URL (use with EventSource or custom SSE) */
  sseUrl(): string {
    return `${this.baseUrl}/events?token=${this.token}`;
  }
}
