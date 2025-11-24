interface Env {
  USERS_DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const reqUrl = new URL(request.url);
  const returnToParam = reqUrl.searchParams.get('return_to');
  
  console.log('[Google OAuth] Initiating OAuth flow');
  
  // Check if we have the required environment variables
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.error('[Google OAuth] Missing Google OAuth credentials');
    return new Response('Google OAuth not configured', { status: 500 });
  }

  // Generate state containing CSRF nonce + return target
  const stateObj = {
    nonce: crypto.randomUUID(),
    return_to: returnToParam || reqUrl.origin
  };
  const state = btoa(JSON.stringify(stateObj));
  
  // Build Google OAuth URL
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI || 'https://your-domain.pages.dev/api/auth/google/callback');
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', state);
  
  console.log('[Google OAuth] Redirecting to Google with state', stateObj);
  
  // Redirect to Google OAuth
  return Response.redirect(googleAuthUrl.toString(), 302);
};
