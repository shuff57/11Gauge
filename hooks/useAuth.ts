import { useState, useEffect } from 'react';
import { SessionUser } from '../types';

export interface AuthState {
  user: SessionUser | null;
  isLoading: boolean;
  isAuthOpen: boolean;
  setIsAuthOpen: (isOpen: boolean) => void;
  setUser: (user: SessionUser | null) => void;
  signOut: () => Promise<void>;
}

/**
 * Custom hook for managing authentication state
 * Handles session verification, OAuth callbacks, and user state
 */
export const useAuth = (): AuthState => {
  const [user, setUser] = useState<SessionUser | null>(() => {
    const stored = sessionStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Persist user to sessionStorage
  useEffect(() => {
    if (user) {
      sessionStorage.setItem('user', JSON.stringify(user));
    } else {
      sessionStorage.removeItem('user');
    }
  }, [user]);

  // Initialize auth state on mount
  useEffect(() => {
    let active = true;

    const initAuth = async () => {
      try {
        // 1. First, check for OAuth callback in URL
        const params = new URLSearchParams(window.location.search);
        const authSuccess = params.get('auth_success');
        const email = params.get('email');
        const authError = params.get('auth_error');

        if (authSuccess === 'true' && email) {
          setUser({ email: decodeURIComponent(email) });
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsLoading(false);
          return;
        } else if (authError) {
          console.error('Auth error:', authError);
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        // 2. Then verify existing session
        const response = await fetch('/api/auth/me');
        if (!active) return;

        if (response.status === 401) {
          // Session is invalid, clear user state
          if (user) setUser(null);
          setIsLoading(false);
          return;
        }

        if (!response.ok) {
          setIsLoading(false);
          return;
        }

        const data = await response.json().catch(() => null) as any;
        if (!active) return;

        if (data?.user?.email) {
          setUser({
            email: data.user.email,
            isAdmin: Boolean(data.user.isAdmin),
            id: data.user.id
          });
        }
      } catch (err) {
        console.warn('Auth initialization failed', err);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      active = false;
    };
  }, []); // Only run once on mount

  const signOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      setUser(null);
      sessionStorage.removeItem('user');
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  return {
    user,
    isLoading,
    isAuthOpen,
    setIsAuthOpen,
    setUser,
    signOut
  };
};
