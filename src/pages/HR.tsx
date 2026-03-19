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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                    <User className="w-5 h-5" />
                  </div>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">{employees.length}</span>
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('hr.totalEmployees')}</p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">
                    {employees.reduce((sum, emp) => sum + emp.salary, 0).toFixed(2)} ₼
                  </span>
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('hr.totalSalary')}</p>
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
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl border border-border relative overflow-hidden"
                >
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 z-10">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">
                      {editingEmployee ? t('hr.editEmployee') : t('hr.newEmployee')}
                    </h2>
                    <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all" title="Bağla">
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-10" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-3">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('hr.personalInfo')}</label>
                          <input title={t('hr.name')} placeholder={t('hr.name')} required className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                          <input title={t('hr.role')} placeholder={t('hr.role')} required className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} />
                          <input title={t('hr.workSchedule')} placeholder={t('hr.schedulePlaceholder')} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20" value={formData.work_schedule} onChange={e => setFormData({ ...formData, work_schedule: e.target.value })} />
                        </div>

                        <div className="space-y-3">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('hr.financeAndAccess')}</label>
                          <input title={t('hr.salary')} placeholder={t('hr.salary')} required type="number" className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20" value={formData.salary} onChange={e => setFormData({ ...formData, salary: e.target.value })} />
                          <input title={t('hr.bonusPercentage')} placeholder="Bonus %" required type="number" step="0.1" className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20" value={formData.bonus_percentage} onChange={e => setFormData({ ...formData, bonus_percentage: e.target.value })} />
                          <div className="grid grid-cols-2 gap-2">
                            {!editingEmployee && (
                              <input title={t('hr.username')} placeholder={t('hr.username')} required className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
                            )}
                            <input title={t('hr.password')} placeholder="••••" required={!editingEmployee} type="password" className={cn("w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20", editingEmployee && "col-span-2")} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all">{t('common.cancel')}</button>
                        <button type="submit" disabled={isSubmitting} className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-indigo-700 transition disabled:opacity-50">
                          {isSubmitting ? t('hr.saving') : (editingEmployee ? t('hr.update') : t('common.add'))}
                        </button>
                      </div>
                    </form>
                  </div>
                </motion.div>
              </div>
            )}

            {selectedHistoryEmployee && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" onClick={() => setSelectedHistoryEmployee(null)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-xl border border-border relative overflow-hidden"
                >
                  {/* Header */}
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800 z-10">
                    <div>
                      <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">{selectedHistoryEmployee.name}</h2>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{t('hr.salaryHistoryTitle')}</p>
                    </div>
                    <button 
                      onClick={() => setSelectedHistoryEmployee(null)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-10 space-y-3" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
                    {isLoadingHistory ? (
                      <div className="py-12 flex justify-center"><LoadingSpinner /></div>
                    ) : salaryHistory.length === 0 ? (
                      <div className="py-10 text-center text-gray-400 font-bold italic text-xs">{t('hr.noHistory')}</div>
                    ) : (
                      <div className="space-y-3">
                        {salaryHistory.map((log) => (
                          <div key={log.id} className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border border-gray-100 dark:border-gray-700 flex justify-between items-center group">
                            <div className="space-y-1">
                              <div className="flex items-center gap-3">
                                {log.old_salary !== log.new_salary && (
                                  <span className="text-xs font-bold text-emerald-600">{log.new_salary.toFixed(2)} ₼</span>
                                )}
                                {log.old_role !== log.new_role && (
                                  <span className="text-[10px] font-bold text-indigo-600 uppercase">{log.new_role}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Shield className="w-3 h-3 text-gray-400" />
                                <span className="text-[10px] text-gray-500 font-medium">{log.users?.name || 'Admin'}</span>
                                <span className="text-gray-300 dark:text-gray-600 px-1">•</span>
                                <span className="text-[10px] text-gray-400">{format(new Date(log.changed_at), 'dd.MM.yyyy HH:mm')}</span>
                              </div>
                            </div>
                            
                            {(log.old_salary !== log.new_salary) && (
                              <div className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-bold uppercase",
                                log.new_salary > log.old_salary ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                              )}>
                                {log.new_salary > log.old_salary ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {Math.abs(log.new_salary - log.old_salary).toFixed(2)} ₼
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}

            {selectedDebtEmployee && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" onClick={() => setSelectedDebtEmployee(null)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl border border-border relative overflow-hidden"
                >
                  {/* Header */}
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800 z-10">
                    <div>
                      <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">{selectedDebtEmployee.name}</h2>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{t('hr.debtBalance')}</p>
                    </div>
                    <button 
                      onClick={() => setSelectedDebtEmployee(null)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-10 space-y-6" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
                    {selectedDebtEmployee.total_debt > 0 && (
                      <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('hr.paymentAmount')}</span>
                          <span className="text-xl font-bold text-rose-500 tabular-nums">{selectedDebtEmployee.total_debt.toFixed(2)} ₼</span>
                        </div>
                        
                        <div className="space-y-4">
                          <div>
                            <div className="flex flex-wrap gap-2 mb-3">
                              {(['cash', 'bank'] as const).map((method) => (
                                <button
                                  key={method}
                                  onClick={() => setDebtPaymentMethod(method)}
                                  className={cn(
                                    "flex-1 py-2 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border",
                                    debtPaymentMethod === method 
                                      ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-indigo-300"
                                  )}
                                >
                                  {t(`pos.${method}`)}
                                </button>
                              ))}
                            </div>
                            <input
                              type="number"
                              value={debtPaymentAmount}
                              onChange={(e) => setDebtPaymentAmount(e.target.value)}
                              className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3 text-lg font-bold text-gray-900 dark:text-white focus:border-indigo-500 outline-none transition-all text-center"
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-2">
                            <button 
                              onClick={() => handleSettleDebt(selectedDebtEmployee, 'manual_payment')}
                              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold text-[9px] uppercase tracking-widest hover:bg-indigo-700 transition"
                            >
                              {t('hr.confirmAndPay')}
                            </button>
                            <button 
                              onClick={() => handleSettleDebt(selectedDebtEmployee, 'salary_deduction')}
                              className="w-full text-indigo-500 font-bold text-[9px] uppercase tracking-widest py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition rounded-lg"
                            >
                              {t('hr.salaryDeduction')}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">{t('hr.transactions')}</h3>
                      {isLoadingDebts ? (
                        <div className="py-10 flex justify-center"><LoadingSpinner /></div>
                      ) : debtRecords.length === 0 ? (
                        <div className="py-8 text-center text-gray-400 font-bold italic text-xs">{t('hr.noDebtHistory')}</div>
                      ) : (
                        <div className="space-y-2">
                          {debtRecords.map((log) => (
                            <div key={log.id} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 flex items-center justify-between group">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center",
                                  log.amount > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                                )}>
                                  {log.amount > 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                                </div>
                                <div>
                                  <p className="text-[11px] font-bold text-gray-900 dark:text-white leading-tight">
                                    {log.amount > 0 ? t('hr.shortageDebited') : (log.type === 'salary_deduction' ? t('hr.deductedFromSalary') : t('hr.paidInCash'))}
                                  </p>
                                  <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">{format(new Date(log.created_at), 'dd.MM.yyyy HH:mm')}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={cn("text-xs font-bold tabular-nums", log.amount > 0 ? "text-rose-500" : "text-emerald-500")}>
                                  {log.amount > 0 ? '+' : ''}{log.amount.toFixed(2)} ₼
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}

