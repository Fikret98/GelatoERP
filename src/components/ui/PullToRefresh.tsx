import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useAnimation, useMotionValue, useTransform } from 'motion/react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const PULL_THRESHOLD = 80;
  
  const y = useMotionValue(0);
  const rotate = useTransform(y, [0, PULL_THRESHOLD], [0, 360]);
  const opacity = useTransform(y, [0, PULL_THRESHOLD], [0, 1]);
  const scale = useTransform(y, [0, PULL_THRESHOLD], [0.5, 1.2]);

  const handleTouchStart = (e: TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].pageY;
    } else {
      startY.current = -1;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (startY.current === -1 || isRefreshing) return;

    const currentY = e.touches[0].pageY;
    const diff = currentY - startY.current;

    if (diff > 0 && window.scrollY === 0) {
      // Resistance effect
      const distance = Math.min(diff * 0.4, PULL_THRESHOLD * 1.5);
      setPullDistance(distance);
      y.set(distance);
      
      if (diff > 10) {
        if (e.cancelable) e.preventDefault();
      }
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
      }
    } else {
      y.set(0);
      setPullDistance(0);
    }
    startY.current = -1;
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, isRefreshing]);

  return (
    <div ref={containerRef} className="relative min-h-full">
      <motion.div
        style={{ y, opacity, scale }}
        className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      >
        <div className="bg-white dark:bg-gray-800 rounded-full p-3 shadow-xl border border-indigo-100 dark:border-gray-700 flex items-center justify-center">
          {isRefreshing ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="relative w-8 h-8 flex items-center justify-center"
            >
              {/* Ice cream churn animation */}
              <motion.div 
                className="absolute inset-0 border-4 border-indigo-200 dark:border-indigo-900 rounded-full"
              />
              <motion.div 
                className="absolute inset-0 border-t-4 border-indigo-600 rounded-full"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut" }}
              />
              <RefreshCw className="w-4 h-4 text-indigo-600" />
            </motion.div>
          ) : (
            <motion.div style={{ rotate }}>
              <RefreshCw className={`w-6 h-6 ${pullDistance >= PULL_THRESHOLD ? 'text-indigo-600' : 'text-gray-400'}`} />
            </motion.div>
          )}
        </div>
        {pullDistance >= PULL_THRESHOLD && !isRefreshing && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-2 text-center"
          >
            Yenilə
          </motion.div>
        )}
      </motion.div>

      <motion.div style={{ y: isRefreshing ? PULL_THRESHOLD : y }}>
        {children}
      </motion.div>
    </div>
  );
}
