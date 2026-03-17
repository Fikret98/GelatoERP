import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
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
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import PullToRefresh from './ui/PullToRefresh';
import { cn } from '../lib/utils';
import NotificationCenter from './NotificationCenter';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { user, logout } = useAuth();

  const navigation = [
    { nameKey: 'nav.dashboard', href: '/', icon: LayoutDashboard, adminOnly: true },
    { nameKey: 'nav.pos', href: '/pos', icon: ShoppingCart },
    { nameKey: 'nav.inventory', href: '/inventory', icon: Package, adminOnly: true },
    { nameKey: 'nav.assets', href: '/assets', icon: Package, adminOnly: true },
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

  // Low stock check removed from here as it is now handled via real-time notifications table

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 flex">
      {/* Sidebar Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/50 lg:hidden transition-opacity animate-in fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={cn(
        "fixed inset-y-0 left-0 z-[80] w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:flex-shrink-0 flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] px-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <Link
            to="/"
            className="flex items-center gap-3 group transition-transform duration-300 hover:scale-105"
            onClick={() => setSidebarOpen(false)}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500 rounded-xl blur-md opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="relative w-10 h-10 bg-gradient-to-br from-indigo-600 via-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none group-hover:rotate-[-5deg] transition-transform duration-300">
                <IceCream className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black text-gray-900 dark:text-white leading-none tracking-tighter uppercase italic">
                Gelato
              </span>
              <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 leading-none tracking-widest mt-1 uppercase">
                ERP System
              </span>
            </div>
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
        <header className="sticky top-0 z-[60] backdrop-blur-md bg-white/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex items-center justify-between px-4 sm:px-6 lg:px-8 transition-colors duration-200">
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="lg:hidden p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition" 
            title="Menyu"
          >
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
            <NotificationCenter />
          </div>
        </header>
        <main className="flex-1 flex flex-col min-h-0 bg-gray-50 dark:bg-gray-900 transition-colors duration-200 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 text-gray-900 dark:text-white overflow-hidden">
          <PullToRefresh 
            onRefresh={async () => {
              window.location.reload();
            }}
          >
            <div className="max-w-[1700px] mx-auto w-full h-full flex flex-col min-h-0">
              {children}
            </div>
          </PullToRefresh>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[70] bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]">
        <nav className="flex justify-between items-center px-2 py-0 h-16 overflow-x-auto no-scrollbar">
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
