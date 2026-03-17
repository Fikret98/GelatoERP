import React, { useState, useEffect } from 'react';
import { Plus, Search, User, Calendar, DollarSign, Edit2, TrendingUp, TrendingDown, History, Shield, X, Trash2, ChevronRight, Calculator, Info, Percent, Coins } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useShift } from '../contexts/ShiftContext';
import { supabase } from '../lib/supabase';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { cn } from '../lib/utils';

export default function HR() {
  const { t } = useLanguage();
  const { activeShift } = useShift();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
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
    user_role: 'user',
    bonus_percentage: '0.8',
    work_schedule: ''
  });
  const [employeeDebts, setEmployeeDebts] = useState<any[]>([]);
  const [selectedDebtEmployee, setSelectedDebtEmployee] = useState<any | null>(null);
  const [isLoadingDebts, setIsLoadingDebts] = useState(false);
  const [debtRecords, setDebtRecords] = useState<any[]>([]);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedHistoryEmployee, setSelectedHistoryEmployee] = useState<any | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('');
  const [debtPaymentMethod, setDebtPaymentMethod] = useState<'cash' | 'bank'>('cash');

  useEffect(() => {
    fetchData();
  }, []);

  // Body scroll lock when modals are open
  useEffect(() => {
    if (showModal || selectedHistoryEmployee || selectedDebtEmployee) {
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
  }, [showModal, selectedHistoryEmployee, selectedDebtEmployee]);

  const fetchSalaryHistory = async (employee: any) => {
    setSelectedHistoryEmployee(employee);
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('salary_history')
        .select('*, users!changed_by(name)')
        .eq('user_id', employee.id)
        .order('changed_at', { ascending: false });
      
      if (error) throw error;
      setSalaryHistory(data || []);
    } catch (e: any) {
      console.error(e);
      toast.error('Tarixçə yüklənərkən xəta');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchDebtHistory = async (employee: any) => {
    setSelectedDebtEmployee(employee);
    setIsLoadingDebts(true);
    try {
      const { data, error } = await supabase
        .from('employee_debts')
        .select('*')
        .eq('user_id', employee.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setDebtRecords(data || []);
    } catch (e: any) {
      console.error(e);
      toast.error('Borc tarixçəsi yüklənərkən xəta');
    } finally {
      setIsLoadingDebts(false);
      setDebtPaymentAmount(employee.total_debt?.toString() || '0');
    }
  };

  const handleSettleDebt = async (employee: any, type: 'salary_deduction' | 'manual_payment') => {
    const amount = parseFloat(debtPaymentAmount);
    if (!amount || amount <= 0) {
      toast.error('Məbləğ düzgün daxil edilməyib');
      return;
    }

    if (amount > employee.total_debt) {
      toast.error('Ödəniş məbləği borcdan böyük ola bilməz');
      return;
    }

    if (type === 'salary_deduction') {
      const bonus = bonuses.find(b => b.seller_name?.toLowerCase().trim() === employee.name?.toLowerCase().trim())?.total_bonus || 0;
      const totalPossible = (employee.salary || 0) + bonus;
      
      if (amount > totalPossible) {
        toast.error(`Maaş/Bonus yetərli deyil. Max: ${totalPossible.toFixed(2)} ₼`);
        return;
      }
    }

    try {
      const { error } = await supabase
        .from('employee_debts')
        .insert([{
          user_id: employee.id,
          amount: -amount,
          type: type,
          notes: type === 'salary_deduction' ? 'Maaşdan çıxıldı' : 'Nəğd ödənildi',
          status: 'paid',
          shift_id: activeShift?.id
        }]);

      if (error) throw error;

      if (type === 'manual_payment') {
        await supabase
          .from('incomes')
          .insert([{
            category: 'İşçi Borcu Ödənişi',
            amount: amount,
            description: `İşçi borc ödənişi: ${employee.name}`,
            date: new Date().toISOString(),
            user_id: user?.id,
            payment_method: debtPaymentMethod,
            shift_id: activeShift?.id
          }]);
      }

      toast.success('Ödəniş qeyd olundu');
      fetchData();
      if (selectedDebtEmployee) {
        const updatedEmployee = { ...selectedDebtEmployee, total_debt: selectedDebtEmployee.total_debt - amount };
        setSelectedDebtEmployee(updatedEmployee);
        fetchDebtHistory(updatedEmployee);
      }
    } catch (e: any) {
      toast.error('Xəta: ' + e.message);
    }
  };

  const fetchData = async () => {
    try {
      setIsLoadingPage(true);
      const [
        { data: usersData, error: userErr },
        { data: bonusData },
        { data: debtsData }
      ] = await Promise.all([
        supabase.from('users').select('*, employees!employees_user_id_fkey(*)').order('name'),
        supabase.from('seller_bonuses_view').select('*'),
        supabase.from('employee_debts').select('user_id, amount, type, created_at')
      ]);

      if (userErr) throw userErr;

      const debtMap = (debtsData || []).reduce((acc: any, curr: any) => {
        acc[curr.user_id] = (acc[curr.user_id] || 0) + curr.amount;
        return acc;
      }, {});

      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const currentMonthDeductions = (debtsData || [])
        .filter(d => d.type === 'salary_deduction' && d.created_at >= firstDayOfMonth)
        .reduce((acc: any, curr: any) => {
          acc[curr.user_id] = (acc[curr.user_id] || 0) + Math.abs(curr.amount);
          return acc;
        }, {});

      const merged = (usersData || []).map(u => {
        const emp = u.employees?.[0];
        return {
          ...u,
          id: u.id,
          name: u.name,
          role_type: u.role,
          job_title: emp?.job_title || 'İşçi',
          salary: emp?.salary || 0,
          hire_date: emp?.hire_date || null,
          work_schedule: emp?.work_schedule || '',
          total_debt: debtMap[u.id] || 0,
          current_month_deductions: currentMonthDeductions[u.id] || 0,
          isSystemUser: true
        };
      });

      const filtered = user?.role === 'admin' 
        ? merged 
        : merged.filter(emp => emp.id === (user?.id ? user.id : ''));

      setEmployees(filtered);
      setBonuses(bonusData || []);
    } catch (e) {
      console.error(e);
      toast.error('Məlumatlar yüklənərkən xəta');
    } finally {
      setIsLoadingPage(false);
    }
  };

  const handleEdit = (employee: any) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name || '',
      role: employee.job_title || '',
      salary: (employee.salary || 0).toString(),
      hire_date: employee.hire_date || format(new Date(), 'yyyy-MM-dd'),
      username: employee.username || '',
      password: '', // Don't show password
      email: employee.email || '',
      phone: employee.phone || '',
      address: employee.address || '',
      user_role: employee.role || 'user',
      bonus_percentage: (employee.bonus_percentage || 0.8).toString(),
      work_schedule: employee.work_schedule || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    try {
      setIsSubmitting(true);
      
      if (editingEmployee) {
        const oldSalary = editingEmployee.salary;
        const newSalary = parseFloat(formData.salary);
        const oldBonus = editingEmployee.bonus_percentage;
        const newBonus = parseFloat(formData.bonus_percentage);
        const oldRole = editingEmployee.job_title;
        const newRole = formData.role;

        if (oldSalary !== newSalary || oldBonus !== newBonus || oldRole !== newRole) {
          await supabase.from('salary_history').insert([{
            user_id: editingEmployee.id,
            old_salary: oldSalary,
            new_salary: newSalary,
            old_bonus_percentage: oldBonus,
            new_bonus_percentage: newBonus,
            old_role: oldRole,
            new_role: newRole,
            change_type: oldSalary !== newSalary ? 'salary_change' : 'promotion',
            note: 'Manual update from HR module',
            created_by: user?.id ? parseInt(user.id) : null,
            shift_id: activeShift?.id
          }]);
        }

        const { error: userErr } = await supabase.from('users').update({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          role: formData.user_role,
          bonus_percentage: newBonus,
          ...(formData.password ? { password: formData.password } : {})
        }).eq('id', editingEmployee.id);

        if (userErr) throw userErr;

        const { error: empErr } = await supabase.from('employees').update({
          name: formData.name,
          job_title: formData.role,
          salary: newSalary,
          hire_date: formData.hire_date,
          work_schedule: formData.work_schedule
        }).eq('user_id', editingEmployee.id);

        if (empErr) throw empErr;

        toast.success(t('hr.updateSuccess') || 'İşçi məlumatları yeniləndi');
      } else {
        const { data: newUser, error: userErr } = await supabase.from('users').insert([{
          username: formData.username,
          password: formData.password,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          role: formData.user_role,
          bonus_percentage: parseFloat(formData.bonus_percentage)
        }]).select().single();

        if (userErr) throw userErr;

        const { error: empErr } = await supabase.from('employees').insert([{
          user_id: newUser.id,
          name: formData.name,
          job_title: formData.role,
          salary: parseFloat(formData.salary),
          hire_date: formData.hire_date,
          work_schedule: formData.work_schedule
        }]);

        if (empErr) throw empErr;
        toast.success(t('hr.addEmployee'));
      }

      setShowModal(false);
      setEditingEmployee(null);
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Xəta baş verdi: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bu işçini silmək istədiyinizə əminsiniz?')) return;
    try {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
      toast.success(t('hr.deleteSuccess') || 'İşçi silindi');
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Silinmə zamanı xəta');
    }
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
          <LoadingSpinner message="İşçi heyəti yüklənir..." />
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">{t('nav.hr')}</h1>
            {user?.role === 'admin' && (
              <button
                onClick={() => {
                  setEditingEmployee(null);
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
                    user_role: 'user',
                    bonus_percentage: '0.8',
                    work_schedule: ''
                  });
                  setShowModal(true);
                }}
                className="bg-indigo-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl flex items-center hover:bg-indigo-700 transition text-xs sm:text-sm font-bold"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
                {t('hr.newEmployee')}
              </button>
            )}
          </div>

          {/* Employee Statistics Grid */}
          {user?.role === 'admin' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                    <User className="w-6 h-6" />
                  </div>
                  <span className="text-2xl font-black text-gray-900 dark:text-white">{employees.length}</span>
                </div>
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">{t('hr.totalEmployees')}</p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400">
                    <DollarSign className="w-6 h-6" />
                  </div>
                  <span className="text-2xl font-black text-gray-900 dark:text-white">
                    {employees.reduce((sum, emp) => sum + emp.salary, 0).toFixed(2)} ₼
                  </span>
                </div>
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">{t('hr.totalSalary')}</p>
              </div>
            </div>
          )}

          <motion.div 
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: { staggerChildren: 0.1 }
              }
            }}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {employees.map(employee => (
              <motion.div
                key={employee.id}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  show: { opacity: 1, y: 0 }
                }}
                className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all group relative overflow-hidden"
              >
                {employee.total_debt > 1 && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black px-4 py-3 rounded-bl-3xl rotate-12 shadow-md">
                    BORCLU
                  </div>
                )}
                
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none font-black text-xl">
                      {employee.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-black text-gray-900 dark:text-white text-lg leading-tight">{employee.name}</h3>
                      <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mt-0.5">{employee.job_title}</p>
                    </div>
                  </div>
                  {user?.role === 'admin' && (
                    <div className="flex gap-1.5 translate-x-2 -translate-y-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(employee)} className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 transition-all" title="Düzəliş et">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(employee.id)} className="p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-100 transition-all" title="Sil">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-2xl border border-gray-100 dark:border-gray-700">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('hr.salary')}</p>
                    <p className="text-base font-bold text-gray-900 dark:text-white">{employee.salary.toFixed(2)} ₼</p>
                  </div>
                  <div className="bg-indigo-50/50 dark:bg-indigo-900/20 p-3 rounded-2xl border border-indigo-100/50 dark:border-indigo-800/30">
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Cari Bonus</p>
                    <p className="text-base font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                      {(bonuses.find(b => b.seller_name?.toLowerCase().trim() === employee.name?.toLowerCase().trim())?.total_bonus || 0).toFixed(2)} ₼
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <button onClick={() => fetchDebtHistory(employee)} className="w-full flex items-center justify-between p-3 bg-white dark:bg-gray-700/50 rounded-2xl border border-gray-100 dark:border-gray-600 hover:border-indigo-500/30 transition-all shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl text-red-600 dark:text-red-400">
                        <TrendingDown className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Borc Qalığı</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums mt-0.5">{employee.total_debt.toFixed(2)} ₼</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </button>

                  <button onClick={() => fetchSalaryHistory(employee)} className="w-full flex items-center justify-between p-3 bg-white dark:bg-gray-700/50 rounded-2xl border border-gray-100 dark:border-gray-600 hover:border-indigo-500/30 transition-all shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
                        <History className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Tarixçə</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5 uppercase tracking-tighter">Maaş & Bonus</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <AnimatePresence>
            {showModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-700 custom-scrollbar"
                >
                  <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                      {editingEmployee ? t('hr.editEmployee') : t('hr.newEmployee')}
                    </h2>
                    <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all" title="Bağla">
                      <X className="w-6 h-6 text-gray-400" />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h3 className="text-xs font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                          <User className="w-3 h-3" />
                          Şəxsi Məlumatlar
                        </h3>
                        <div>
                          <label htmlFor="emp-name" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">{t('hr.name')}</label>
                          <input id="emp-name" title={t('hr.name')} placeholder={t('hr.name')} required className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                        </div>
                        <div>
                          <label htmlFor="emp-role" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">{t('hr.role')}</label>
                          <input id="emp-role" title={t('hr.role')} placeholder={t('hr.role')} required className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} />
                        </div>
                        <div>
                          <label htmlFor="emp-schedule" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">İş Rejimi</label>
                          <input id="emp-schedule" title="İş Rejimi" placeholder="Məs: 09:00 - 18:00 (6 gün)" className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" value={formData.work_schedule} onChange={e => setFormData({ ...formData, work_schedule: e.target.value })} />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-xs font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                          <DollarSign className="w-3 h-3" />
                          Maliyyə & Giriş
                        </h3>
                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">{t('hr.salary')} (₼)</label>
                          <input id="emp-salary" title={t('hr.salary')} placeholder="0.00" required type="number" className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" value={formData.salary} onChange={e => setFormData({ ...formData, salary: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Bonus Faizi (%)</label>
                          <input id="emp-bonus" title="Bonus Faizi" placeholder="0.0" required type="number" step="0.1" className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" value={formData.bonus_percentage} onChange={e => setFormData({ ...formData, bonus_percentage: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {!editingEmployee && (
                            <div>
                              <label htmlFor="emp-username" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">İstifadəçi Adı</label>
                              <input id="emp-username" title="İstifadəçi Adı" placeholder="istifadəçi_adı" required className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
                            </div>
                          )}
                          <div className={editingEmployee ? "col-span-2" : ""}>
                            <label htmlFor="emp-password" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">{editingEmployee ? 'Yeni Şifrə (Boş qalsın: dəyişmə)' : 'Şifrə'}</label>
                            <input id="emp-password" title={editingEmployee ? 'Yeni Şifrə' : 'Şifrə'} placeholder="••••••••" required={!editingEmployee} type="password" className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                      <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-all">Ləğv Et</button>
                      <button type="submit" disabled={isSubmitting} className="flex-[2] bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-50">
                        {isSubmitting ? 'Saxlanılır...' : (editingEmployee ? 'Yenilə' : 'Əlavə Et')}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}

            {/* Salary History Modal */}
            {selectedHistoryEmployee && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" onClick={() => setSelectedHistoryEmployee(null)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 30 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-700 custom-scrollbar"
                >
                  <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Maaş & Rol Tarixçəsi</p>
                      <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase">{selectedHistoryEmployee.name}</h2>
                    </div>
                    <button onClick={() => setSelectedHistoryEmployee(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all" title="Bağla">
                      <X className="w-6 h-6 text-gray-400" />
                    </button>
                  </div>

                  {isLoadingHistory ? (
                    <div className="py-20 flex justify-center"><LoadingSpinner /></div>
                  ) : salaryHistory.length === 0 ? (
                    <div className="py-20 text-center text-gray-400 font-bold italic">Heç bir tarixçə qeydə alınmayıb.</div>
                  ) : (
                    <div className="space-y-4">
                      {salaryHistory.map((log) => (
                        <div key={log.id} className="bg-gray-50 dark:bg-gray-900/50 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 relative overflow-hidden group">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 opacity-50"></div>
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-4">
                                {log.old_salary !== log.new_salary && (
                                  <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Maaş Dəyişikliyi</p>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-gray-400 line-through tabular-nums">{log.old_salary.toFixed(2)} ₼</span>
                                      <ChevronRight className="w-3 h-3 text-gray-300" />
                                      <span className="text-sm font-black text-emerald-600 tabular-nums">{log.new_salary.toFixed(2)} ₼</span>
                                    </div>
                                  </div>
                                )}
                                {log.old_role !== log.new_role && (
                                  <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Vəzifə Dəyişikliyi</p>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">{log.old_role}</span>
                                      <ChevronRight className="w-3 h-3 text-gray-300" />
                                      <span className="text-sm font-black text-indigo-600 uppercase tracking-tighter">{log.new_role}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {format(new Date(log.changed_at), 'dd.MM.yyyy HH:mm')}</span>
                                <span className="flex items-center gap-1"><User className="w-3 h-3" /> {log.users?.name || 'Sistem'}</span>
                              </div>
                            </div>
                            {log.note && (
                              <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 max-w-xs">
                                <p className="text-[10px] text-gray-500 italic leading-relaxed">"{log.note}"</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </div>
            )}

            {/* Debt History & Payment Modal */}
            {selectedDebtEmployee && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" onClick={() => setSelectedDebtEmployee(null)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 30 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-700 custom-scrollbar"
                >
                  <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Borc Tarixçəsi & Ödəniş</p>
                      <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase">{selectedDebtEmployee.name}</h2>
                    </div>
                    <button onClick={() => setSelectedDebtEmployee(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all" title="Bağla">
                      <X className="w-6 h-6 text-gray-400" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div className="bg-red-50 dark:bg-red-900/10 p-6 rounded-3xl border border-red-100 dark:border-red-900/20 text-center">
                      <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Ümumi Borc Qalığı</p>
                      <p className="text-4xl font-black text-red-600 tabular-nums">{selectedDebtEmployee.total_debt.toFixed(2)} ₼</p>
                    </div>
                    
                    {user?.role === 'admin' && selectedDebtEmployee.total_debt > 0 && (
                      <div className="space-y-4">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Borc Ödənişi</p>
                        <div className="bg-gray-50/50 dark:bg-gray-900/30 p-6 rounded-[2rem] border border-indigo-100 dark:border-indigo-900/30 space-y-6 flex-1">
                          <div>
                            <label htmlFor="debt-payment" className="text-[10px] font-black text-indigo-600/50 dark:text-indigo-400/50 uppercase tracking-[0.2em] block mb-3 text-center">Ödəniş Məbləği</label>
                            <div className="relative">
                              <input 
                                id="debt-payment"
                                type="number" 
                                step="0.01" 
                                placeholder="0.00"
                                title="Ödəniş məbləği"
                                className="w-full bg-white dark:bg-gray-800 border-2 border-indigo-50 dark:border-indigo-900/20 rounded-2xl px-6 py-5 font-black text-3xl text-indigo-600 dark:text-indigo-400 outline-none focus:border-indigo-500/50 focus:ring-8 focus:ring-indigo-500/5 transition-all text-center placeholder:opacity-20 shadow-inner"
                                value={debtPaymentAmount}
                                onChange={e => setDebtPaymentAmount(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest block text-center">Ödəniş Metodu</label>
                            <div className="grid grid-cols-2 gap-3">
                              {(['cash', 'bank'] as const).map((method) => (
                                <button
                                  key={method}
                                  type="button"
                                  onClick={() => setDebtPaymentMethod(method)}
                                  className={cn(
                                    "py-4 rounded-2xl border-2 font-black text-[11px] uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-2 relative overflow-hidden group",
                                    debtPaymentMethod === method
                                      ? "border-indigo-600 bg-indigo-600 text-white shadow-xl shadow-indigo-200 dark:shadow-none translate-y-[-2px]"
                                      : "border-gray-100 dark:border-gray-700 text-gray-500 hover:border-indigo-200 dark:hover:border-indigo-800 bg-white dark:bg-gray-800"
                                  )}
                                >
                                  <div className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                                    debtPaymentMethod === method ? "bg-white/20" : "bg-gray-50 dark:bg-gray-900"
                                  )}>
                                    {method === 'cash' ? <DollarSign className="w-5 h-5" /> : <Coins className="w-5 h-5" />}
                                  </div>
                                  {method === 'cash' ? 'Nağd Kassa' : 'Bank Hesabı'}
                                </button>
                              ))}
                            </div>
                          </div>
                          
                          <button 
                            onClick={() => handleSettleDebt(selectedDebtEmployee, 'manual_payment')}
                            className="w-full bg-indigo-600 text-white px-8 py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-3 active:scale-[0.97]"
                          >
                            TƏSDİQLƏ VƏ ÖDƏ
                          </button>
                        </div>
                        <button 
                          onClick={() => handleSettleDebt(selectedDebtEmployee, 'salary_deduction')}
                          className="w-full text-indigo-600 dark:text-indigo-400 font-bold text-[10px] uppercase tracking-widest border border-indigo-200 dark:border-indigo-800 py-2 rounded-xl hover:bg-indigo-50 transition-all"
                        >
                          Maaşdan çıxılsın
                        </button>
                      </div>
                    )}
                  </div>

                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Əməliyyatlar</h3>
                  {isLoadingDebts ? (
                    <div className="py-20 flex justify-center"><LoadingSpinner /></div>
                  ) : debtRecords.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 font-bold italic">Borc hərəkəti yoxdur.</div>
                  ) : (
                    <div className="space-y-3">
                      {debtRecords.map((log) => (
                        <div key={log.id} className="bg-white dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center",
                              log.amount > 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                            )}>
                              {log.amount > 0 ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                            </div>
                            <div>
                              <p className="text-sm font-black text-gray-900 dark:text-white leading-tight">
                                {log.amount > 0 ? 'Kəsir/Borc yazıldı' : (log.type === 'salary_deduction' ? 'Maaşdan çıxıldı' : 'Nəğd ödənildi')}
                              </p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{format(new Date(log.created_at), 'dd.MM.yyyy HH:mm')}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={cn(
                              "text-base font-black tabular-nums",
                              log.amount > 0 ? "text-red-500" : "text-emerald-500"
                            )}>
                              {log.amount > 0 ? '+' : ''}{log.amount.toFixed(2)} ₼
                            </p>
                            {log.notes && <p className="text-[9px] text-gray-400 italic">"{log.notes}"</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
