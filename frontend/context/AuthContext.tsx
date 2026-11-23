import { useEffect, useState, type ReactNode } from 'react';
import { AuthContext, type User } from './authState';
import { setAccessToken, setSessionExpiryHandler } from '../services/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ token: string; user: User } | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  function login(token: string, user: User) {
    setAccessToken(token);
    setSession({ token, user });
    setSessionExpired(false);
  }

  function logout() {
    setAccessToken(null);
    setSession(null);
    setSessionExpired(false);
  }

  useEffect(() => {
    setSessionExpiryHandler(() => {
      setAccessToken(null);
      setSession(null);
      setSessionExpired(true);
    });
    return () => setSessionExpiryHandler();
  }, []);

  return <AuthContext.Provider value={{
    token: session?.token ?? null, user: session?.user ?? null, sessionExpired, login, logout,
  }}>{children}</AuthContext.Provider>;
}
