var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// utils/session.ts
var SESSION_COOKIE_NAME = "11g_session";
var SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
var parseCookies = /* @__PURE__ */ __name((header) => {
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}, "parseCookies");
var buildSessionCookie = /* @__PURE__ */ __name((token, options) => {
  const parts = [`${SESSION_COOKIE_NAME}=${token ? encodeURIComponent(token) : ""}`];
  parts.push("Path=/");
  if (token) {
    parts.push(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
  } else {
    parts.push("Max-Age=0");
  }
  parts.push("SameSite=Lax");
  if (options?.secure !== false) {
    parts.push("Secure");
  }
  parts.push("HttpOnly");
  return parts.join("; ");
}, "buildSessionCookie");
var createSession = /* @__PURE__ */ __name(async (env, userId) => {
  if (!env.USERS_DB) return null;
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const createdAt = /* @__PURE__ */ new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_MAX_AGE_SECONDS * 1e3);
  await env.USERS_DB.prepare(
    "INSERT INTO sessions (user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(userId, token, createdAt.toISOString(), expiresAt.toISOString()).run();
  return token;
}, "createSession");
var deleteSession = /* @__PURE__ */ __name(async (env, token) => {
  if (!env.USERS_DB) return;
  await env.USERS_DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}, "deleteSession");
var getSessionToken = /* @__PURE__ */ __name((request) => {
  const cookieHeader = request.headers.get("Cookie");
  const cookies = parseCookies(cookieHeader);
  return cookies[SESSION_COOKIE_NAME] || null;
}, "getSessionToken");
var getSessionUser = /* @__PURE__ */ __name(async (env, request) => {
  if (!env.USERS_DB) return null;
  const token = getSessionToken(request);
  if (!token) return null;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const session = await env.USERS_DB.prepare(
    `SELECT s.id, s.user_id, s.token, s.expires_at, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`
  ).bind(token, nowIso).first();
  if (!session || !session.email) return null;
  return { id: session.user_id, email: session.email };
}, "getSessionUser");

// api/auth/google/callback.ts
var onRequest = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const secure = request.url.startsWith("https://");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  let returnToOrigin = null;
  if (state) {
    try {
      const decoded = JSON.parse(atob(state));
      if (decoded && typeof decoded.return_to === "string") {
        returnToOrigin = decoded.return_to;
      }
      console.log("[Google OAuth Callback] Decoded state", decoded);
    } catch (e) {
      console.warn("[Google OAuth Callback] Failed to decode state");
    }
  }
  const error = url.searchParams.get("error");
  console.log("[Google OAuth Callback] Received callback", { code: !!code, state, error });
  if (error) {
    console.error("[Google OAuth Callback] Error from Google:", error);
    return Response.redirect("/?auth_error=" + encodeURIComponent(error), 302);
  }
  if (!code) {
    console.error("[Google OAuth Callback] No code provided");
    return Response.redirect("/?auth_error=no_code", 302);
  }
  try {
    console.log("[Google OAuth Callback] Exchanging code for tokens");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI || "https://your-domain.pages.dev/api/auth/google/callback",
        grant_type: "authorization_code"
      })
    });
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("[Google OAuth Callback] Token exchange failed:", errorText);
      return Response.redirect("/?auth_error=token_exchange_failed", 302);
    }
    const tokens = await tokenResponse.json();
    console.log("[Google OAuth Callback] Got tokens");
    console.log("[Google OAuth Callback] Fetching user info");
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    });
    if (!userInfoResponse.ok) {
      console.error("[Google OAuth Callback] Failed to get user info");
      return Response.redirect("/?auth_error=user_info_failed", 302);
    }
    const userInfo = await userInfoResponse.json();
    console.log("[Google OAuth Callback] Got user info:", userInfo.email);
    const existingUser = await env.USERS_DB.prepare(
      "SELECT id, email FROM users WHERE email = ?"
    ).bind(userInfo.email.toLowerCase()).first();
    let userId = existingUser?.id;
    if (!existingUser) {
      console.log("[Google OAuth Callback] Creating new user");
      const insert = await env.USERS_DB.prepare(
        "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)"
      ).bind(
        userInfo.email.toLowerCase(),
        "GOOGLE_OAUTH",
        // Placeholder for OAuth users
        (/* @__PURE__ */ new Date()).toISOString()
      ).run();
      if (insert.success) {
        userId = insert.meta.last_row_id;
      }
    }
    console.log("[Google OAuth Callback] User authenticated, redirecting");
    const token = userId ? await createSession(env, userId) : null;
    const base = returnToOrigin || new URL(request.url).origin;
    const redirectUrl = new URL(base);
    redirectUrl.pathname = "/";
    redirectUrl.search = `?auth_success=true&email=${encodeURIComponent(userInfo.email)}`;
    const headers = new Headers({ Location: redirectUrl.toString() });
    if (token) {
      headers.set("Set-Cookie", buildSessionCookie(token, { secure }));
    }
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.error("[Google OAuth Callback] Error:", err);
    const base = returnToOrigin || new URL(request.url).origin;
    const redirectUrl = new URL(base);
    redirectUrl.pathname = "/";
    redirectUrl.search = `?auth_error=${encodeURIComponent(err.message)}`;
    return Response.redirect(redirectUrl.toString(), 302);
  }
}, "onRequest");

