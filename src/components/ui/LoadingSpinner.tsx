import React from 'react';
import { motion } from 'motion/react';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6">
      {/* Rings */}
      <div className="relative w-20 h-20">
        {/* Outer spinning gradient ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, #6366f1, #8b5cf6, #06b6d4, #6366f1)',
            padding: '3px',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        >
          <div className="w-full h-full rounded-full bg-white dark:bg-gray-900" />
        </motion.div>

        {/* Middle pulsing ring */}
        <motion.div
          className="absolute inset-[6px] rounded-full border-2 border-indigo-300/40 dark:border-indigo-500/30"
          animate={{ scale: [1, 1.06, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Center dot */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/40" />
        </motion.div>
      </div>

      {/* Loading dots + message */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400"
              animate={{ opacity: [0.2, 1, 0.2], y: [0, -4, 0] }}
              transition={{
                duration: 0.8,
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
