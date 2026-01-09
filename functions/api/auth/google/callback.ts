import { createSession, buildSessionCookie } from '../../../utils/session';

interface Env {
  USERS_DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  ALLOWED_ORIGINS?: string; // Comma-separated list of allowed origins
}

/**
 * Validates that a redirect URL is safe to use
 * Prevents open redirect vulnerabilities
 */
const validateRedirectOrigin = (returnTo: string | null, requestOrigin: string): string => {
  if (!returnTo) {
    return requestOrigin;
  }

  try {
    const returnUrl = new URL(returnTo);
    const requestUrl = new URL(requestOrigin);

    // Allow same origin
    if (returnUrl.origin === requestUrl.origin) {
      return returnTo;
    }

    // Check against allowlist (supports production, preview, and local dev)
    const allowedOrigins = [
      'https://11gauge.pages.dev',
      'http://localhost:3000',
      'http://localhost:8788',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8788',
    ];

    if (allowedOrigins.includes(returnUrl.origin)) {
      return returnTo;
    }

    console.warn('[OAuth] Rejected untrusted redirect origin:', returnUrl.origin);
    return requestOrigin;
  } catch (e) {
    // Invalid URL, fall back to request origin
    console.warn('[OAuth] Invalid redirect URL:', returnTo);
    return requestOrigin;
  }
};

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const secure = request.url.startsWith('https://');
  
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  let returnToOrigin: string | null = null;
  if (state) {
    try {
      const decoded = JSON.parse(atob(state));
      if (decoded && typeof decoded.return_to === 'string') {
        returnToOrigin = decoded.return_to;
      }
      console.log('[Google OAuth Callback] Decoded state', decoded);
    } catch (e) {
      console.warn('[Google OAuth Callback] Failed to decode state');
    }
  }
  const error = url.searchParams.get('error');
  
  console.log('[Google OAuth Callback] Received callback', { code: !!code, state, error });
  
  if (error) {
    console.error('[Google OAuth Callback] Error from Google:', error);
    return Response.redirect('/?auth_error=' + encodeURIComponent(error), 302);
  }
  
  if (!code) {
    console.error('[Google OAuth Callback] No code provided');
    return Response.redirect('/?auth_error=no_code', 302);
  }
  
  try {
    // Exchange code for tokens
    console.log('[Google OAuth Callback] Exchanging code for tokens');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI || 'https://your-domain.pages.dev/api/auth/google/callback',
        grant_type: 'authorization_code',
      }),
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Google OAuth Callback] Token exchange failed:', errorText);
      return Response.redirect('/?auth_error=token_exchange_failed', 302);
    }
    
    const tokens: GoogleTokenResponse = await tokenResponse.json();
    console.log('[Google OAuth Callback] Got tokens');
    
    // Get user info
    console.log('[Google OAuth Callback] Fetching user info');
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });
    
    if (!userInfoResponse.ok) {
      console.error('[Google OAuth Callback] Failed to get user info');
      return Response.redirect('/?auth_error=user_info_failed', 302);
    }
    
    const userInfo: GoogleUserInfo = await userInfoResponse.json();
    console.log('[Google OAuth Callback] Got user info:', userInfo.email);
    
    // Check if user exists
    const existingUser = await env.USERS_DB.prepare(
      'SELECT id, email FROM users WHERE email = ?'
    ).bind(userInfo.email.toLowerCase()).first();
    let userId = existingUser?.id;

    if (!existingUser) {
      // Create new user (OAuth users don't have passwords)
      console.log('[Google OAuth Callback] Creating new user');
      const insert = await env.USERS_DB.prepare(
        'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)'
      ).bind(
        userInfo.email.toLowerCase(),
        'GOOGLE_OAUTH', // Placeholder for OAuth users
        new Date().toISOString()
      ).run();
      if (insert.success) {
        userId = insert.meta.last_row_id;
      }
    }
    
    console.log('[Google OAuth Callback] User authenticated, redirecting');

    const token = userId ? await createSession(env, userId) : null;

    // Validate redirect origin to prevent open redirect attacks
    const requestOrigin = new URL(request.url).origin;
    const validatedOrigin = validateRedirectOrigin(returnToOrigin, requestOrigin);
    const redirectUrl = new URL(validatedOrigin);
    redirectUrl.pathname = '/';
    redirectUrl.search = `?auth_success=true&email=${encodeURIComponent(userInfo.email)}`;

    const headers = new Headers({ Location: redirectUrl.toString() });
    if (token) {
      headers.set('Set-Cookie', buildSessionCookie(token, { secure }));
    }
    return new Response(null, { status: 302, headers });
  } catch (err: any) {
    console.error('[Google OAuth Callback] Error:', err);
    // Validate redirect origin even in error cases
    const requestOrigin = new URL(request.url).origin;
    const validatedOrigin = validateRedirectOrigin(returnToOrigin, requestOrigin);
    const redirectUrl = new URL(validatedOrigin);
    redirectUrl.pathname = '/';
    redirectUrl.search = `?auth_error=${encodeURIComponent(err.message)}`;
    return Response.redirect(redirectUrl.toString(), 302);
  }
};