// api/auth/google.ts
var onRequest2 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const reqUrl = new URL(request.url);
  const returnToParam = reqUrl.searchParams.get("return_to");
  console.log("[Google OAuth] Initiating OAuth flow");
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.error("[Google OAuth] Missing Google OAuth credentials");
    return new Response("Google OAuth not configured", { status: 500 });
  }
  const stateObj = {
    nonce: crypto.randomUUID(),
    return_to: returnToParam || reqUrl.origin
  };
  const state = btoa(JSON.stringify(stateObj));
  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI || "https://your-domain.pages.dev/api/auth/google/callback");
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("state", state);
  console.log("[Google OAuth] Redirecting to Google with state", stateObj);
  return Response.redirect(googleAuthUrl.toString(), 302);
}, "onRequest");

// api/auth/me.ts
var json = /* @__PURE__ */ __name((body, init = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: {
    "Content-Type": "application/json",
    ...init.headers || {}
  }
}), "json");
var onRequest3 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ user: null }, { status: 401 });
  }
  return json({ user });
}, "onRequest");

// api/auth/signin.ts
var json2 = /* @__PURE__ */ __name((body, init = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: {
    "Content-Type": "application/json",
    ...init.headers || {}
  }
}), "json");
var hashPassword = /* @__PURE__ */ __name(async (password) => {
  const encoder2 = new TextEncoder();
  const data = encoder2.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}, "hashPassword");
var onRequest4 = /* @__PURE__ */ __name(async ({ request, env }) => {
  console.log("[Auth] Request received");
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  console.log("[Auth] USERS_DB:", !!env.USERS_DB);
  if (!env.USERS_DB) {
    return json2({ error: "Database not configured" }, { status: 501 });
  }
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    console.error("[Auth] JSON parse error:", e);
    return json2({ error: "Invalid JSON" }, { status: 400 });
  }
  const { email, password } = payload;
  console.log("[Auth] Email:", email);
  if (!email || !password) {
    return json2({ error: "Email and password are required" }, { status: 400 });
  }
  const emailLower = email.toLowerCase().trim();
  const passwordHash = await hashPassword(password);
  const secure = request.url.startsWith("https://");
  try {
    console.log("[Auth] Checking for existing user:", emailLower);
    const existingUser = await env.USERS_DB.prepare(
      "SELECT id, email FROM users WHERE email = ?"
    ).bind(emailLower).first();
    console.log("[Auth] Existing user found:", !!existingUser);
    if (existingUser) {
      const userWithPassword = await env.USERS_DB.prepare(
        "SELECT id FROM users WHERE email = ? AND password_hash = ?"
      ).bind(emailLower, passwordHash).first();
      if (!userWithPassword) {
        return json2({ error: "Invalid credentials" }, { status: 401 });
      }
      const token2 = await createSession(env, existingUser.id);
      const headers2 = token2 ? { "Set-Cookie": buildSessionCookie(token2, { secure }) } : {};
      return json2({
        success: true,
        user: { id: existingUser.id, email: existingUser.email },
        isNewUser: false
      }, { headers: headers2 });
    }
    const result = await env.USERS_DB.prepare(
      "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)"
    ).bind(emailLower, passwordHash, (/* @__PURE__ */ new Date()).toISOString()).run();
    if (!result.success) {
      throw new Error("Failed to create user");
    }
    const token = await createSession(env, result.meta.last_row_id);
    const headers = token ? { "Set-Cookie": buildSessionCookie(token, { secure }) } : {};
    return json2({
      success: true,
      user: { id: result.meta.last_row_id, email: emailLower },
      isNewUser: true
    }, { headers });
  } catch (err) {
    console.error("Auth error:", err);
    return json2({ error: "Authentication failed" }, { status: 500 });
  }
}, "onRequest");

