import React from 'react';
import { motion } from 'motion/react';
import { IceCream } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  const { t } = useLanguage();
  
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      <motion.div
        animate={{ 
          y: [-10, 0, -10],
          scale: [1, 1.05, 1]
        }}
        transition={{ 
          duration: 1.5, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center shadow-inner"
      >
        <IceCream className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
      </motion.div>
      <motion.p
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        className="text-sm font-medium text-gray-500 dark:text-gray-400"
      >
        {message || t('common.loading') || 'Yüklənir...'}
      </motion.p>
    </div>
  );
}
