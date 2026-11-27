// Types for ./yondr-session.js (copied from overyondr-website-v1/auth/src/session.js).
interface YondrEnv { YONDR_AUTH_PUBLIC_JWK?: string; ALLOWED_EMAIL_DOMAINS?: string }
export const AUTH_ORIGIN: string;
export function yondrUser(request: Request, env: YondrEnv): Promise<{ email: string; name: string | null } | null>;
export function verifySession(token: string | null, env: YondrEnv): Promise<{ email: string; name: string | null } | null>;
export function loginUrl(request: Request): string;
export function logoutUrl(returnTo?: string): string;