// api/auth/signout.ts
var onRequest5 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const token = getSessionToken(request);
  if (token) {
    await deleteSession(env, token);
  }
  const secure = request.url.startsWith("https://");
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": buildSessionCookie(null, { secure })
    }
  });
}, "onRequest");

// utils/crypto.ts
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var base64Encode = /* @__PURE__ */ __name((buffer) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary);
}, "base64Encode");
var base64Decode = /* @__PURE__ */ __name((input) => {
  const binary = atob(input);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}, "base64Decode");
var deriveKey = /* @__PURE__ */ __name(async (secret) => {
  const hashed = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", hashed, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}, "deriveKey");
var encryptText = /* @__PURE__ */ __name(async (plainText, secret) => {
  if (!secret) throw new Error("Missing encryption secret");
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plainText));
  const payload = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), iv.byteLength);
  return base64Encode(payload);
}, "encryptText");
var decryptText = /* @__PURE__ */ __name(async (payload, secret) => {
  if (!secret || !payload) return null;
  const key = await deriveKey(secret);
  const bytes = base64Decode(payload);
  if (bytes.byteLength <= 12) return null;
  const iv = bytes.slice(0, 12);
  const cipherBytes = bytes.slice(12);
  try {
    const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
    return decoder.decode(plainBuffer);
  } catch (err) {
    console.error("Decrypt error:", err);
    return null;
  }
}, "decryptText");

// api/keys/ollama.ts
var PROVIDER = "ollama";
var DEFAULT_LABEL = "Default";
var json3 = /* @__PURE__ */ __name((body, init = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: {
    "Content-Type": "application/json",
    ...init.headers || {}
  }
}), "json");
var onRequest6 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const sessionUser = await getSessionUser(env, request);
  const secret = env.OLLAMA_KEY_SECRET;
  if (request.method === "POST") {
    if (!sessionUser || !env.USERS_DB) {
      return json3({ error: "Not authenticated" }, { status: 401 });
    }
    if (!secret) {
      return json3({ error: "Encryption secret not configured" }, { status: 500 });
    }
    const payload = await request.json().catch(() => ({}));
    const key = (payload?.key || "").trim();
    if (!key) {
      return json3({ error: "API key is required." }, { status: 400 });
    }
    try {
      const encrypted = await encryptText(key, secret);
      const existing = await env.USERS_DB.prepare("SELECT id FROM user_keys WHERE user_id = ? AND provider = ? AND label = ?").bind(sessionUser.id, PROVIDER, DEFAULT_LABEL).first();
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      if (existing) {
        await env.USERS_DB.prepare("UPDATE user_keys SET key_value = ?, updated_at = ? WHERE id = ?").bind(encrypted, timestamp, existing.id).run();
      } else {
        await env.USERS_DB.prepare("INSERT INTO user_keys (user_id, provider, label, key_value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(sessionUser.id, PROVIDER, DEFAULT_LABEL, encrypted, timestamp, timestamp).run();
      }
      return json3({ success: true });
    } catch (err) {
      console.error("Key store error:", err);
      return json3({ error: "Failed to store key" }, { status: 500 });
    }
  }
  if (request.method === "DELETE") {
    if (!sessionUser || !env.USERS_DB) {
      return json3({ error: "Not authenticated" }, { status: 401 });
    }
    if (!secret) {
      return json3({ error: "Encryption secret not configured" }, { status: 500 });
    }
    try {
      await env.USERS_DB.prepare("DELETE FROM user_keys WHERE user_id = ? AND provider = ? AND label = ?").bind(sessionUser.id, PROVIDER, DEFAULT_LABEL).run();
      return json3({ success: true });
    } catch (err) {
      console.error("Key delete error:", err);
      return json3({ error: "Failed to delete key" }, { status: 500 });
    }
  }
  if (request.method === "GET") {
    if (!secret) {
      return json3({ error: "Encryption secret not configured" }, { status: 500 });
    }
    if (sessionUser && env.USERS_DB) {
      try {
        const keyRow = await env.USERS_DB.prepare("SELECT key_value FROM user_keys WHERE user_id = ? AND provider = ? AND label = ?").bind(sessionUser.id, PROVIDER, DEFAULT_LABEL).first();
        if (!keyRow?.key_value) return json3({ key: null });
        const decrypted = await decryptText(keyRow.key_value, secret);
        return json3({ key: decrypted || null });
      } catch (err) {
        console.error("Key fetch error:", err);
        return json3({ key: null, error: "Failed to fetch key" }, { status: 500 });
      }
    }
    return json3({ key: null });
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST, DELETE" }
  });
}, "onRequest");

