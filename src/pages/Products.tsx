import React, { useState, useEffect } from 'react';
import { Plus, PackageSearch, ChefHat, Edit2, Layers, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import LoadingSpinner from '../components/ui/LoadingSpinner';

export default function Products() {
  const { t } = useLanguage();
  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());

  const toggleExpand = (productId: number) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  const [formData, setFormData] = useState({ name: '', category: 'dondurma', price: '', margin: '' });
  const [recipeItems, setRecipeItems] = useState<{ inventory_id: string, quantity_needed: string }[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  // Body scroll lock when modal is open
  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showModal]);

  const fetchData = async () => {
    try {
      setIsLoadingPage(true);
      const [
        { data: prodData, error: prodErr },
        { data: invData, error: invErr },
        { data: costData }
      ] = await Promise.all([
        supabase.from('products').select(`*, recipes(id, quantity_needed, inventory(id, name, unit_cost))`),
        supabase.from('inventory').select('*').order('name'),
        supabase.from('product_costs_view').select('*')
      ]);

      if (prodErr) throw prodErr;
      if (invErr) throw invErr;

      const costMap = new Map((costData || []).map(c => [c.product_id, c.calculated_cost_price]));

      const formattedProducts = (prodData || []).map(p => {
        const mappedRecipes = (p.recipes || []).map(r => {
          return {
            id: r.id,
            inventory_id: r.inventory?.id,
            quantity_needed: r.quantity_needed || 0,
            ingredient_name: r.inventory?.name || t('inventory.unknownSupplier'),
            unit_cost: r.inventory?.unit_cost || 0
          };
        });
        const costPrice = costMap.get(p.id) || 0;
        return { ...p, costPrice, recipes: mappedRecipes };
      });

      setProducts(formattedProducts);
      setInventory(invData || []);
    } catch (e) {
      console.error(e);
      toast.error(t('pos.error'));
    } finally {
      setIsLoadingPage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const productPayload = {
        name: formData.name,
        category: formData.category,
        price: parseFloat(formData.price)
      };

      let productId = editingProduct?.id;

      if (editingProduct) {
        const { error: prodErr } = await supabase
          .from('products')
          .update(productPayload)
          .eq('id', productId);
        if (prodErr) throw prodErr;

        const { error: delErr } = await supabase
          .from('recipes')
          .delete()
          .eq('product_id', productId);
        if (delErr) throw delErr;
      } else {
        const { data: newProd, error: prodErr } = await supabase
          .from('products')
          .insert([productPayload])
          .select()
          .single();
        if (prodErr) throw prodErr;
        productId = newProd.id;
      }

      if (recipeItems.length > 0) {
        const recipesPayload = recipeItems.map(r => ({
          product_id: productId,
          inventory_id: parseInt(r.inventory_id),
          quantity_needed: parseFloat(r.quantity_needed)
        }));
        const { error: recErr } = await supabase
          .from('recipes')
          .insert(recipesPayload);
        if (recErr) throw recErr;
      }

      setShowModal(false);
      setEditingProduct(null);
      setRecipeItems([]);
      setFormData({ name: '', category: 'dondurma', price: '', margin: '' });
      toast.success(editingProduct ? t('common.save') : t('products.newProduct'));
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(t('pos.errorPrefix') + e.message);
    }
  };

  const editProduct = (product: any) => {
    setEditingProduct(product);
    const initialMargin = product.price > 0 ? (((product.price - product.costPrice) / product.price) * 100).toFixed(1) : '';
    setFormData({
      name: product.name,
      category: product.category,
      price: product.price.toString(),
      margin: initialMargin
    });
    setRecipeItems(
      (product.recipes || []).map((r: any) => ({
        inventory_id: r.inventory_id.toString(),
        quantity_needed: r.quantity_needed.toString()
      }))
    );
    setShowModal(true);
  };

  const calculateCurrentCost = () => {
    return recipeItems.reduce((total, item) => {
      const ingredient = inventory.find(inv => inv.id.toString() === item.inventory_id);
      const cost = ingredient?.unit_cost || 0;
      const quantity = parseFloat(item.quantity_needed) || 0;
      return total + (cost * quantity);
    }, 0);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  const openNewProductModal = () => {
    setEditingProduct(null);
    setFormData({ name: '', category: 'dondurma', price: '', margin: '' });
    setRecipeItems([]);
    setShowModal(true);
  };

  const addRecipeItem = () => {
    setRecipeItems([...recipeItems, { inventory_id: '', quantity_needed: '' }]);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {isLoadingPage ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner message="Məhsullar yüklənir..." />
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.products')}</h1>
        <button
          onClick={openNewProductModal}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center hover:bg-indigo-700 transition"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('products.newProduct')}
        </button>
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"
      >
        {products.map((product) => {
          const isExpanded = expandedProducts.has(product.id);
          return (
            <motion.div 
              variants={itemVariants}
              whileHover={{ y: -2, transition: { duration: 0.2 } }}
              key={product.id} 
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6 flex flex-col h-fit"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-4">
                  <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white line-clamp-2 h-12 sm:h-14" title={product.name}>
                    {product.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 capitalize">
                      {product.category}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <button 
                    onClick={() => editProduct(product)} 
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all"
                    title={t('common.edit')}
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="mt-6 flex items-end justify-between bg-gray-50/50 dark:bg-gray-900/30 rounded-2xl p-4 border border-gray-100/50 dark:border-gray-700/30">
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider font-black text-gray-400 dark:text-gray-500">
                    Maya Dəyəri
                  </div>
                  <div className="text-sm font-bold text-gray-600 dark:text-gray-400">
                    {Number(product.costPrice || 0).toFixed(2)} <span className="text-[10px]">₼</span>
                  </div>
                </div>
                
                <div className="text-right space-y-1">
                  <div className="text-[10px] uppercase tracking-wider font-black text-indigo-500/70 dark:text-indigo-400/70">
                    Satış Qiyməti
                  </div>
                  <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 flex items-baseline justify-end gap-1">
                    {Number(product.price || 0).toFixed(2)} <span className="text-sm">₼</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className={`px-2 py-1 rounded-lg text-xs font-bold ${
                  (product.price > 0 ? ((product.price - product.costPrice) / product.price) * 100 : 0) > 30 
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-100 dark:border-green-800/30' 
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100 dark:border-amber-800/30'
                }`}>
                  Qazanc: {Number(product.price > 0 ? ((product.price - product.costPrice) / product.price) * 100 : 0).toFixed(1)}%
                </div>

                <button 
                  onClick={() => toggleExpand(product.id)}
                  className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors uppercase tracking-tight"
                >
                  {isExpanded ? 'Gizlə' : 'Resept'}
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Layers className="w-3.5 h-3.5" />
                  </motion.div>
                </button>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-3">
                        <ChefHat className="w-4 h-4 text-gray-400" />
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('products.recipe')}</span>
                      </div>
                      <ul className="space-y-2.5">
                        {product.recipes?.map((r: any) => (
                          <li key={r.id} className="flex justify-between items-center text-sm group">
                            <span className="text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{r.ingredient_name}</span>
                            <div className="flex items-center gap-2">
                              <span className="h-px w-8 bg-gray-100 dark:bg-gray-700/50" />
                              <span className="text-gray-900 dark:text-white font-black">{r.quantity_needed}</span>
                            </div>
                          </li>
                        ))}
                        {(!product.recipes || product.recipes.length === 0) && (
                          <li className="text-sm text-gray-400 dark:text-gray-500 italic flex items-center justify-center py-4 bg-gray-50/50 dark:bg-gray-900/20 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                            {t('products.noRecipe')}
                          </li>
                        )}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl overflow-x-hidden"
          >
            <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              {editingProduct ? t('common.edit') : t('products.addProductTitle')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="product-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('products.productName')}</label>
                <input id="product-name" title={t('products.productName')} required type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="product-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('products.category')}</label>
                  <select id="product-category" title={t('products.category')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                    <option value="dondurma">{t('products.iceCream')}</option>
                    <option value="kokteyl">{t('products.cocktail')}</option>
                    <option value="diger">{t('products.other')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="product-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('products.price')} (₼)
                  </label>
                  <input
                    id="product-price"
                    title={t('products.price')}
                    required
                    type="number"
                    step="0.01"
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2"
                    value={formData.price}
                    onChange={e => {
                      const newPrice = e.target.value;
                      const cost = calculateCurrentCost();
                      const margin = newPrice && parseFloat(newPrice) > 0 
                        ? (((parseFloat(newPrice) - cost) / parseFloat(newPrice)) * 100).toFixed(1)
                        : '';
                      setFormData({ ...formData, price: newPrice, margin });
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="product-margin" className="block text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-1 font-bold">
                    İstənilən Marja %
                  </label>
                  <input
                    id="product-margin"
                    title="İstənilən Marja %"
                    type="number"
                    step="0.1"
                    placeholder="Məs: 50"
                    className="w-full border-2 border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/30 dark:bg-indigo-900/10 text-gray-900 dark:text-white rounded-xl px-3 py-2 focus:border-indigo-500 outline-none transition-colors"
                    value={formData.margin}
                    onChange={e => {
                      const newMargin = e.target.value;
                      const cost = calculateCurrentCost();
                      const price = newMargin && parseFloat(newMargin) < 100
                        ? (cost / (1 - (parseFloat(newMargin) / 100))).toFixed(2)
                        : formData.price;
                      setFormData({ ...formData, margin: newMargin, price: price.toString() });
                    }}
                  />
                </div>
                <div className="flex flex-col justify-end pb-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Cari Maya Dəyəri:</div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">
                    {calculateCurrentCost().toFixed(2)} ₼
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('products.recipeConsumption')}</h3>
                  <button type="button" onClick={addRecipeItem} className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium">{t('products.addIngredient')}</button>
                </div>

                <div className="space-y-3">
                  {recipeItems.map((item, index) => (
                    <div key={index} className="flex gap-2 sm:gap-3">
                      <select
                        required
                        title={t('products.selectIngredient')}
                        className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-2 sm:px-3 py-2 text-sm"
                        value={item.inventory_id}
                        onChange={e => {
                          const newItems = [...recipeItems];
                          newItems[index].inventory_id = e.target.value;
                          setRecipeItems(newItems);
                        }}
                      >
                        <option value="">{t('products.selectIngredient')}</option>
                        {inventory.map(inv => <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>)}
                      </select>
                      <input
                        required
                        type="number"
                        step="0.001"
                        placeholder={t('common.quantity')}
                        className="w-20 sm:w-24 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-2 sm:px-3 py-2 text-sm"
                        value={item.quantity_needed}
                        onChange={e => {
                          const newItems = [...recipeItems];
                          newItems[index].quantity_needed = e.target.value;
                          setRecipeItems(newItems);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setRecipeItems(recipeItems.filter((_, i) => i !== index))}
                        className="text-red-500 hover:text-red-700 font-bold px-1 sm:px-2"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              </div>

                <div className="flex flex-col-reverse lg:flex-row justify-end gap-3 mt-8">
                  <button type="button" onClick={() => setShowModal(false)} className="w-full lg:w-auto px-4 py-3 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium">{t('common.cancel')}</button>
                  <button type="submit" className="w-full lg:w-auto px-4 py-3 lg:py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium">{t('common.save')}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        </>
      )}
    </motion.div>
  );
}
