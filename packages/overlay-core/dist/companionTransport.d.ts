/**
 * Resolve the base URL for companion server HTTP requests.
 */
export declare function getCompanionBaseUrl(): string;
export interface CompanionRequestInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
}
export interface BridgeCallPayload {
    id: string;
    method: "GET" | "POST";
    path: string;
    body?: string;
}
/**
 * Perform a JSON request to the companion server via CDP bridge when available, falling back to HTTP fetch.
 */
export declare function companionRequestJson<T = any>(path: string, init?: CompanionRequestInit): Promise<T>;
