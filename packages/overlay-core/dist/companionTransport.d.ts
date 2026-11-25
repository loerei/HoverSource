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
/**
 * Perform an HTTP JSON request to the companion server with timeout clamping and AbortSignal cleanup.
 */
export declare function companionRequestJson<T = any>(path: string, init?: CompanionRequestInit): Promise<T>;
