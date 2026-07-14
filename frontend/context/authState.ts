import { createContext } from 'react';

export interface User {
  nome: string;
  email: string;
  perfil: string;
  permissoes: string[];
}

export interface AuthContextType {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);
