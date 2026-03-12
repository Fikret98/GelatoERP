import React, { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'motion/react';
import { ShoppingBag, DollarSign } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}

const MONEY_PARTICLES = Array.from({ length: 6 });

export default function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const hasVibrated = useRef(false);
  const PULL_THRESHOLD = 140; // Increased threshold for the larger animation
  
  const y = useMotionValue(0);
  
  // Header background transforms
  const headerHeight = useTransform(y, [0, PULL_THRESHOLD], [0, 180]);
  const headerOpacity = useTransform(y, [0, PULL_THRESHOLD / 2, PULL_THRESHOLD], [0, 0.5, 1]);
  
  // Icon/Animation items transforms
  const bagScale = useTransform(y, [0, PULL_THRESHOLD], [0.4, 1.1]);
  const bagY = useTransform(y, [0, PULL_THRESHOLD], [-20, 0]);
  const textOpacity = useTransform(y, [PULL_THRESHOLD * 0.7, PULL_THRESHOLD], [0, 1]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
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

      if (diff > 0 && el.scrollTop <= 0) {
        if (e.cancelable) e.preventDefault();
        
        const distance = Math.min(diff * 0.5, PULL_THRESHOLD * 1.2);
        setPullDistance(distance);
        y.set(distance);

        if (distance >= PULL_THRESHOLD && !hasVibrated.current) {
          if (window.navigator?.vibrate) window.navigator.vibrate([10, 30, 10]);
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
      {/* Creative Background Header */}
      <motion.div
        style={{ 
          height: isRefreshing ? 180 : headerHeight,
          opacity: headerOpacity
        }}
        className="absolute top-0 left-0 right-0 bg-indigo-600 z-[0] overflow-hidden"
      >
        {/* Curved bottom edge */}
        <div 
          className="absolute bottom-[-40px] left-[-25%] right-[-25%] h-20 bg-indigo-600 rounded-[50%]"
        />

        {/* Falling Currency Particles */}
        <AnimatePresence>
          {(pullDistance > 20 || isRefreshing) && MONEY_PARTICLES.map((_, i) => (
            <motion.div
              key={i}
              initial={{ y: -50, x: `${10 + (i * 15)}%`, opacity: 0, rotate: 0 }}
              animate={isRefreshing ? {
                y: [0, 200],
                opacity: [0, 1, 0],
                rotate: [0, 360],
              } : {
                y: (pullDistance / PULL_THRESHOLD) * 100,
                opacity: (pullDistance / PULL_THRESHOLD) * 0.6,
                rotate: (pullDistance / PULL_THRESHOLD) * 180,
              }}
              transition={isRefreshing ? {
                duration: 1.5 + Math.random(),
                repeat: Infinity,
                ease: "linear",
                delay: i * 0.2
              } : { duration: 0 }}
              className="absolute pointer-events-none"
            >
              <DollarSign className="w-5 h-5 text-indigo-300/50" />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Central Money Bag Animation */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <motion.div
            style={{ scale: isRefreshing ? 1.1 : bagScale, y: isRefreshing ? 0 : bagY }}
            animate={isRefreshing ? {
              rotate: [-5, 5, -5],
              scale: [1, 1.1, 1]
            } : { rotate: 0 }}
            transition={isRefreshing ? {
              repeat: Infinity,
              duration: 0.5,
              ease: "easeInOut"
            } : { duration: 0 }}
            className="relative"
          >
            <div className="w-20 h-20 bg-indigo-500 rounded-3xl shadow-2xl border-4 border-indigo-400 flex items-center justify-center">
              <ShoppingBag className="w-10 h-10 text-white fill-white/20" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-1">
                <span className="text-2xl font-black text-indigo-100">$</span>
              </div>
            </div>
            
            {/* Pulsing light effect */}
            {isRefreshing && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1.5, opacity: [0, 0.4, 0] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="absolute inset-0 bg-white rounded-full blur-xl"
              />
            )}
          </motion.div>

          <motion.p
            style={{ opacity: isRefreshing ? 1 : textOpacity }}
            className="text-white font-black text-xs uppercase tracking-[0.2em] mt-3 drop-shadow-md"
          >
            {isRefreshing ? 'Gözləyin...' : 'Yeniləmək üçün dartın'}
          </motion.p>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <motion.div 
        style={{ y: isRefreshing ? 180 : y }}
        className="relative z-[1] h-full bg-gray-50 dark:bg-gray-900"
      >
        {/* Subtle top shadow when pulling */}
        <motion.div 
          style={{ opacity: headerOpacity }}
          className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-black/5 to-transparent pointer-events-none"
        />
        {children}
      </motion.div>
    </div>
  );
}
