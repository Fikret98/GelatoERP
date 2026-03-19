import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, X, Package, AlertTriangle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast, { useToasterStore } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import { useShift } from '../contexts/ShiftContext';
import { cn } from '../lib/utils';

export default function POS() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { activeShift, openShift, closeShift, getExpectedCash, getLastShiftClosingBalance, loading: shiftLoading } = useShift();
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<{ product: any, quantity: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('cash');
  const { toasts } = useToasterStore();

  // Limit toasts to max 2
  useEffect(() => {
    if (toasts.length > 2) {
      toast.dismiss(toasts[0].id);
    }
  }, [toasts]);
  
  // Shift Modals
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [openingBalance, setOpeningBalance] = useState<string>('');
  const [suggestedBalance, setSuggestedBalance] = useState<number>(0);
  const [closingActual, setClosingActual] = useState<string>('');
  const [closingExpected, setClosingExpected] = useState<number>(0);
  const [shiftNotes, setShiftNotes] = useState('');
  const [inventoryError, setInventoryError] = useState<{
    itemName: string;
    required: string;
    available: string;
  } | null>(null);

  // 1. Data Fetching & Utility Functions
  const fetchProducts = async () => {
    try {
      setIsLoadingPage(true);
      const { data, error } = await supabase
        .from('pos_products_view')
        .select('*');

      if (error) throw error;
      setProducts(data || []);
    } catch (e) {
      console.error(e);
      toast.error(t('pos.error'));
    } finally {
      setIsLoadingPage(false);
    }
  };

  const checkShiftStatus = async () => {
    const lastBalance = await getLastShiftClosingBalance();
    setSuggestedBalance(lastBalance);
    setOpeningBalance(lastBalance.toFixed(2));
  };

  const addToCart = (product: any) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
    toast.success(`${product.name}`, {
      icon: '🛒',
      position: 'bottom-center',
    });
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const newQuantity = item.quantity + delta;
        return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  // 2. Lifecycle Effects
  useEffect(() => {
    fetchProducts();
    checkShiftStatus();
  }, []);

  // Body scroll lock for all modals - CSS class approach is more reliable than style mutation
  // because the cleanup() runs guaranteed even on unmount (navigation away)
  useEffect(() => {
    const isModalOpen = showCartDrawer || showOpenModal || showCloseModal || !!inventoryError;
    if (isModalOpen) {
      document.documentElement.classList.add('scroll-locked');
    } else {
      document.documentElement.classList.remove('scroll-locked');
    }
    return () => {
      // This runs when navigating away - ensures lock is always released
      document.documentElement.classList.remove('scroll-locked');
    };
  }, [showCartDrawer, showOpenModal, showCloseModal, inventoryError]);


  // Clear errors on shift status change
  useEffect(() => {
    setInventoryError(null);
  }, [activeShift?.id]);

  // 3. Shift Management Functions

  const handleOpenShift = async () => {
    try {
      const balance = parseFloat(openingBalance);
      if (isNaN(balance)) {
        toast.error('Düzgün məbləğ daxil edin');
        return;
      }
      await openShift(balance);
      setShowOpenModal(false);
    } catch (e) {
      // Error handled in ShiftContext
    }
  };

  const handleCloseShift = async () => {
    try {
      const balance = parseFloat(closingActual);
      if (isNaN(balance)) {
        toast.error('Düzgün məbləğ daxil edin');
        return;
      }
      await closeShift(balance, shiftNotes);
      setShowCloseModal(false);
      setClosingActual('');
      setShiftNotes('');
    } catch (e) {
      // Error handled in ShiftContext
    }
  };

  const startClosingProcess = async () => {
    const expected = await getExpectedCash();
    setClosingExpected(expected);
    setClosingActual(''); // Bug 1 fix: do NOT auto-fill. Force cashier to manually count and enter.
    setShowCloseModal(true);
  };
  const handleCheckout = async () => {
    if (!activeShift) {
      toast.error('Zəhmət olmasa əvvəlcə növbəni açın!', { icon: '🔐' });
      setShowOpenModal(true);
      return;
    }
    if (cart.length === 0 || !user || loading) return;

    setLoading(true);
    try {
      const saleItems = cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        price: item.product.price
      }));

      const { error: rpcError } = await supabase.rpc('process_sale', {
        p_total_amount: total,
        p_items: saleItems,
        p_seller_id: parseInt(user.id),
        p_payment_method: paymentMethod,
        p_shift_id: activeShift.id
      });

      if (rpcError) throw rpcError;

      setCart([]);
      setPaymentMethod('cash');
      setShowCartDrawer(false); // Fix: Explicitly close cart to release scroll lock!
      toast.success(t('pos.success'));
    } catch (e: any) {
      console.error(e);
      
      // Check for inventory shortage error pattern
      const message = e.message || '';
      const inventoryMatch = message.match(/Anbar xətası: (.+) çatışmır \(Lazımdır: (.+), Mövcuddur: (.+)\)/);
      
      if (inventoryMatch) {
        setInventoryError({
          itemName: inventoryMatch[1],
          required: inventoryMatch[2],
          available: inventoryMatch[3]
        });
      } else {
        toast.error(t('pos.errorPrefix') + (message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col gap-6 min-h-0 relative"
    >
      {/* Shift Ribbon */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-3 h-3 rounded-full animate-pulse",
            activeShift ? "bg-green-500" : "bg-red-500"
          )} />
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
              Növbə: {activeShift ? 'AÇIQ' : 'BAĞLI'}
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              {activeShift ? `Başladı: ${new Date(activeShift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Növbəni açmağınız xahiş olunur'}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => activeShift ? startClosingProcess() : setShowOpenModal(true)}
          className={cn(
            "px-6 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 dark:shadow-none",
            activeShift 
              ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800 hover:bg-red-500 hover:text-white" 
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          )}
        >
          {activeShift ? 'Növbəni Təhvil Ver' : 'Növbəni Aç'}
        </button>
      </div>

      <AnimatePresence>
        {/* Open Shift Modal */}
        {showOpenModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
              onClick={() => !shiftLoading && setShowOpenModal(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-700 p-8"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl">
                  <Plus className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Növbəni Aç</h3>
                  <p className="text-sm text-gray-500">Kassa balansını təsdiqləyin</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-900/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Əvvəlki növbədən qalan (Gözlənilən)</p>
                  <p className="text-2xl font-black text-gray-900 dark:text-white">{suggestedBalance.toFixed(2)} ₼</p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Sizdə olan (Fiziki Məbləğ)</label>
                  <input
                    type="number"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-xl font-black text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-0 transition-colors"
                    placeholder="Məbləği daxil edin..."
                    autoFocus
                  />
                  {Math.abs(parseFloat(openingBalance || '0') - suggestedBalance) > 0.01 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-2 flex items-center gap-1">
                      <X className="w-3 h-3" /> Fərq: {(parseFloat(openingBalance || '0') - suggestedBalance).toFixed(2)} ₼ (Dispute yaradılacaq)
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowOpenModal(false)}
                    className="flex-1 py-4 rounded-2xl font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                  >
                    Ləğv et
                  </button>
                  <button
                    onClick={handleOpenShift}
                    disabled={shiftLoading || !openingBalance}
                    className="flex-2 py-4 rounded-2xl font-black bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {shiftLoading ? '...' : 'Növbəni Aç'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Handover Modal */}
        {showCloseModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
              onClick={() => !shiftLoading && setShowCloseModal(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-700 p-8"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-2xl">
                  <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Növbəni Təhvil Ver</h3>
                  <p className="text-sm text-gray-500">Günü yekunlaşdırın</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-900/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Gözlənilən</p>
                    <p className="text-lg font-black text-gray-900 dark:text-white">{closingExpected.toFixed(2)} ₼</p>
                  </div>
                  <div className={cn(
                    "p-4 rounded-2xl border flex flex-col justify-center",
                    Math.abs(parseFloat(closingActual || '0') - closingExpected) < 0.01 
                      ? "bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800"
                  )}>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Fərq</p>
                    <p className={cn(
                      "text-lg font-black",
                      Math.abs(parseFloat(closingActual || '0') - closingExpected) < 0.01 
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    )}>
                      {(parseFloat(closingActual || '0') - closingExpected).toFixed(2)} ₼
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Təhvil verilən real məbləğ</label>
                  <input
                    type="number"
                    value={closingActual}
                    onChange={(e) => setClosingActual(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-xl font-black text-gray-900 dark:text-white focus:border-red-500 focus:ring-0 transition-colors"
                    placeholder="Fiziki məbləği daxil edin..."
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Qeydlər</label>
                  <textarea
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-0 transition-colors"
                    rows={2}
                    placeholder="Varsa uyğunsuzluq səbəbini qeyd edin..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowCloseModal(false)}
                    className="flex-1 py-4 rounded-2xl font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                  >
                    Ləğv et
                  </button>
                  <button
                    onClick={handleCloseShift}
                    disabled={shiftLoading || !closingActual}
                    className="flex-2 py-4 rounded-2xl font-black bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {shiftLoading ? '...' : 'Təhvil Ver'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isLoadingPage ? (
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner message="Satış ekranı yüklənir..." />
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4 h-full min-h-0 lg:overflow-hidden px-4 sm:px-6 lg:px-8 pb-4 lg:pb-8 max-w-7xl mx-auto w-full">
          {/* Main Content: Products Grid */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-white dark:bg-gray-800/50 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm lg:overflow-hidden relative">
            <div className="p-5 flex items-center justify-between border-b border-gray-100/50 dark:border-gray-700/50 bg-white/50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('nav.pos')}</h1>
              </div>
              <div className="bg-white dark:bg-gray-700 px-3 py-1 rounded-full border border-gray-100 dark:border-gray-600 shadow-sm">
                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">
                  {products.length} Məhsul
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 custom-scrollbar">
              <motion.div 
                variants={{
                  hidden: { opacity: 0 },
                  show: {
                    opacity: 1,
                    transition: { staggerChildren: 0.04 }
                  }
                }}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 pb-8"
              >
                {products.length === 0 ? (
                  <div className="col-span-full py-20 text-center">
                    <Package className="w-16 h-16 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
                    <p className="text-gray-400 font-bold italic">Məhsul tapılmadı.</p>
                  </div>
                ) : (
                  products.map(product => (
                    <motion.button
                      key={product.id}
                      variants={{
                        hidden: { opacity: 0, scale: 0.95 },
                        show: { opacity: 1, scale: 1 }
                      }}
                      whileHover={{ y: -4, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => addToCart(product)}
                      className="group bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 border border-gray-100 dark:border-gray-700 hover:border-indigo-500/50 transition-all duration-300 text-left flex flex-col h-full relative overflow-hidden"
                    >
                      <div className="w-full aspect-square bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-900/10 dark:to-gray-800 rounded-xl mb-3 flex items-center justify-center border border-indigo-100/50 dark:border-indigo-800/10 group-hover:scale-105 transition-transform duration-500 overflow-hidden shrink-0">
                        <span className="text-3xl drop-shadow-md select-none transform group-hover:rotate-12 transition-transform duration-500">
                          {product.category === 'dondurma' ? '🍦' : product.category === 'kokteyl' ? '🍹' : '🍰'}
                        </span>
                      </div>
                      
                      <div className="flex-1 min-h-0 flex flex-col justify-between">
                        <h3 className="font-bold text-gray-900 dark:text-white leading-snug text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 uppercase tracking-tight">{product.name}</h3>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[9px] uppercase tracking-widest font-black text-gray-400 dark:text-gray-500">{product.category}</span>
                          <div className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                            {product.price.toFixed(2)} ₼
                          </div>
                        </div>
                      </div>

                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 duration-300">
                        <div className="bg-indigo-600 text-white p-1.5 rounded-lg shadow-lg">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </motion.button>
                  ))
                )}
              </motion.div>
            </div>
          </div>

          {/* Cart Drawer */}
          <AnimatePresence>
            {showCartDrawer && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowCartDrawer(false)}
                  className="fixed inset-0 bg-black/50 z-[950] backdrop-blur-sm"
                />
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="fixed top-0 right-0 bottom-0 z-[1050] w-full sm:w-[400px] bg-white dark:bg-gray-800 shadow-2xl flex flex-col border-l border-gray-100 dark:border-gray-700"
                >
                  {/* Cart Header */}
                  <div className="p-5 border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-900/30 flex items-center justify-between pt-[max(env(safe-area-inset-top),1.25rem)]">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                        <ShoppingCart className="w-4 h-4" />
                      </div>
                      <h2 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('pos.cart')}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-black">
                        {cart.reduce((sum, item) => sum + item.quantity, 0)} ədəd
                      </span>
                      <button onClick={() => setShowCartDrawer(false)} className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg" title="Bağla">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Cart Items List - Independent Scroll */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-none custom-scrollbar pb-[max(env(safe-area-inset-bottom),1rem)]">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {cart.length === 0 ? (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="h-full flex flex-col items-center justify-center text-gray-400 text-center opacity-70"
                        >
                          <motion.div
                            animate={{ y: [0, -10, 0], rotate: [0, -5, 5, 0] }}
                            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                          >
                            <ShoppingCart className="w-12 h-12 mb-3 text-indigo-300 dark:text-indigo-800" />
                          </motion.div>
                          <p className="text-xs font-bold italic">{t('pos.emptyCart')}</p>
                        </motion.div>
                      ) : (
                        cart.map(item => (
                          <motion.div 
                            key={item.product.id}
                            layout
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="group flex flex-col p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 min-w-0 pr-2">
                                <h4 className="font-bold text-gray-900 dark:text-white text-xs uppercase tracking-tight truncate">{item.product.name}</h4>
                              </div>
                              <div className="text-xs font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                                {(item.product.price * item.quantity).toFixed(2)} ₼
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex items-center bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm">
                                <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Azalt">
                                  <Minus className="w-3 h-3" />
                                </button>
                                <motion.span 
                                  key={item.quantity}
                                  initial={{ scale: 1.5, color: '#4f46e5' }}
                                  animate={{ scale: 1, color: 'inherit' }}
                                  className="font-black w-6 text-center text-gray-900 dark:text-white text-[11px]"
                                >
                                  {item.quantity}
                                </motion.span>
                                <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 text-gray-400 hover:text-indigo-500 transition-colors" title="Artır">
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              <button onClick={() => removeFromCart(item.product.id)} className="p-1.5 text-red-400 hover:text-red-600 transition-colors" title="Sil">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Cart Footer */}
                  <div className="p-5 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800 space-y-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
                    <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                      <button
                        onClick={() => setPaymentMethod('cash')}
                        className={cn(
                          "flex-1 flex items-center justify-center py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                          paymentMethod === 'cash' ? "bg-indigo-600 text-white shadow-lg" : "text-gray-400"
                        )}
                      >
                        💵 Nağd
                      </button>
                      <button
                        onClick={() => setPaymentMethod('bank')}
                        className={cn(
                          "flex-1 flex items-center justify-center py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                          paymentMethod === 'bank' ? "bg-indigo-600 text-white shadow-lg" : "text-gray-400"
                        )}
                      >
                        💳 Kart
                      </button>
                    </div>

                    <div className="flex justify-between items-end border-b border-gray-200 dark:border-gray-700 pb-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">{t('pos.total')}</span>
                        <span className="text-2xl font-black text-gray-900 dark:text-white leading-none tracking-tighter">{total.toFixed(2)} ₼</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] font-bold text-green-500 uppercase tracking-widest leading-none mb-1">Bonus</span>
                        <span className="text-xs font-black text-green-500 leading-none">+{(total * 0.05).toFixed(2)}</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleCheckout}
                      disabled={cart.length === 0 || loading}
                      className="group relative w-full h-14 bg-indigo-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-xl shadow-indigo-500/20 overflow-hidden flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <CreditCard className="w-5 h-5" />
                          <span>{t('pos.checkout')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Universal Cart Floating Link */}
      <AnimatePresence>
        {!showCartDrawer && (
          <motion.button
            initial={{ scale: 0, y: 50, rotate: -10 }}
            animate={{ 
              scale: 1, 
              y: [0, -8, 0], 
              rotate: 0,
              transition: { 
                y: { repeat: Infinity, duration: 2.5, ease: "easeInOut" } 
              }
            }}
            exit={{ scale: 0, y: 50, rotate: 10 }}
            whileHover={{ scale: 1.05, rotate: -3 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCartDrawer(true)}
            className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 sm:right-6 lg:bottom-10 lg:right-10 z-[200] bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_auto] text-white px-4 sm:px-5 py-3 sm:py-4 rounded-full sm:rounded-2xl shadow-2xl shadow-indigo-600/40 flex items-center gap-3 border-4 border-white dark:border-gray-800 transition-all hover:animate-[gradient_2s_linear_infinite]"
          >
            <div className="relative">
              <ShoppingCart className="w-5 h-5" />
              <AnimatePresence>
                {cart.reduce((sum, item) => sum + item.quantity, 0) > 0 && (
                  <motion.span 
                    key={cart.reduce((sum, item) => sum + item.quantity, 0)}
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-3 -right-3 bg-red-500 text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-indigo-600 shadow-md shadow-red-500/50"
                  >
                    {cart.reduce((sum, item) => sum + item.quantity, 0)}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <span className="font-black text-xs uppercase tracking-widest hidden sm:inline">Səbət</span>
          </motion.button>
        )}
      </AnimatePresence>
      {/* Inventory Shortage Modal */}
      <AnimatePresence>
        {inventoryError && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
              onClick={() => setInventoryError(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-[32px] shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700"
            >
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter italic">Inqrediyent Çatışmır</h3>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest leading-none mt-1">Anbar Xətası</p>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-6 mb-8 border border-gray-100 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4">
                    Bu satışı tamamlamaq üçün <span className="font-bold text-gray-900 dark:text-white">{inventoryError.itemName}</span> çatışmır:
                  </p>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Lazımdır</span>
                      <span className="text-lg font-black text-red-600 dark:text-red-400 leading-none">{inventoryError.required}</span>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-300" />
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Mövcuddur</span>
                      <span className="text-lg font-black text-gray-900 dark:text-white leading-none">{inventoryError.available}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {user?.role === 'admin' && (
                    <Link
                      to="/inventory"
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                    >
                      <Package className="w-4 h-4" />
                      Anbara get və əlavə et
                    </Link>
                  )}
                  <button
                    onClick={() => setInventoryError(null)}
                    className="w-full py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-600 transition-all flex items-center justify-center"
                  >
                    Anladım
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
