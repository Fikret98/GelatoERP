import React, { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}

export default function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const hasVibrated = useRef(false);
  const PULL_THRESHOLD = 80;
  
  const y = useMotionValue(0);
  const rotate = useTransform(y, [0, PULL_THRESHOLD], [0, 360]);
  const opacity = useTransform(y, [0, PULL_THRESHOLD], [0, 1]);
  const scale = useTransform(y, [0, PULL_THRESHOLD], [0.5, 1.2]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      // If we are at the top, start tracking
      if (el.scrollTop <= 0) {
        startY.current = e.touches[0].pageY;
      } else {
        startY.current = -1;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startY.current === -1 || isRefreshing) return;

      const currentY = e.touches[0].pageY;
      const diff = currentY - startY.current;

      // Only pull down
      if (diff > 0 && el.scrollTop <= 0) {
        // Prevent default only when we are actually pulling down at the top
        // This stops the browser's native overscroll/rubber-banding
        if (e.cancelable) e.preventDefault();
        
        const distance = Math.min(diff * 0.4, PULL_THRESHOLD * 1.5);
        setPullDistance(distance);
        y.set(distance);

        if (distance >= PULL_THRESHOLD && !hasVibrated.current) {
          if (window.navigator?.vibrate) window.navigator.vibrate(10);
          hasVibrated.current = true;
        } else if (distance < PULL_THRESHOLD) {
          hasVibrated.current = false;
        }
      } else if (diff < 0) {
          // If pulling up, stop tracking and reset
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
      <div className="sticky top-0 left-0 right-0 z-[100] h-0 flex justify-center pointer-events-none">
        <motion.div
          style={{ y, opacity, scale }}
          className="mt-4"
        >
          <div className="bg-white dark:bg-gray-800 rounded-full p-3 shadow-xl border border-indigo-100 dark:border-gray-700 flex items-center justify-center">
            {isRefreshing ? (
               <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="relative w-8 h-8 flex items-center justify-center"
              >
                <div className="absolute inset-0 border-4 border-indigo-100 dark:border-indigo-900 rounded-full" />
                <div className="absolute inset-0 border-t-4 border-indigo-600 rounded-full" />
                <RefreshCw className="w-4 h-4 text-indigo-600" />
              </motion.div>
            ) : (
              <motion.div style={{ rotate }}>
                <RefreshCw className={`w-6 h-6 ${pullDistance >= PULL_THRESHOLD ? 'text-indigo-600' : 'text-gray-400'}`} />
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      <motion.div 
        style={{ y: (isRefreshing && pullDistance >= PULL_THRESHOLD) ? PULL_THRESHOLD : y }}
        className="h-full"
      >
        {children}
      </motion.div>
    </div>
  );
}