// utils/ollama.ts
var CLOUD_VISION_MODEL = "qwen3-vl:235b-instruct-cloud";
var OLLAMA_KEY_STORAGE_KEY = "ollama_api_key";
var normalizeUrl = /* @__PURE__ */ __name((value) => {
  if (!value) return "";
  let clean = value.trim();
  if (!clean) return "";
  clean = clean.replace(/\/api\/?$/i, "").replace(/\/$/, "");
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  return clean;
}, "normalizeUrl");
var resolveBaseUrl = /* @__PURE__ */ __name((provided, fallback) => {
  const normalized = normalizeUrl(provided || fallback);
  if (!normalized) {
    throw new Error("Missing Ollama base URL.");
  }
  return normalized;
}, "resolveBaseUrl");
var resolveApiKey = /* @__PURE__ */ __name(async (options) => {
  const direct = (options.provided || "").trim();
  if (direct) return direct;
  const fallback = (options.fallback || "").trim();
  if (fallback) return fallback;
  if (options.store) {
    const stored = (await options.store.get(OLLAMA_KEY_STORAGE_KEY))?.trim();
    if (stored) return stored;
  }
  return void 0;
}, "resolveApiKey");
var resolveModel = /* @__PURE__ */ __name((provided, fallback) => {
  return provided?.trim() || fallback?.trim() || CLOUD_VISION_MODEL;
}, "resolveModel");
var buildHeaders = /* @__PURE__ */ __name((apiKey) => {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}, "buildHeaders");
var forwardToOllama = /* @__PURE__ */ __name(async (opts) => {
  const response = await fetch(`${opts.baseUrl}/api/generate`, {
    method: "POST",
    headers: buildHeaders(opts.apiKey),
    body: JSON.stringify({
      model: opts.model,
      prompt: opts.prompt,
      images: opts.images,
      stream: Boolean(opts.stream)
    })
  });
  return response;
}, "forwardToOllama");
var relayResponse = /* @__PURE__ */ __name(async (response) => {
  const text = await response.text();
  return new Response(text || "{}", {
    status: response.status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}, "relayResponse");

// api/ollama/generate.ts
var onRequest7 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const baseUrl = resolveBaseUrl(payload?.url, env.OLLAMA_URL);
    const apiKey = await resolveApiKey({
      provided: payload?.key,
      fallback: env.OLLAMA_API_KEY,
      store: env.KEY_STORE
    });
    const model = resolveModel(payload?.model, env.OLLAMA_MODEL);
    const prompt = payload?.prompt;
    const images = payload?.images;
    const stream = Boolean(payload?.stream);
    if (!prompt && (!images || images.length === 0)) {
      throw new Error("Prompt or images are required.");
    }
    const upstream = await forwardToOllama({
      baseUrl,
      apiKey,
      model,
      prompt,
      images,
      stream
    });
    return relayResponse(upstream);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Request failed." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
}, "onRequest");

