import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAuthToken as setApiAuthToken, api } from './api';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Custom setToken that also updates the API client
  const setToken = (newToken: string | null) => {
    setTokenState(newToken);
    setApiAuthToken(newToken);
  };

  useEffect(() => {
    // Try to refresh access token from HttpOnly cookie on mount
    const refreshToken = async () => {
      try {
        // Call refresh endpoint with credentials (sends HttpOnly cookie)
        const response = await axios.post('/api/auth/refresh', {}, {
          withCredentials: true, // Critical: sends refresh cookie
        });

        if (response.data.accessToken && response.data.user) {
          // Restore access token and user state
          setToken(response.data.accessToken);
          setUser(response.data.user);
        } else {
          // Invalid response - clear state
          setUser(null);
          setToken(null);
          localStorage.removeItem('user');
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
