import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useMotionValue, useSpring, useTransform } from 'motion/react';
import { Coins, DollarSign, TrendingUp, ArrowDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const threshold = 120;
  const maxPull = 180;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Check if we are at the top and the container is scrollable
      if (window.scrollY === 0) {
        startY.current = e.touches[0].pageY;
        setIsPulling(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || isRefreshing) return;

      const currentY = e.touches[0].pageY;
      const diff = currentY - startY.current;

      if (diff > 0 && window.scrollY === 0) {
        // Apply resistance
        const newDistance = Math.min(diff * 0.4, maxPull);
        setPullDistance(newDistance);

        // Prevent default only when pulling down at the top
        if (newDistance > 5 && e.cancelable) {
          e.preventDefault();
        }
      } else {
        setIsPulling(false);
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling) return;

      if (pullDistance >= threshold) {
        setIsRefreshing(true);
        setPullDistance(80); // Snap to loading position

        try {
          await onRefresh();
        } finally {
          // The page reload usually handles this, but for safety:
          setTimeout(() => {
            setIsRefreshing(false);
            setIsPulling(false);
            setPullDistance(0);
          }, 1000);
        }
      } else {
        setIsPulling(false);
        setPullDistance(0);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isPulling, isRefreshing, pullDistance, onRefresh]);

  return (
    <div ref={containerRef} className="relative flex-1 flex flex-col min-h-0 min-w-0">
      {/* Animation Area */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center overflow-hidden pointer-events-none"
        style={{ height: pullDistance }}
      >
        <AnimatePresence>
          {pullDistance > 10 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="relative w-full h-full flex items-center justify-center"
            >
              {/* Background Glass Plate */}
              <div className="absolute inset-x-8 top-4 bottom-4 bg-indigo-500/10 dark:bg-indigo-400/5 backdrop-blur-md rounded-3xl border border-indigo-500/20 dark:border-indigo-400/10 flex items-center justify-center">

                {/* Visual Indicators */}
                {!isRefreshing ? (
                  <div className="flex flex-col items-center">
                    <motion.div
                      style={{
                        rotate: pullDistance >= threshold ? 180 : 0,
                        color: pullDistance >= threshold ? '#10b981' : '#6366f1'
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <ArrowDown className="w-8 h-8" />
                    </motion.div>
                    <p className={cn(
                      "text-[10px] font-black uppercase tracking-widest mt-2",
                      pullDistance >= threshold ? "text-emerald-600 dark:text-emerald-400" : "text-indigo-600 dark:text-indigo-400"
                    )}>
                      {pullDistance >= threshold ? 'Yeniləmək üçün burax' : 'Yeniləmək üçün dart'}
                    </p>
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center">
                    {/* Professional Coin Animation */}
                    <div className="relative w-16 h-16 flex items-center justify-center">
                      <motion.div
                        animate={{
                          scale: [1, 1.2, 1],
                          rotate: [0, 360]
                        }}
                        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                        className="p-3 bg-indigo-600 text-white rounded-2xl shadow-xl z-10"
                      >
                        <TrendingUp className="w-8 h-8" />
                      </motion.div>

                      {/* Falling Coins */}
                      {[...Array(6)].map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ y: -40, opacity: 0, x: (i - 2.5) * 15 }}
                          animate={{
                            y: [null, 40],
                            opacity: [0, 1, 0],
                          }}
                          transition={{
                            repeat: Infinity,
                            duration: 1.5,
                            delay: i * 0.2,
                            ease: "easeIn"
                          }}
                          className="absolute text-emerald-500"
                        >
                          {i % 2 === 0 ? <Coins className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}
                        </motion.div>
                      ))}
                    </div>
                    <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mt-3 animate-pulse">
                      Məlumatlar Yenilənir...
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content Wrapper */}
      <motion.div
        style={{ y: pullDistance === 0 ? undefined : pullDistance }}
        transition={isPulling ? { type: "just" } : { type: "spring", stiffness: 400, damping: 30 }}
        className="w-full h-full bg-gray-50 dark:bg-gray-900 flex flex-col min-h-0 min-w-0"
      >
        {children}
      </motion.div>
    </div>
  );
}
