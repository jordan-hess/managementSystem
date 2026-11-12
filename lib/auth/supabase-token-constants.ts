/**
 * Constants for Supabase-compatible JWT token management.
 * Used by both the token-issuing API route and the browser client.
 */

export const TOKEN_LIFETIME_SECONDS = 300 // 5 minutes
export const TOKEN_LIFETIME_MS = TOKEN_LIFETIME_SECONDS * 1000
export const REFRESH_BUFFER_MS = 10_000 // Refresh 10 seconds before expiry
