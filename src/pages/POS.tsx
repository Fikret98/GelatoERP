import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, X, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
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
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  
  // Shift Modals
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [openingBalance, setOpeningBalance] = useState<string>('');
  const [suggestedBalance, setSuggestedBalance] = useState<number>(0);
  const [closingActual, setClosingActual] = useState<string>('');
  const [closingExpected, setClosingExpected] = useState<number>(0);
  const [shiftNotes, setShiftNotes] = useState('');

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
    setOpeningBalance(lastBalance.toString());
  };

  const addToCart = (product: any) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
    toast.success(`${product.name} səbətə əlavə edildi`, {
      icon: '🛒',
      position: 'bottom-center',
      className: 'mb-24 lg:mb-0'
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

  // Body scroll lock when mobile cart is open
  useEffect(() => {
    if (showMobileCart) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100vw';
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = 'var(--scrollbar-width, 0px)';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = 'unset';
      document.body.style.paddingRight = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = 'unset';
      document.body.style.paddingRight = '';
    };
  }, [showMobileCart]);

  // 3. Shift Management Functions

  const handleOpenShift = async () => {
    try {
      const balance = parseFloat(openingBalance);
      if (isNaN(balance)) {
        toast.error('Düzgün məbləğ daxil edin');
        return;
      }
      await openShift(balance, suggestedBalance);
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
    setClosingActual(expected.toString());
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
      toast.success(t('pos.success'));
    } catch (e: any) {
      console.error(e);
      toast.error(t('pos.errorPrefix') + (e.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col gap-6 h-full relative"
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
        <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto w-full pr-0 lg:pr-2">
            <div className="flex items-center justify-between mb-6 px-1">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">{t('nav.pos')}</h1>
              <div className="text-xs text-gray-400 font-medium">
                {products.length} {t('pos.items')} tapıldı
              </div>
            </div>
            
            <motion.div 
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: { staggerChildren: 0.05 }
                }
              }}
              initial="hidden"
              animate="show"
              className="p-1 sm:p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6 pb-20"
            >
              {products.length === 0 ? (
                <div className="col-span-full py-20 text-center">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-4 opacity-20" />
                  <p className="text-gray-400 font-bold italic">Məhsul tapılmadı.</p>
                  <p className="text-xs text-gray-500 mt-2">Zəhmət olmasa "Anbar" bölməsindən məhsul əlavə edin və ya bazanı yoxlayın.</p>
                </div>
              ) : (
                products.map(product => (
                  <motion.button
                    key={product.id}
                    variants={{
                      hidden: { opacity: 0, scale: 0.95 },
                      show: { opacity: 1, scale: 1 }
                    }}
                    whileHover={{ y: -4, shadow: "0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => addToCart(product)}
                    className="bg-white dark:bg-gray-800 p-3 sm:p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 transition-all text-left flex flex-col h-full group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-3 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-opacity">
                      <div className="bg-indigo-600 text-white p-1.5 rounded-lg shadow-lg shadow-indigo-200 dark:shadow-none">
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>
                    
                    <div className="w-full aspect-square bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-900/20 dark:to-gray-800 rounded-2xl mb-4 flex items-center justify-center border border-indigo-100/50 dark:border-indigo-800/20 group-hover:scale-105 transition-transform duration-300 overflow-hidden shrink-0">
                      <span className="text-xl sm:text-2xl lg:text-3xl drop-shadow-sm select-none">
                        {product.category === 'dondurma' ? '🍦' : product.category === 'kokteyl' ? '🍹' : '🍰'}
                      </span>
                    </div>
                    
                    <div className="flex-1 min-h-0 flex flex-col justify-between">
                      <h3 className="font-bold text-gray-900 dark:text-white leading-tight text-xs sm:text-sm lg:text-base group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 h-8 sm:h-10 lg:h-12">{product.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-gray-500">{product.category}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                      <div className="text-sm sm:text-lg font-bold text-indigo-600 dark:text-indigo-400 flex items-baseline gap-0.5">
                        {product.price.toFixed(2)} <span className="text-[10px] sm:text-xs">₼</span>
                      </div>
                    </div>
                  </motion.button>
                ))
              )}
            </motion.div>
          </div>

          {/* Cart Section - Mobile Overlay */}
          <div className={`
            fixed inset-0 z-[100] bg-black/50 lg:hidden transition-opacity
            ${showMobileCart ? 'opacity-100' : 'opacity-0 pointer-events-none'}
          `} onClick={() => setShowMobileCart(false)} />

          {/* Cart Section (Desktop: static, Mobile: fixed) */}
          <div className={`
            fixed bottom-0 left-0 right-0 z-[200] h-[85vh] lg:h-full
            lg:static lg:w-96
            bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl shadow-xl lg:shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col
            transition-transform duration-300 lg:transform-none
            ${showMobileCart ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}
          `}>
            {/* Cart Header */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded-t-3xl lg:rounded-t-2xl">
              <h2 className="text-lg font-bold flex items-center text-gray-900 dark:text-white">
                <ShoppingCart className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
                {t('pos.cart')}
              </h2>
              <div className="flex items-center">
                <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 px-2.5 py-0.5 rounded-full text-sm font-bold mr-2 lg:mr-0">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)} {t('pos.items')}
                </span>
                <button onClick={() => setShowMobileCart(false)} className="lg:hidden p-1 bg-gray-200 dark:bg-gray-700 rounded-full" title="Bağla">
                  <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </button>
              </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <AnimatePresence mode="popLayout">
                {cart.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500"
                  >
                    <ShoppingCart className="w-12 h-12 mb-3 opacity-20" />
                    <p>{t('pos.emptyCart')}</p>
                  </motion.div>
                ) : (
                  cart.map(item => (
                    <motion.div 
                      key={item.product.id}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600"
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <h4 className="font-bold text-gray-900 dark:text-white truncate">{item.product.name}</h4>
                        <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">{(item.product.price * item.quantity).toFixed(2)} ₼</div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded-md text-gray-500 dark:text-gray-400" title="Azalt">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="font-bold w-6 text-center text-gray-900 dark:text-white">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded-md text-gray-500 dark:text-gray-400" title="Artır">
                          <Plus className="w-4 h-4" />
                        </button>
                        <button onClick={() => removeFromCart(item.product.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 rounded-md ml-2" title="Sil">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Cart Footer */}
            <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom)+4rem)] lg:pb-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl space-y-4">
              <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all",
                    paymentMethod === 'cash' 
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none" 
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  )}
                >
                  💵 Nağd
                </button>
                <button
                  onClick={() => setPaymentMethod('card')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all",
                    paymentMethod === 'card' 
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none" 
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  )}
                >
                  💳 Kart
                </button>
              </div>

              <div className="flex justify-between items-center px-1">
                <span className="text-gray-600 dark:text-gray-400 font-medium">{t('pos.total')}</span>
                <span className="text-xl font-bold text-gray-900 dark:text-white">{total.toFixed(2)} ₼</span>
              </div>
              
              <button
                onClick={handleCheckout}
                disabled={cart.length === 0 || loading}
                className="w-full bg-indigo-600 text-white rounded-xl py-4 font-bold text-lg hover:bg-indigo-700 transition disabled:opacity-50 shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2"
              >
                {loading ? '...' : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    {t('pos.checkout')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Cart Floating Button */}
      {cart.length > 0 && !showMobileCart && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowMobileCart(true)}
          className="lg:hidden fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-[90] bg-indigo-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-2"
        >
          <div className="relative">
            <ShoppingCart className="w-6 h-6" />
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-indigo-600">
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          </div>
          <span className="font-bold text-sm">Səbət</span>
        </motion.button>
      )}
    </motion.div>
  );
}
