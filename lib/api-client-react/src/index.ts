export * from "./generated/api";
export * from "./generated/api.schemas";
export { customFetch, setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export { normalizeStorefrontTitle, SOSO_DEFAULT_BROWSER_TITLE } from "@workspace/api-zod";
export type { AuthTokenGetter } from "./custom-fetch";
export { isPrivateStorefrontPath, isPrivateAdvertisingPath } from "@workspace/api-zod";
