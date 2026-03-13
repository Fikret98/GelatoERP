import React, { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'motion/react';
import { Coins, TrendingUp, Landmark } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}

const COIN_COUNT = 8;
const COINS = Array.from({ length: COIN_COUNT });

export default function FinancialPullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const hasVibrated = useRef(false);
  const PULL_THRESHOLD = 120;
  
  const y = useMotionValue(0);
  
  // Animation Transforms
  const headerHeight = useTransform(y, [0, PULL_THRESHOLD], [0, 160]);
  const headerOpacity = useTransform(y, [0, PULL_THRESHOLD / 2, PULL_THRESHOLD], [0, 0.5, 1]);
  const iconScale = useTransform(y, [0, PULL_THRESHOLD], [0.5, 1]);
  const iconRotate = useTransform(y, [0, PULL_THRESHOLD], [0, 360]);
  const textOpacity = useTransform(y, [PULL_THRESHOLD * 0.5, PULL_THRESHOLD * 0.8], [0, 1]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Use a strict buffer for top detection
      if (el.scrollTop <= 1) {
        startY.current = e.touches[0].pageY;
      } else {
        startY.current = -1;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startY.current === -1 || isRefreshing) return;

      const currentY = e.touches[0].pageY;
      const diff = currentY - startY.current;

      // Only capture downward pull if exactly at top
      if (diff > 0 && el.scrollTop <= 0) {
        if (e.cancelable) e.preventDefault();
        
        // Resistance factor for smoother pull
        const distance = Math.min(diff * 0.45, PULL_THRESHOLD * 1.5);
        setPullDistance(distance);
        y.set(distance);

        // Haptic feedback
        if (distance >= PULL_THRESHOLD && !hasVibrated.current) {
          if (window.navigator?.vibrate) window.navigator.vibrate(10);
          hasVibrated.current = true;
        } else if (distance < PULL_THRESHOLD) {
          hasVibrated.current = false;
        }
      } else if (diff < 0) {
        // Reset if pulling up
        startY.current = -1;
        y.set(0);
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (startY.current === -1 || isRefreshing) {
        startY.current = -1;
        return;
      }

      const finalDistance = pullDistance;
      if (finalDistance >= PULL_THRESHOLD) {
        setIsRefreshing(true);
        y.set(PULL_THRESHOLD);
        try {
          await onRefresh();
        } finally {
          // Cleanup
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
      style={{ 
        isolation: 'isolate',
        overscrollBehaviorY: 'contain',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      {/* Financial Background Header */}
      <motion.div
        style={{ 
          height: isRefreshing ? 140 : headerHeight,
          opacity: headerOpacity
        }}
        className="absolute top-0 left-0 right-0 bg-gradient-to-b from-indigo-600 to-indigo-800 z-[0] overflow-hidden flex items-center justify-center"
      >
        {/* Decorative Grid Patterns */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />
        
        {/* Falling Coins Animation */}
        <AnimatePresence>
          {(pullDistance > 10 || isRefreshing) && COINS.map((_, i) => (
            <motion.div
              key={i}
              initial={{ y: -60, x: `${(i + 1) * (100 / (COIN_COUNT + 1))}%`, scale: 0, opacity: 0 }}
              animate={isRefreshing ? {
                y: [0, 200],
                opacity: [0, 1, 0],
                rotate: [0, 360],
                scale: [0.5, 0.8, 0.5]
              } : {
                y: (pullDistance / PULL_THRESHOLD) * (80 + (i % 4) * 15),
                scale: (pullDistance / PULL_THRESHOLD) * 0.8,
                opacity: (pullDistance / PULL_THRESHOLD) * 0.6,
                rotate: (pullDistance / PULL_THRESHOLD) * 180
              }}
              transition={isRefreshing ? {
                duration: 1.2 + (i % 3) * 0.2,
                repeat: Infinity,
                ease: "linear",
                delay: i * 0.1
              } : { duration: 0 }}
              className="absolute text-yellow-400/80 pointer-events-none"
            >
              <Coins className="w-5 h-5 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]" />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Central Refresh Icon Shell */}
        <div className="relative z-10 flex flex-col items-center">
          <motion.div
            style={{ 
              scale: isRefreshing ? 1.1 : iconScale, 
              rotate: isRefreshing ? 0 : iconRotate 
            }}
            animate={isRefreshing ? {
              scale: [1, 1.15, 1],
              rotate: [0, 10, -10, 0]
            } : {}}
            transition={isRefreshing ? {
              repeat: Infinity,
              duration: 1.5,
              ease: "easeInOut"
            } : { duration: 0 }}
            className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 flex items-center justify-center shadow-xl"
          >
            {isRefreshing ? (
              <TrendingUp className="w-8 h-8 text-white animate-pulse" />
            ) : (
              <Landmark className="w-8 h-8 text-white" />
            )}
          </motion.div>
          
          <motion.p
            style={{ opacity: isRefreshing ? 1 : textOpacity }}
            className="text-white/90 font-black text-[10px] uppercase tracking-[0.2em] mt-4 drop-shadow-sm"
          >
            {isRefreshing ? 'Məlumatlar Yenilənir...' : 'Yeniləmək üçün dartın'}
          </motion.p>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <motion.div 
        style={{ y: isRefreshing ? 140 : y }}
        className="relative z-[1] h-full bg-gray-50 dark:bg-gray-900 rounded-t-3xl shadow-[0_-12px_24px_rgba(0,0,0,0.06)]"
      >
        {children}
      </motion.div>
    </div>
  );
}
