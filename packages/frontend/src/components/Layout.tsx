import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

const navigation = [
  { name: 'Sites', href: '/sites', icon: LayoutDashboard },
  { name: 'Access Logs', href: '/logs', icon: FileText },
];

export function Layout() {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-gray-800 border-r border-gray-700">
        <div className="flex h-full flex-col">
          {/* Logo/Title */}
          <div className="flex h-16 items-center border-b border-gray-700 px-6">
            <h1 className="text-xl font-bold text-white">
              Geo-IP Admin
            </h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-gray-700 p-4">
            <div className="space-y-2">
              <p className="text-xs text-gray-400">
                Logged in as: <span className="text-white">{user?.email}</span>
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className="w-full"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
              <p className="text-xs text-gray-500">
                Phase 5 - Production Ready - v2.0.0-beta
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
