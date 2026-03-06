import React from 'react';
import { motion } from 'motion/react';
import { IceCream } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function SplashScreen() {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-[100] bg-indigo-600 flex flex-col items-center justify-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ 
          duration: 0.8, 
          ease: "easeOut",
          type: "spring",
          bounce: 0.5
        }}
        className="bg-white p-6 rounded-3xl shadow-2xl mb-6"
      >
        <IceCream className="w-20 h-20 text-indigo-600" />
      </motion.div>
      
      <motion.h1 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-4xl font-black text-white tracking-tight"
      >
        Gelato ERP
      </motion.h1>
      
      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="text-indigo-200 mt-2 font-medium"
      >
        {t('splash.loading')}
      </motion.p>

      <motion.div 
        className="mt-12 w-48 h-1.5 bg-indigo-800/50 rounded-full overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        <motion.div 
          className="h-full bg-white rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ delay: 0.8, duration: 1.5, ease: "easeInOut" }}
        />
      </motion.div>
    </div>
  );
}
