import React, { useState, useEffect } from 'react';
import { Plus, Search, User, Calendar, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';

export default function HR() {
  const { t } = useLanguage();
  const [employees, setEmployees] = useState<any[]>([]);
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    salary: '',
    hire_date: format(new Date(), 'yyyy-MM-dd'),
    username: '',
    password: '',
    email: '',
    phone: '',
    address: '',
    user_role: 'user' // Default to 'user' as requested
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [
        { data: empData, error: empErr },
        { data: bonusData }
      ] = await Promise.all([
        supabase.from('employees').select('*').order('name'),
        supabase.from('seller_bonuses_view').select('*')
      ]);

      if (empErr) throw empErr;
      setEmployees(empData || []);
      setBonuses(bonusData || []);
    } catch (e) {
      console.error(e);
      toast.error('İşçilər yüklənərkən xəta');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 1. Create employee
      const { data: empData, error: empErr } = await supabase.from('employees').insert([{
        name: formData.name,
        role: formData.role,
        salary: parseFloat(formData.salary),
        hire_date: formData.hire_date
      }]).select().single();

      if (empErr) throw empErr;

      // 2. Create user account
      const { error: userErr } = await supabase.from('users').insert([{
        username: formData.username,
        password: formData.password,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        role: formData.user_role // Use selected role (admin or user)
      }]);

      if (userErr) throw userErr;

      setShowModal(false);
      setFormData({
        name: '',
        role: '',
        salary: '',
        hire_date: format(new Date(), 'yyyy-MM-dd'),
        username: '',
        password: '',
        email: '',
        phone: '',
        address: '',
        user_role: 'user'
      });
      toast.success(t('hr.addEmployee'));
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Xəta baş verdi: ' + e.message);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.hr')}</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center hover:bg-indigo-700 transition"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('hr.newEmployee')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {employees.map((employee) => (
          <div key={employee.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 hover:shadow-md transition">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 mr-4">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{employee.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{employee.role}</p>
              </div>
            </div>
            <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <DollarSign className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                {t('hr.salary')}: <span className="font-bold text-gray-900 dark:text-white ml-1">{employee.salary} ₼</span>
              </div>
              <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <Calendar className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                {t('hr.hireDate')}: <span className="font-medium text-gray-900 dark:text-white ml-1">{format(new Date(employee.hire_date), 'dd.MM.yyyy')}</span>
              </div>
              <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg flex justify-between items-center">
                <span className="text-xs font-bold text-green-700 dark:text-green-400">Satış Bonusu (0.8%):</span>
                <span className="text-sm font-black text-green-600 dark:text-green-300">
                  {(bonuses.find(b => b.seller_name?.toLowerCase().trim() === employee.name?.toLowerCase().trim())?.total_bonus || 0).toFixed(2)} ₼
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[60] p-0 lg:p-4">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
          >
            <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{t('hr.addEmployeeTitle')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('hr.fullName')}</label>
                  <input required type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('hr.role')}</label>
                  <input required type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('hr.salary')} (₼)</label>
                    <input required type="number" step="0.01" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.salary} onChange={e => setFormData({ ...formData, salary: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('hr.hireDate')}</label>
                    <input required type="date" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.hire_date} onChange={e => setFormData({ ...formData, hire_date: e.target.value })} />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-2">
                  <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-3">Sistem Giriş Məlumatları</p>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">İstifadəçi adı</label>
                        <input required type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} placeholder="mammad" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Şifrə</label>
                        <input required type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="123456" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                        <input required type="email" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="mammad@gelato.az" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telefon</label>
                        <input type="tel" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+994" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sistem Rolu</label>
                      <select
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2"
                        value={formData.user_role}
                        onChange={e => setFormData({ ...formData, user_role: e.target.value as 'admin' | 'user' })}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col-reverse lg:flex-row justify-end gap-3 mt-6">
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
