import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  console.log('ProtectedRoute check - loading:', loading, 'user:', user);

  if (loading) {
    // Still loading auth state, don't redirect yet
    console.log('Still loading, showing nothing');
    return null;
  }

  if (!user) {
    // Redirect to login but save the attempted location
    console.log('No user after loading, redirecting to login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  console.log('User authenticated, rendering protected content');
  return <>{children}</>;
}
