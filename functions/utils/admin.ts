interface AdminEnv {
  ADMIN_EMAILS?: string;
  USERS_DB?: D1Database;
}

const parseAdminEmails = (raw?: string): string[] => {
  if (!raw) return [];
  return raw
    .split(/[,\n;]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

export const isAdminEmail = async (env: AdminEnv, email?: string | null): Promise<boolean> => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  // Check env var first (fallback/bootstrap)
  const envAdmins = parseAdminEmails(env.ADMIN_EMAILS);
  if (envAdmins.includes(normalized)) return true;

  // Check DB
  if (env.USERS_DB) {
    try {
      const result = await env.USERS_DB.prepare('SELECT 1 FROM admin_allowlist WHERE email = ?')
        .bind(normalized)
        .first();
      if (result) return true;
    } catch (e) {
      console.warn('Failed to check admin DB', e);
    }
  }

  return false;
};

export const withAdminFlag = async <T extends { email: string }>(
  env: AdminEnv,
  user: T
): Promise<T & { isAdmin: boolean }> => {
  return {
    ...user,
    isAdmin: await isAdminEmail(env, user.email)
  };
};

export type { AdminEnv };