// api/ollama/test.ts
var onRequest8 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const baseUrl = resolveBaseUrl(payload?.url, env.OLLAMA_URL);
    const apiKey = await resolveApiKey({
      provided: payload?.key,
      fallback: env.OLLAMA_API_KEY,
      store: env.KEY_STORE
    });
    const model = resolveModel(payload?.model, env.OLLAMA_MODEL);
    const upstream = await forwardToOllama({
      baseUrl,
      apiKey,
      model,
      prompt: "Hello",
      stream: false
    });
    return relayResponse(upstream);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Connection failed." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
}, "onRequest");

// api/keys/[id].ts
var json4 = /* @__PURE__ */ __name((body, init = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: {
    "Content-Type": "application/json",
    ...init.headers || {}
  }
}), "json");
var fetchKey = /* @__PURE__ */ __name(async (env, userId, id) => {
  if (!env.USERS_DB) return null;
  const row = await env.USERS_DB.prepare(
    "SELECT id, user_id, provider, label, key_value, created_at, updated_at FROM user_keys WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first();
  return row || null;
}, "fetchKey");
var onRequest9 = /* @__PURE__ */ __name(async ({ request, env, params }) => {
  const keyId = Number(params?.id);
  if (!keyId) {
    return json4({ error: "Invalid key id" }, { status: 400 });
  }
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser || !env.USERS_DB) {
    return json4({ error: "Not authenticated" }, { status: 401 });
  }
  const secret = env.OLLAMA_KEY_SECRET;
  if (!secret) {
    return json4({ error: "Encryption secret not configured" }, { status: 500 });
  }
  if (request.method === "GET") {
    const row = await fetchKey(env, sessionUser.id, keyId);
    if (!row) return json4({ error: "Key not found" }, { status: 404 });
    const decrypted = await decryptText(row.key_value, secret);
    return json4({
      key: {
        id: row.id,
        provider: row.provider,
        label: row.label,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        value: decrypted || ""
      }
    });
  }
  if (request.method === "PUT") {
    const existing = await fetchKey(env, sessionUser.id, keyId);
    if (!existing) return json4({ error: "Key not found" }, { status: 404 });
    try {
      const payload = await request.json();
      const updates = [];
      const bindings = [];
      let lastFour = null;
      if (payload?.label !== void 0) {
        const label = (payload.label || "").trim();
        if (!label) throw new Error("Label is required");
        if (label.length > 60) throw new Error("Label must be 60 characters or fewer");
        updates.push("label = ?");
        bindings.push(label);
      }
      if (payload?.key !== void 0) {
        const rawKey = (payload.key || "").trim();
        if (!rawKey) throw new Error("API key is required");
        const encrypted = await encryptText(rawKey, secret);
        updates.push("key_value = ?");
        bindings.push(encrypted);
        lastFour = rawKey.slice(-4);
      }
      if (!updates.length) {
        return json4({ error: "No changes provided" }, { status: 400 });
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      updates.push("updated_at = ?");
      bindings.push(timestamp);
      bindings.push(keyId, sessionUser.id);
      await env.USERS_DB.prepare(
        `UPDATE user_keys SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`
      ).bind(...bindings).run();
      const refreshed = await fetchKey(env, sessionUser.id, keyId);
      if (!refreshed) {
        return json4({ error: "Key not found" }, { status: 404 });
      }
      const decrypted = await decryptText(refreshed.key_value, secret);
      return json4({
        key: {
          id: refreshed.id,
          provider: refreshed.provider,
          label: refreshed.label,
          createdAt: refreshed.created_at,
          updatedAt: refreshed.updated_at,
          lastFour: lastFour ?? (decrypted ? decrypted.slice(-4) : null)
        }
      });
    } catch (err) {
      if (err?.message?.includes("UNIQUE")) {
        return json4({ error: "A key with that label already exists for this provider." }, { status: 409 });
      }
      return json4({ error: err?.message || "Failed to update key" }, { status: 400 });
    }
  }
  if (request.method === "DELETE") {
    await env.USERS_DB.prepare("DELETE FROM user_keys WHERE id = ? AND user_id = ?").bind(keyId, sessionUser.id).run();
    return json4({ success: true });
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "GET, PUT, DELETE" }
  });
}, "onRequest");

