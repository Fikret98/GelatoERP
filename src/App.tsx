/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ShiftProvider } from './contexts/ShiftContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import SplashScreen from './components/SplashScreen';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Suppliers from './pages/Suppliers';
import Products from './pages/Products';
import POS from './pages/POS';
import HR from './pages/HR';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import FixedAssets from './pages/FixedAssets';
import { Navigate } from 'react-router-dom';

function AnimatedRoutes() {
  const location = useLocation();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';

  return (
    <AnimatePresence mode="wait">
      {/* @ts-ignore */}
      <Routes>
        {/* Admin only routes */}
        <Route path="/" element={isAdmin ? <Dashboard /> : <Navigate to="/pos" replace />} />
        <Route path="/inventory" element={isAdmin ? <Inventory /> : <Navigate to="/pos" replace />} />
        <Route path="/suppliers" element={isAdmin ? <Suppliers /> : <Navigate to="/pos" replace />} />
        <Route path="/products" element={isAdmin ? <Products /> : <Navigate to="/pos" replace />} />
        <Route path="/hr" element={isAdmin ? <HR /> : <Navigate to="/pos" replace />} />
        <Route path="/assets" element={isAdmin ? <FixedAssets /> : <Navigate to="/pos" replace />} />

        {/* Common routes (Admin & Employee) */}
        <Route path="/pos" element={<POS />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function MainContent() {
  const [showSplash, setShowSplash] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  if (!user) {
    return <Login />;
  }

  return showSplash ? (
    <SplashScreen />
  ) : (
    <Layout>
      <AnimatedRoutes />
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
            <ShiftProvider>
              <Router>
                <MainContent />
              </Router>
            </ShiftProvider>
          <Toaster 
            position="bottom-center" // Mobile-friendly position
            gutter={8}
            toastOptions={{
              className: 'dark:bg-gray-800 dark:text-white border border-gray-100 dark:border-gray-700 rounded-2xl shadow-xl text-sm font-medium',
              duration: 2500,
              style: {
                maxWidth: '90vw',
                margin: '0 auto 1rem',
              }
            }}
            containerStyle={{
              bottom: 'calc(env(safe-area-inset-bottom) + 5rem)', // Stay above mobile nav
            }}
          />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

