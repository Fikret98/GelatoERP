import React, { useState, useEffect } from 'react';
import { Plus, PackageSearch, ChefHat, Edit2, Layers } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';

export default function Products() {
  const { t } = useLanguage();
  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);

  const [formData, setFormData] = useState({ name: '', category: 'dondurma', price: '' });
  const [recipeItems, setRecipeItems] = useState<{ inventory_id: string, quantity_needed: string }[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
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
      setFormData({ name: '', category: 'dondurma', price: '' });
      toast.success(editingProduct ? t('common.save') : t('products.newProduct'));
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(t('pos.errorPrefix') + e.message);
    }
  };

  const editProduct = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category: product.category,
      price: product.price.toString()
    });
    setRecipeItems(
      (product.recipes || []).map((r: any) => ({
        inventory_id: r.inventory_id.toString(),
        quantity_needed: r.quantity_needed.toString()
      }))
    );
    setShowModal(true);
  };

  const openNewProductModal = () => {
    setEditingProduct(null);
    setFormData({ name: '', category: 'dondurma', price: '' });
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

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {products.map((product) => (
          <div key={product.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{product.name}</h3>
                <span className="inline-block px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-md mt-1 capitalize">
                  {product.category}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Maya: {Number(product.costPrice || 0).toFixed(2)} ₼
                  </div>
                  <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400 leading-none">
                    Satış: {Number(product.price || 0).toFixed(2)} ₼
                  </div>
                </div>
                <button onClick={() => editProduct(product)} className="text-gray-400 hover:text-indigo-600 transition" title={t('common.edit')}>
                  <Edit2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 flex items-center">
                <Layers className="w-4 h-4 mr-2" /> {t('products.recipe')}
              </h4>
              <ul className="space-y-2">
                {product.recipes?.map((r: any) => (
                  <li key={r.id} className="flex justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{r.ingredient_name}</span>
                    <span className="text-gray-500 dark:text-gray-400 font-mono">{r.quantity_needed}</span>
                  </li>
                ))}
                {(!product.recipes || product.recipes.length === 0) && (
                  <li className="text-sm text-gray-400 dark:text-gray-500 italic">{t('products.noRecipe')}</li>
                )}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[60] p-0 lg:p-4">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              {editingProduct ? t('common.edit') : t('products.addProductTitle')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('products.productName')}</label>
                <input required type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('products.category')}</label>
                  <select className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                    <option value="dondurma">{t('products.iceCream')}</option>
                    <option value="kokteyl">{t('products.cocktail')}</option>
                    <option value="diger">{t('products.other')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('products.price')} (₼)</label>
                  <input required type="number" step="0.01" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('products.recipeConsumption')}</h3>
                  <button type="button" onClick={addRecipeItem} className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium">{t('products.addIngredient')}</button>
                </div>

                <div className="space-y-3">
                  {recipeItems.map((item, index) => (
                    <div key={index} className="flex gap-3">
                      <select
                        required
                        className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm"
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
                        className="w-24 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm"
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
                        className="text-red-500 hover:text-red-700 font-bold px-2"
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
    </motion.div>
  );
}
