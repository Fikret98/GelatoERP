import React, { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'motion/react';
import { IceCream } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}

// Dondurma üzərinə səpilən rəngli karamellər (Sprinkles) üçün
const SPRINKLES = Array.from({ length: 12 });
const SPRINKLE_COLORS = ['bg-pink-300', 'bg-cyan-300', 'bg-yellow-300', 'bg-green-300', 'bg-white'];

export default function GelatoPullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const hasVibrated = useRef(false);
  const PULL_THRESHOLD = 140; 
  
  const y = useMotionValue(0);
  
  // Arxa fon və ümumi ölçülər (Çiyələkli dondurma rənglərinə uyğun)
  const headerHeight = useTransform(y, [0, PULL_THRESHOLD], [0, 180]);
  const headerOpacity = useTransform(y, [0, PULL_THRESHOLD / 2, PULL_THRESHOLD], [0, 0.7, 1]);
  
  // Dondurma ikonunun hərəkətləri
  const iconScale = useTransform(y, [0, PULL_THRESHOLD], [0.2, 1.2]);
  const iconY = useTransform(y, [0, PULL_THRESHOLD], [-40, 0]);
  const textOpacity = useTransform(y, [PULL_THRESHOLD * 0.6, PULL_THRESHOLD], [0, 1]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Use a small buffer to ensure we are really at the top
      if (el.scrollTop <= 2) {
        startY.current = e.touches[0].pageY;
      } else {
        startY.current = -1;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // If user starts moving while not at top, ensure we stay disabled
      if (el.scrollTop > 2) {
        startY.current = -1;
      }
      
      if (startY.current === -1 || isRefreshing) return;

      const currentY = e.touches[0].pageY;
      const diff = currentY - startY.current;

      if (diff > 0 && el.scrollTop <= 0) {
        if (e.cancelable) e.preventDefault();
        
        const distance = Math.min(diff * 0.5, PULL_THRESHOLD * 1.2);
        setPullDistance(distance);
        y.set(distance);

        // İstifadəçiyə hiss etdirmək üçün kiçik vibrasiyalar (Haptic feedback)
        if (distance >= PULL_THRESHOLD && !hasVibrated.current) {
          if (window.navigator?.vibrate) window.navigator.vibrate([15, 40, 15]);
          hasVibrated.current = true;
        } else if (distance < PULL_THRESHOLD) {
          hasVibrated.current = false;
        }
      } else if (diff < 0) {
        startY.current = -1;
        y.set(0);
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (startY.current === -1 || isRefreshing) return;

      if (pullDistance >= PULL_THRESHOLD) {
        setIsRefreshing(true);
        y.set(PULL_THRESHOLD);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
          y.set(0);
          setPullDistance(0);
          hasVibrated.current = false;
        }
      } else {
        y.set(0);
        setPullDistance(0);
      }
      startY.current = -1;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onRefresh, isRefreshing, pullDistance, y]);

  return (
    <div 
      ref={containerRef} 
      className={`relative h-full overflow-y-auto overflow-x-hidden ${className || ''}`}
      style={{ isolation: 'isolate', WebkitOverflowScrolling: 'touch' }}
    >
      {/* Şirin Dondurma Mövzulu Arxa Fon */}
      <motion.div
        style={{ 
          height: isRefreshing ? 180 : headerHeight,
          opacity: headerOpacity
        }}
        className="absolute top-0 left-0 right-0 bg-gradient-to-b from-rose-400 to-pink-500 z-[0] overflow-hidden"
      >
        {/* Yumşaq dalğalı alt kənar effekti */}
        <div 
          className="absolute bottom-[-30px] left-[-10%] right-[-10%] h-16 bg-pink-500 rounded-[50%] opacity-80"
        />

        {/* Yağan Rəngli Karamellər (Sprinkles) */}
        <AnimatePresence>
          {(pullDistance > 20 || isRefreshing) && SPRINKLES.map((_, i) => {
            const randomColor = SPRINKLE_COLORS[i % SPRINKLE_COLORS.length];
            return (
              <motion.div
                key={i}
                initial={{ y: -50, x: `${5 + (i * 8)}%`, opacity: 0, rotate: i * 45 }}
                animate={isRefreshing ? {
                  y: [0, 250],
                  opacity: [0, 1, 0],
                  rotate: [i * 45, i * 45 + 180],
                } : {
                  y: (pullDistance / PULL_THRESHOLD) * (100 + (i % 3) * 20),
                  opacity: (pullDistance / PULL_THRESHOLD) * 0.8,
                }}
                transition={isRefreshing ? {
                  duration: 1 + Math.random() * 0.5,
                  repeat: Infinity,
                  ease: "linear",
                  delay: Math.random() * 0.5
                } : { duration: 0 }}
                className={`absolute pointer-events-none w-1.5 h-4 rounded-full ${randomColor}`}
              />
            );
          })}
        </AnimatePresence>

        {/* Mərkəzi Dondurma Animasiyası */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <motion.div
            style={{ scale: isRefreshing ? 1.2 : iconScale, y: isRefreshing ? 0 : iconY }}
            animate={isRefreshing ? {
              rotate: [-10, 10, -10],
              y: [-5, 5, -5]
            } : { rotate: 0 }}
            transition={isRefreshing ? {
              repeat: Infinity,
              duration: 0.8,
              ease: "easeInOut"
            } : { duration: 0 }}
            className="relative"
          >
            <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full shadow-xl border-2 border-white/40 flex items-center justify-center">
              <IceCream className="w-10 h-10 text-white drop-shadow-md" strokeWidth={2.5} />
            </div>
            
            {/* Yenilənmə zamanı arxada parlayan halə */}
            {isRefreshing && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1.6, opacity: [0, 0.5, 0] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                className="absolute inset-0 bg-white rounded-full blur-md -z-10"
              />
            )}
          </motion.div>

          <motion.p
            style={{ opacity: isRefreshing ? 1 : textOpacity }}
            className="text-white font-bold text-sm tracking-wider mt-4 drop-shadow-md font-sans"
          >
            {isRefreshing ? 'TƏZƏ GELATO YÜKLƏNİR...' : 'SƏRİNLƏMƏK ÜÇÜN DARTIN'}
          </motion.p>
        </div>
      </motion.div>

      {/* Əsas Kontent Area */}
      <motion.div 
        style={{ y: isRefreshing ? 180 : y }}
        className="relative z-[1] h-full bg-gray-50 dark:bg-gray-900 rounded-t-3xl shadow-[0_-10px_20px_rgba(0,0,0,0.05)]"
      >
        {children}
      </motion.div>
    </div>
  );
}
