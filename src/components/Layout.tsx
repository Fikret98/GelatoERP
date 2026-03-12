import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Package,
  Users,
  IceCream,
  ShoppingCart,
  Briefcase,
  BarChart3,
  Menu,
  X,
  User,
  Sun,
  Moon,
  Globe,
  Bell,
  LogOut
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import PullToRefresh from './ui/PullToRefresh';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const notificationRef = React.useRef<HTMLDivElement>(null);
  const [lowStockItems, setLowStockItems] = React.useState<any[]>([]);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { user, logout } = useAuth();

  const navigation = [
    { nameKey: 'nav.dashboard', href: '/', icon: LayoutDashboard, adminOnly: true },
    { nameKey: 'nav.pos', href: '/pos', icon: ShoppingCart },
    { nameKey: 'nav.inventory', href: '/inventory', icon: Package, adminOnly: true },
    { nameKey: 'nav.products', href: '/products', icon: IceCream, adminOnly: true },
    { nameKey: 'nav.suppliers', href: '/suppliers', icon: Users, adminOnly: true },
    { nameKey: 'nav.hr', href: '/hr', icon: Briefcase, adminOnly: true },
    { nameKey: 'nav.reports', href: '/reports', icon: BarChart3 },
    { nameKey: 'nav.settings', href: '/settings', icon: User },
  ].filter(item => !item.adminOnly || user?.role === 'admin');

  const mobileNavigation = [
    { nameKey: 'nav.dashboard', href: '/', icon: LayoutDashboard, adminOnly: true },
    { nameKey: 'nav.pos', href: '/pos', icon: ShoppingCart },
    { nameKey: 'nav.inventory', href: '/inventory', icon: Package, adminOnly: true },
    { nameKey: 'nav.reports', href: '/reports', icon: BarChart3 },
    { nameKey: 'nav.settings', href: '/settings', icon: User },
  ].filter(item => !item.adminOnly || user?.role === 'admin');

  React.useEffect(() => {
    fetchLowStock();

    // Subscribe to real-time inventory changes (e.g., from sales deductions)
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'inventory'
        },
        () => {
          // Refetch low stock items whenever inventory changes
          fetchLowStock();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Click away listener for notifications
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showNotifications]);

  const fetchLowStock = async () => {
    const { data } = await supabase
      .from('low_stock_view')
      .select('*');

    if (data) {
      setLowStockItems(data);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 flex">
      {/* Sidebar Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 lg:hidden transition-opacity animate-in fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={cn(
        "fixed inset-y-0 left-0 z-[70] w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:flex-shrink-0 flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between pt-[env(safe-area-inset-top,0px)] h-[calc(4rem+env(safe-area-inset-top,0px))] px-6 border-b border-gray-200 dark:border-gray-700">
          <Link
            to="/"
            className="text-xl font-bold text-indigo-600 dark:text-indigo-400 hover:opacity-80 transition-opacity"
            onClick={() => setSidebarOpen(false)}
          >
            Gelato ERP
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden" title="Bağla">
            <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto min-h-0">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-colors",
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                )}
              >
                <item.icon className={cn("w-5 h-5 mr-3", isActive ? "text-indigo-700 dark:text-indigo-400" : "text-gray-400 dark:text-gray-500")} />
                {t(item.nameKey)}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-auto">
          <div className="flex items-center space-x-3 mb-4 px-2">
            <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm uppercase shadow-sm">
              {user?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{user?.name}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-black">{user?.role === 'admin' ? 'Admin' : 'İşçi'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center px-4 py-2.5 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all duration-200 group"
          >
            <LogOut className="w-5 h-5 mr-3 group-hover:-translate-x-1 transition-transform" />
            Çıxış
          </button>
          <div className="h-4" /> {/* Extra spacing at bottom */}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-[60] backdrop-blur-md bg-white/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 pt-[env(safe-area-inset-top,0px)] h-[calc(4rem+env(safe-area-inset-top,0px))] flex items-center justify-between px-4 sm:px-6 lg:px-8 transition-colors duration-200">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden" title="Menyu">
            <Menu className="w-6 h-6 text-gray-500 dark:text-gray-400" />
          </button>
          <div className="flex items-center space-x-4 ml-auto">
            <button
              onClick={() => setLanguage(language === 'az' ? 'en' : 'az')}
              className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors flex items-center"
              title={language === 'az' ? 'Switch to English' : 'Azərbaycanca'}
            >
              <Globe className="w-5 h-5 mr-1" />
              <span className="text-sm font-medium uppercase">{language}</span>
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                title="Bildirişlər"
              >
                <Bell className="w-5 h-5" />
                {lowStockItems.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-800 animate-pulse"></span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex justify-between items-center">
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">Bildirişlər</h3>
                    <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-black uppercase">
                      {lowStockItems.length} KRİTİK
                    </span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {lowStockItems.length === 0 ? (
                      <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm italic">
                        Yeni bildiriş yoxdur
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {lowStockItems.map((item, idx) => (
                          <div key={idx} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                            <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">{item.name}</p>
                            <div className="text-xs text-red-600 dark:text-red-400 flex justify-between">
                              <span>Mövcud: {item.stock_quantity} {item.unit}</span>
                              <span className="font-medium opacity-60">Limit: {item.critical_limit} {item.unit}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
          <PullToRefresh 
            onRefresh={async () => {
              window.location.reload();
            }}
            className="p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8"
          >
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </PullToRefresh>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 pb-[env(safe-area-inset-bottom,0px)] h-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
        <nav className="flex justify-between items-center px-2 py-2 overflow-x-auto no-scrollbar">
          {mobileNavigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex flex-col items-center justify-center min-w-[64px] p-2 rounded-xl transition-colors",
                  isActive
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                )}
              >
                <div className={cn(
                  "p-1 rounded-full mb-1",
                  isActive ? "bg-indigo-50 dark:bg-indigo-500/10" : ""
                )}>
                  <item.icon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-medium text-center truncate w-full px-1">{t(item.nameKey)}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
