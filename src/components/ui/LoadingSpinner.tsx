import React from 'react';
import { motion } from 'motion/react';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 select-none">
      {/* Cocktail Shaker */}
      <motion.div
        animate={{ rotate: [-18, 18, -18] }}
        transition={{ duration: 0.45, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originY: 0.85 }}
        className="relative"
      >
        <svg
          width="80"
          height="130"
          viewBox="0 0 80 130"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Lid / Cap */}
          <rect x="22" y="0" width="36" height="14" rx="6" fill="#4f46e5" />
          <rect x="26" y="13" width="28" height="6" rx="3" fill="#4338ca" />

          {/* Shaker body */}
          <path
            d="M14 22 Q12 80 18 120 Q22 128 40 128 Q58 128 62 120 Q68 80 66 22 Z"
            fill="url(#bodyGrad)"
          />

          {/* Shine */}
          <path
            d="M22 28 Q20 70 23 108"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.25"
          />

          {/* Separator bar between lid and body */}
          <rect x="14" y="20" width="52" height="7" rx="3.5" fill="#6366f1" />

          {/* Liquid inside (visible through body) */}
          <clipPath id="bodyClip">
            <path d="M16 29 Q14 80 19 119 Q23 127 40 127 Q57 127 61 119 Q66 80 64 29 Z" />
          </clipPath>
          <motion.rect
            x="0"
            y="70"
            width="80"
            height="60"
            fill="url(#liquidGrad)"
            clipPath="url(#bodyClip)"
            animate={{ y: [65, 60, 65] }}
            transition={{ duration: 0.45, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Bubbles inside */}
          {[
            { cx: 34, cy: 90, r: 3, delay: 0 },
            { cx: 48, cy: 100, r: 2, delay: 0.15 },
            { cx: 28, cy: 105, r: 2.5, delay: 0.3 },
          ].map((b, i) => (
            <motion.circle
              key={i}
              cx={b.cx}
              r={b.r}
              fill="white"
              opacity={0.35}
              initial={{ cy: b.cy }}
              animate={{ cy: [b.cy, b.cy - 18, b.cy], opacity: [0.4, 0, 0.4] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: b.delay,
              }}
            />
          ))}

          <defs>
            <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#c7d2fe" />
              <stop offset="50%" stopColor="#e0e7ff" />
              <stop offset="100%" stopColor="#a5b4fc" />
            </linearGradient>
            <linearGradient id="liquidGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.9" />
            </linearGradient>
          </defs>
        </svg>

        {/* Small splash droplets */}
        {[
          { x: -22, y: 20, delay: 0, rotate: -30 },
          { x: 24, y: 16, delay: 0.22, rotate: 25 },
        ].map((d, i) => (
          <motion.div
            key={i}
            className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-indigo-400"
            style={{ x: d.x, y: d.y, rotate: d.rotate }}
            animate={{ opacity: [0, 0.8, 0], scale: [0.5, 1, 0.5] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: d.delay,
            }}
          />
        ))}
      </motion.div>

      {/* Dots + Message */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400"
              animate={{ opacity: [0.2, 1, 0.2], y: [0, -4, 0] }}
              transition={{
                duration: 0.7,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.15,
              }}
            />
          ))}
        </div>
        {message && (
          <motion.p
            className="text-sm font-medium text-gray-400 dark:text-gray-500 tracking-wide"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            {message}
          </motion.p>
        )}
      </div>
    </div>
  );
}