// api/keys/index.ts
var AVAILABLE_PROVIDERS = /* @__PURE__ */ new Set(["ollama", "gemini", "openai"]);
var json5 = /* @__PURE__ */ __name((body, init = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: {
    "Content-Type": "application/json",
    ...init.headers || {}
  }
}), "json");
var normalizeProvider = /* @__PURE__ */ __name((value) => {
  if (!value) throw new Error("Provider is required");
  const normalized = value.trim().toLowerCase();
  if (!AVAILABLE_PROVIDERS.has(normalized)) {
    throw new Error("Unsupported provider");
  }
  return normalized;
}, "normalizeProvider");
var sanitizeLabel = /* @__PURE__ */ __name((value) => {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    throw new Error("Label is required");
  }
  if (trimmed.length > 60) {
    throw new Error("Label must be 60 characters or fewer");
  }
  return trimmed;
}, "sanitizeLabel");
var summarizeRow = /* @__PURE__ */ __name(async (row, secret) => {
  const decrypted = await decryptText(row.key_value, secret);
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastFour: decrypted ? decrypted.slice(-4) : null
  };
}, "summarizeRow");
var onRequest10 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser || !env.USERS_DB) {
    return json5({ error: "Not authenticated" }, { status: 401 });
  }
  const secret = env.OLLAMA_KEY_SECRET;
  if (!secret) {
    return json5({ error: "Encryption secret not configured" }, { status: 500 });
  }
  if (request.method === "GET") {
    const rows = await env.USERS_DB.prepare(
      "SELECT id, provider, label, key_value, created_at, updated_at FROM user_keys WHERE user_id = ? ORDER BY created_at DESC"
    ).bind(sessionUser.id).all().then((res) => res.results || []);
    const keys = await Promise.all(rows.map((row) => summarizeRow(row, secret)));
    return json5({ keys });
  }
  if (request.method === "POST") {
    let provider;
    let label;
    let key;
    try {
      const payload = await request.json();
      provider = normalizeProvider(payload?.provider);
      label = sanitizeLabel(payload?.label);
      key = (payload?.key || "").trim();
      if (!key) throw new Error("API key is required");
    } catch (err) {
      return json5({ error: err?.message || "Invalid payload" }, { status: 400 });
    }
    try {
      const encrypted = await encryptText(key, secret);
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const result = await env.USERS_DB.prepare(
        "INSERT INTO user_keys (user_id, provider, label, key_value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(sessionUser.id, provider, label, encrypted, timestamp, timestamp).run();
      const id = result.meta?.last_row_id;
      return json5({
        key: {
          id,
          provider,
          label,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastFour: key.slice(-4)
        }
      }, { status: 201 });
    } catch (err) {
      if (err?.message?.includes("UNIQUE")) {
        return json5({ error: "A key with that label already exists for this provider." }, { status: 409 });
      }
      console.error("Key insert error", err);
      return json5({ error: "Failed to create key" }, { status: 500 });
    }
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "GET, POST" }
  });
}, "onRequest");

// ../.wrangler/tmp/pages-FCXujA/functionsRoutes-0.1346479547807764.mjs
var routes = [
  {
    routePath: "/api/auth/google/callback",
    mountPath: "/api/auth/google",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/auth/google",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/api/auth/me",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/api/auth/signin",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/api/auth/signout",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/api/keys/ollama",
    mountPath: "/api/keys",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/api/ollama/generate",
    mountPath: "/api/ollama",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  },
  {
    routePath: "/api/ollama/test",
    mountPath: "/api/ollama",
    method: "",
    middlewares: [],
    modules: [onRequest8]
  },
  {
    routePath: "/api/keys/:id",
    mountPath: "/api/keys",
    method: "",
    middlewares: [],
    modules: [onRequest9]
  },
  {
    routePath: "/api/keys",
    mountPath: "/api/keys",
    method: "",
    middlewares: [],
    modules: [onRequest10]
  }
];

// ../node_modules/wrangler/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-xnt7sX/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-xnt7sX/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.03652169549833251.mjs.map
