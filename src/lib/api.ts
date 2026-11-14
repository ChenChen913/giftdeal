/** 统一 API 客户端：自动带 X-Ledger-Id、解包信封、401 广播 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  ledgerId?: string | null;
  signal?: AbortSignal;
};

type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export const UNAUTHORIZED_EVENT = "giftdeal:unauthorized";

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.ledgerId) headers["X-Ledger-Id"] = options.ledgerId;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiError("NETWORK_ERROR", "网络连接失败，请稍后重试", 0);
  }

  const text = await response.text();
  let payload: Envelope<T> | null = null;
  try {
    payload = text ? (JSON.parse(text) as Envelope<T>) : null;
  } catch {
    payload = null;
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (!response.ok || !payload || payload.ok !== true) {
    const error = payload && payload.ok === false ? payload.error : undefined;
    throw new ApiError(
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? `请求失败（${response.status}）`,
      response.status,
      error?.details,
    );
  }

  return payload.data;
}
