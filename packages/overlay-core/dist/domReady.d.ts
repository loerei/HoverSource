/**
 * Wait until `document.body` exists or timeout/abort settles. Never rejects.
 */
export declare function waitForDomBody(timeoutMs?: number, signal?: AbortSignal): Promise<boolean>;
