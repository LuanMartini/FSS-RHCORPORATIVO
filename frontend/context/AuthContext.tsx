import { useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './authState';
import type { User } from './authState';
import { setAccessToken } from '../services/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const login = (tk: string, usr: User) => {
    setAccessToken(tk);
    setToken(tk);
    setUser(usr);
  };

  const logout = () => {
    setAccessToken(null);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
