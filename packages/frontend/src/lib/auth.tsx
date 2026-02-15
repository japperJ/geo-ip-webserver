import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAuthToken as setApiAuthToken, api } from './api';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  role: string;
}

interface RawUser {
  id: string;
  email: string;
  role?: string;
  global_role?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  setUser: (user: RawUser | User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(user: RawUser | null | undefined): User | null {
  if (!user) {
    return null;
  }

  const role = user.role || user.global_role;

  if (!role) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Custom setToken that also updates the API client
  const setToken = (newToken: string | null) => {
    setTokenState(newToken);
    setApiAuthToken(newToken);
  };

  const setUser = (newUser: RawUser | User | null) => {
    setUserState(normalizeUser(newUser));
  };

  useEffect(() => {
    // Try to refresh access token from HttpOnly cookie on mount
    const refreshToken = async () => {
      try {
        // Call refresh endpoint with credentials (sends HttpOnly cookie)
        const response = await axios.post('/api/auth/refresh', {}, {
          withCredentials: true, // Critical: sends refresh cookie
        });

        if (!response.data.accessToken) {
          throw new Error('Invalid refresh response');
        }

        setToken(response.data.accessToken);

        const responseUser = normalizeUser(response.data.user);

        if (responseUser) {
          setUser(responseUser);
        } else {
          const meResponse = await api.get('/auth/me');
          const meUser = normalizeUser(meResponse.data?.user);

          if (!meUser) {
            throw new Error('Unable to restore user state');
          }

          setUser(meUser);
        }

      } catch (error) {
        // Refresh failed - user needs to log in again
        // Don't log error (expected when not logged in)
        setUser(null);
        setToken(null);
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };

    refreshToken();
  }, []);

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, token, setUser, setToken, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
