interface AdminEnv {
  ADMIN_EMAILS?: string;
}

const parseAdminEmails = (raw?: string): string[] => {
  if (!raw) return [];
  return raw
    .split(/[,\n;]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

export const isAdminEmail = (env: AdminEnv, email?: string | null): boolean => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const admins = parseAdminEmails(env.ADMIN_EMAILS);
  return admins.includes(normalized);
};

export const withAdminFlag = <T extends { email: string }>(
  env: AdminEnv,
  user: T
): T & { isAdmin: boolean } => {
  return {
    ...user,
    isAdmin: isAdminEmail(env, user.email)
  };
};

export type { AdminEnv };
