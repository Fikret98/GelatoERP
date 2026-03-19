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
    const isModalOpen = showModal || selectedHistoryEmployee || selectedDebtEmployee;
    if (isModalOpen) {
      document.documentElement.classList.add('scroll-locked');
    } else {
      document.documentElement.classList.remove('scroll-locked');
    }
    return () => { document.documentElement.classList.remove('scroll-locked'); };
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
      toast.error(t('hr.errorHistory'));
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
      toast.error(t('hr.errorDebtHistory'));
    } finally {
      setIsLoadingDebts(false);
      setDebtPaymentAmount(employee.total_debt?.toString() || '0');
    }
  };

  const handleSettleDebt = async (employee: any, type: 'salary_deduction' | 'manual_payment') => {
    const amount = parseFloat(debtPaymentAmount);
    if (!amount || amount <= 0) {
      toast.error(t('hr.errorInvalidAmount'));
      return;
    }

    if (amount > employee.total_debt) {
      toast.error(t('hr.errorExceedsDebt'));
      return;
    }

    if (type === 'salary_deduction') {
      const bonus = bonuses.find(b => b.seller_name?.toLowerCase().trim() === employee.name?.toLowerCase().trim())?.total_bonus || 0;
      const totalPossible = (employee.salary || 0) + bonus;
      
      if (amount > totalPossible) {
        toast.error(`${t('hr.errorInsufficientFunds')}. Max: ${totalPossible.toFixed(2)} ₼`);
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
          notes: type === 'salary_deduction' ? t('hr.deductedFromSalary') : t('hr.paidInCash'),
          status: 'paid',
          shift_id: activeShift?.id
        }]);

      if (error) throw error;

      if (type === 'manual_payment') {
        await supabase
          .from('incomes')
          .insert([{
            category: t('hr.debtPaymentCategory'),
            amount: amount,
            description: t('hr.debtPaymentDesc').replace('{name}', employee.name),
            date: new Date().toISOString(),
            user_id: user?.id,
            payment_method: debtPaymentMethod,
            shift_id: activeShift?.id
          }]);
      }

      toast.success(t('hr.paymentSuccess'));
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
          job_title: emp?.job_title || t('hr.worker'),
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
      toast.error(t('hr.errorFetch'));
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
            note: t('hr.manualUpdateNote'),
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
          job_title: formData.role,
          salary: newSalary,
          hire_date: formData.hire_date,
          work_schedule: formData.work_schedule
        }).eq('user_id', editingEmployee.id);

        if (empErr) throw empErr;

        toast.success(t('hr.updateSuccess'));
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
          job_title: formData.role,
          salary: parseFloat(formData.salary),
          hire_date: formData.hire_date,
          work_schedule: formData.work_schedule
        }]);

        if (empErr) throw empErr;
        toast.success(t('hr.addSuccess'));
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
    if (!window.confirm(t('hr.deleteConfirm'))) return;
    try {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
      toast.success(t('hr.deleteSuccess'));
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error(t('hr.errorDelete'));
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
          <LoadingSpinner message={t('hr.loading')} />
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
                className={cn(
                  "rounded-3xl p-6 transition-all group relative overflow-hidden shadow-sm hover:shadow-xl",
                  employee.role_type === 'admin' 
                    ? "bg-gradient-to-b from-indigo-50/50 to-white dark:from-indigo-900/10 dark:to-gray-800 border-2 border-indigo-200 dark:border-indigo-800/50"
                    : "bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                )}
              >
                {employee.total_debt > 1 && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black px-4 py-3 rounded-bl-3xl rotate-12 shadow-md">
                    {t('hr.inDebt')}
                  </div>
                )}
                
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none font-black text-xl">
                      {employee.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-gray-900 dark:text-white text-lg leading-tight">{employee.name}</h3>
                        {employee.role_type === 'admin' && (
                          <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-indigo-200 dark:border-indigo-800/50">Admin</span>
                        )}
                      </div>
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
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">{t('hr.currentBonus')}</p>
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
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">{t('hr.debtBalance')}</p>
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
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">{t('hr.history')}</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5 uppercase tracking-tighter">{t('hr.salaryAndBonus')}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <AnimatePresence mode="wait">
            {showModal && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 sm:p-6 backdrop-blur-md" onClick={() => setShowModal(false)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 30 }}
                onClick={e => e.stopPropagation()}
                className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-6 sm:p-10 w-full max-w-2xl max-h-[min(90vh,calc(100vh-100px))] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-700 custom-scrollbar relative"
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
                        {t('hr.personalInfo')}
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
                        <label htmlFor="emp-schedule" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">{t('hr.workSchedule')}</label>
                        <input id="emp-schedule" title={t('hr.workSchedule')} placeholder={t('hr.schedulePlaceholder')} className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" value={formData.work_schedule} onChange={e => setFormData({ ...formData, work_schedule: e.target.value })} />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xs font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                        <DollarSign className="w-3 h-3" />
                        {t('hr.financeAndAccess')}
                      </h3>
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">{t('hr.salary')} (₼)</label>
                        <input id="emp-salary" title={t('hr.salary')} placeholder="0.00" required type="number" className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" value={formData.salary} onChange={e => setFormData({ ...formData, salary: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">{t('hr.bonusPercentage')} (%)</label>
                        <input id="emp-bonus" title={t('hr.bonusPercentage')} placeholder="0.0" required type="number" step="0.1" className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" value={formData.bonus_percentage} onChange={e => setFormData({ ...formData, bonus_percentage: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {!editingEmployee && (
                          <div>
                            <label htmlFor="emp-username" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">{t('hr.username')}</label>
                            <input id="emp-username" title={t('hr.username')} placeholder={t('hr.username')} required className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
                          </div>
                        )}
                        <div className={editingEmployee ? "col-span-2" : ""}>
                          <label htmlFor="emp-password" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">{editingEmployee ? t('hr.newPasswordHint') : t('hr.password')}</label>
                          <input id="emp-password" title={editingEmployee ? t('hr.newPasswordHint') : t('hr.password')} placeholder="••••••••" required={!editingEmployee} type="password" className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 pt-6 pb-4">
                    <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-100 dark:border-gray-700 transition-all">{t('common.cancel')}</button>
                    <button type="submit" disabled={isSubmitting} className="flex-[2] bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-50">
                      {isSubmitting ? t('hr.saving') : (editingEmployee ? t('hr.update') : t('common.add'))}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}

            {/* Salary History Modal */}
            {selectedHistoryEmployee && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 sm:p-6 backdrop-blur-md" onClick={() => setSelectedHistoryEmployee(null)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 30 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-6 sm:p-10 w-full max-w-2xl max-h-[min(90vh,calc(100vh-100px))] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-700 custom-scrollbar relative"
                >
                  <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">{t('hr.salaryHistoryTitle')}</p>
                      <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase">{selectedHistoryEmployee.name}</h2>
                    </div>
                    <button onClick={() => setSelectedHistoryEmployee(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all" title="Bağla">
                      <X className="w-6 h-6 text-gray-400" />
                    </button>
                  </div>

                  {isLoadingHistory ? (
                    <div className="py-20 flex justify-center"><LoadingSpinner /></div>
                  ) : salaryHistory.length === 0 ? (
                    <div className="py-20 text-center text-gray-400 font-bold italic">{t('hr.noHistory')}</div>
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
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('hr.salaryChange')}</p>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-gray-400 line-through tabular-nums">{log.old_salary.toFixed(2)} ₼</span>
                                      <ChevronRight className="w-3 h-3 text-gray-300" />
                                      <span className="text-sm font-black text-emerald-600 tabular-nums">{log.new_salary.toFixed(2)} ₼</span>
                                    </div>
                                  </div>
                                )}
                                {log.old_role !== log.new_role && (
                                  <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('hr.roleChange')}</p>
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

            {selectedDebtEmployee && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 sm:p-6 backdrop-blur-md" onClick={() => setSelectedDebtEmployee(null)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 30 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-6 sm:p-10 w-full max-w-3xl max-h-[min(92vh,calc(100vh-60px))] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-700 custom-scrollbar relative"
                >
                  <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">{t('hr.debtHistoryTitle')}</p>
                      <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase">{selectedDebtEmployee.name}</h2>
                    </div>
                    <button onClick={() => setSelectedDebtEmployee(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all" title="Bağla">
                      <X className="w-6 h-6 text-gray-400" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div className="space-y-6">
                      <div className="bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-900/10 dark:to-orange-900/10 p-8 rounded-[2rem] border border-rose-100 dark:border-rose-900/20 text-center relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                          <TrendingDown className="w-20 h-20" />
                        </div>
                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-[0.3em] mb-3">{t('hr.debtBalance')}</p>
                        <p className="text-5xl font-black text-rose-600 tabular-nums tracking-tighter drop-shadow-sm">
                          {selectedDebtEmployee.total_debt.toFixed(2)} <span className="text-2xl opacity-50 font-bold ml-1">₼</span>
                        </p>
                      </div>
                      
                      {user?.role === 'admin' && selectedDebtEmployee.total_debt > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
                          <div className="bg-white dark:bg-gray-900/40 p-1 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700/50">
                            <div className="bg-white dark:bg-gray-800 rounded-[2.4rem] p-6 sm:p-8 space-y-8">
                              <div className="text-center">
                                <label htmlFor="debt-payment" className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.3em] block mb-6">{t('hr.paymentAmount')}</label>
                                <div className="inline-flex items-center justify-center gap-4 bg-gray-50/50 dark:bg-gray-900/50 px-8 py-6 rounded-3xl border-2 border-dashed border-indigo-100 dark:border-indigo-900/30 w-full group/input focus-within:border-indigo-500 focus-within:ring-8 focus-within:ring-indigo-500/5 transition-all">
                                  <span className="text-2xl font-black text-indigo-300">₼</span>
                                  <input 
                                    id="debt-payment"
                                    type="number" 
                                    step="0.01" 
                                    placeholder="0.00"
                                    title={t('hr.paymentAmountTitle')}
                                    className="bg-transparent border-none py-0 font-black text-4xl text-indigo-600 dark:text-indigo-400 outline-none w-full text-center tabular-nums placeholder:opacity-10"
                                    value={debtPaymentAmount}
                                    onChange={e => setDebtPaymentAmount(e.target.value)}
                                  />
                                </div>
                              </div>

                              <div className="space-y-4">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block text-center opacity-50">{t('hr.paymentMethod')}</label>
                                <div className="grid grid-cols-2 gap-4">
                                  {(['cash', 'bank'] as const).map((method) => (
                                    <button
                                      key={method}
                                      type="button"
                                      onClick={() => setDebtPaymentMethod(method)}
                                      className={cn(
                                        "py-5 rounded-3xl border-2 font-black text-[10px] uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-3 relative overflow-hidden",
                                        debtPaymentMethod === method
                                          ? "border-indigo-600 bg-indigo-600 text-white shadow-xl shadow-indigo-200 dark:shadow-none scale-[1.02]"
                                          : "border-gray-50 dark:border-gray-900 text-gray-400 hover:border-indigo-100 dark:hover:border-indigo-800 bg-gray-50/50 dark:bg-gray-900/20"
                                      )}
                                    >
                                      {method === 'cash' ? <DollarSign className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
                                      {method === 'cash' ? t('dashboard.cash') : t('dashboard.bank')}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              
                              <div className="flex flex-col gap-3 pt-4">
                                <button 
                                  onClick={() => handleSettleDebt(selectedDebtEmployee, 'manual_payment')}
                                  className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-8 py-6 rounded-3xl font-black text-xs uppercase tracking-[0.3em] hover:from-indigo-700 hover:to-violet-700 transition-all shadow-xl shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-3 active:scale-[0.98]"
                                >
                                  {t('hr.confirmAndPay')}
                                </button>
                                <button 
                                  onClick={() => handleSettleDebt(selectedDebtEmployee, 'salary_deduction')}
                                  className="w-full text-indigo-500 dark:text-indigo-400 font-black text-[10px] uppercase tracking-[0.2em] py-4 rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all border border-transparent hover:border-indigo-100"
                                >
                                  {t('hr.salaryDeduction')}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">{t('hr.transactions')}</h3>
                  {isLoadingDebts ? (
                    <div className="py-20 flex justify-center"><LoadingSpinner /></div>
                  ) : debtRecords.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 font-bold italic">{t('hr.noDebtHistory')}</div>
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
                                {log.amount > 0 ? t('hr.shortageDebited') : (log.type === 'salary_deduction' ? t('hr.deductedFromSalary') : t('hr.paidInCash'))}
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
