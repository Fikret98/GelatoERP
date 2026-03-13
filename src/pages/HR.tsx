import React, { useState, useEffect } from 'react';
import { Plus, Search, User, Calendar, DollarSign, Edit2, TrendingUp, History } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { cn } from '../lib/utils';

export default function HR() {
  const { t } = useLanguage();
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
  const [pendingAudits, setPendingAudits] = useState<any[]>([]);
  const [isLoadingAudits, setIsLoadingAudits] = useState(false);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('');

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
  }, [showModal, selectedHistoryEmployee]);

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
          status: 'paid'
        }]);

      if (error) throw error;
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

      // Group debts by user
      const debtMap = (debtsData || []).reduce((acc: any, curr: any) => {
        acc[curr.user_id] = (acc[curr.user_id] || 0) + curr.amount;
        return acc;
      }, {});

      // Group CURRENT MONTH salary deductions by user
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const currentMonthDeductions = (debtsData || [])
        .filter(d => d.type === 'salary_deduction' && d.created_at >= firstDayOfMonth)
        .reduce((acc: any, curr: any) => {
          acc[curr.user_id] = (acc[curr.user_id] || 0) + Math.abs(curr.amount);
          return acc;
        }, {});

      // Merge data: users with their nested employee data
      const merged = (usersData || []).map(u => {
        const emp = u.employees?.[0]; // One-to-one relationship
        return {
          ...u,
          id: u.id,
          name: u.name,
          role_type: u.role, // system role (admin/user)
          job_title: emp?.job_title || 'İşçi', // business role (Barista, etc)
          salary: emp?.salary || 0,
          hire_date: emp?.hire_date || null,
          work_schedule: emp?.work_schedule || '',
          total_debt: debtMap[u.id] || 0,
          current_month_deductions: currentMonthDeductions[u.id] || 0,
          isSystemUser: true
        };
      });

      setEmployees(merged);
      setBonuses(bonusData || []);
      fetchPendingAudits();
    } catch (e) {
      console.error(e);
      toast.error('Məlumatlar yüklənərkən xəta');
    } finally {
      setIsLoadingPage(false);
    }
  };

  const fetchPendingAudits = async () => {
    setIsLoadingAudits(true);
    try {
      const [{ data: expAudits }, { data: incAudits }] = await Promise.all([
        supabase.from('expenses').select('*').eq('category', 'Növbə Arası (Araşdırılır)'),
        supabase.from('incomes').select('*').eq('category', 'Növbə Arası (Araşdırılır)')
      ]);

      const mergedAudits = [
        ...(expAudits || []).map(a => ({ ...a, auditType: 'shortage' })),
        ...(incAudits || []).map(a => ({ ...a, auditType: 'excess' }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setPendingAudits(mergedAudits);
    } catch (e) {
      console.error('Error fetching audits:', e);
    } finally {
      setIsLoadingAudits(false);
    }
  };

  const handleResolveAudit = async (audit: any, userId: string | null, type: 'debt' | 'expense' | 'income') => {
    try {
      if (type === 'debt' && userId) {
        // 1. Record the debt
        const { error: debtErr } = await supabase.from('employee_debts').insert([{
          user_id: userId,
          amount: audit.auditType === 'shortage' ? audit.amount : -audit.amount,
          type: audit.auditType === 'shortage' ? 'shortage' : 'excess',
          notes: `Növbə arası fərq tənzimləməsi (Tarix: ${format(new Date(audit.date), 'dd.MM.yyyy')})`
        }]);
        if (debtErr) throw debtErr;

        // 2. Update the audit record category to mark as resolved
        const table = audit.auditType === 'shortage' ? 'expenses' : 'incomes';
        const { error: auditErr } = await supabase
          .from(table)
          .update({ 
            category: audit.auditType === 'shortage' ? 'İşçi Borcu (Kəsir)' : 'Kassa Artığı',
            description: audit.description + ` (Təsdiqləndi: ${userId} borcuna yazıldı)`
          })
          .eq('id', audit.id);
        if (auditErr) throw auditErr;

      } else if (type === 'expense' || type === 'income') {
        // Owner withdrawal - just update category
        const table = audit.auditType === 'shortage' ? 'expenses' : 'incomes';
        await supabase
          .from(table)
          .update({ 
            category: audit.auditType === 'shortage' ? 'Sahibkar Götürdü' : 'Digər Mədaxil',
            description: audit.description + ' (Təsdiqləndi: Sahibkar tərəfindən tənzimləndi)'
          })
          .eq('id', audit.id);
      }

      toast.success('Uğurla tənzimləndi');
      fetchData();
    } catch (e: any) {
      toast.error('Xəta: ' + e.message);
    }
  };

  const handleEdit = (employee: any) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name || '',
      role: employee.job_title || '', // Correctly use the business job title
      salary: (employee.salary || 0).toString(),
      hire_date: employee.hire_date || format(new Date(), 'yyyy-MM-dd'),
      username: employee.username || '',
      password: employee.password || '',
      email: employee.email || '',
      phone: employee.phone || '',
      address: employee.address || '',
      user_role: employee.role || 'user', // Correctly use the system role from the users table
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
        // --- EDIT LOGIC ---
        
        // 1. Log to salary_history if salary, bonus or role changed
        const oldSalary = editingEmployee.salary;
        const newSalary = parseFloat(formData.salary);
        const oldBonus = editingEmployee.bonus_percentage;
        const newBonus = parseFloat(formData.bonus_percentage);
        const oldRole = editingEmployee.role;
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
            change_type: oldRole !== newRole ? 'promotion' : 'salary_change',
            note: 'Manual update from HR module',
            changed_by: user?.id ? parseInt(user.id) : null
          }]);
        }

        // 2. Update users table
        const { error: userErr } = await supabase.from('users').update({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          role: formData.user_role,
          bonus_percentage: newBonus,
          // Only update password if it's changed and not empty
          ...(formData.password && formData.password !== editingEmployee.password ? { password: formData.password } : {})
        }).eq('id', editingEmployee.id);

        if (userErr) throw userErr;

        // 3. Update employees table
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
        // --- ADD LOGIC ---
        // 1. Create user account first to get ID
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

        // 2. Create employee record linked to user
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
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Xəta baş verdi: ' + e.message);
    } finally {
      setIsSubmitting(false);
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
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl flex items-center hover:bg-indigo-700 transition text-xs sm:text-sm font-bold"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
          {t('hr.newEmployee')}
        </button>
      </div>

      {pendingAudits.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-amber-600 dark:text-amber-400 rotate-180" />
            <h2 className="text-lg font-bold text-amber-900 dark:text-amber-100 uppercase tracking-tight">Növbə Arası (Araşdırılır)</h2>
          </div>
          <div className="space-y-4">
            {pendingAudits.map((audit) => {
              // Parse user IDs from description if present
              const prevUserNameMatch = audit.description?.match(/Əvvəlki işçi: ([^,]+)/);
              const newUserNameMatch = audit.description?.match(/Yeni işçi: ([^,]+)/);
              const prevUserName = prevUserNameMatch ? prevUserNameMatch[1].trim() : null;
              const newUserName = newUserNameMatch ? newUserNameMatch[1].trim() : null;

              const prevEmployee = employees.find(e => e.name === prevUserName);
              const newEmployee = employees.find(e => e.name === newUserName);

              return (
                <div key={audit.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-amber-100 dark:border-amber-900/20 shadow-sm flex flex-col lg:flex-row justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded",
                        audit.auditType === 'shortage' ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                      )}>
                        {audit.auditType === 'shortage' ? 'Kəsir' : 'Artıq'}
                      </span>
                      <span className="text-sm font-black text-gray-900 dark:text-white">
                        {audit.amount.toFixed(2)} ₼
                      </span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(audit.date), 'dd.MM.yyyy HH:mm')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 italic mb-2">"{audit.description}"</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleResolveAudit(audit, prevEmployee?.id || null, 'debt')}
                      disabled={!prevEmployee}
                      className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs font-bold rounded-lg transition-colors border border-transparent hover:border-red-200 disabled:opacity-50"
                    >
                      {prevEmployee ? prevEmployee.name : (prevUserName || 'Əvvəlki işçi')}-ə yaz
                    </button>
                    <button
                      onClick={() => handleResolveAudit(audit, newEmployee?.id || null, 'debt')}
                      disabled={!newEmployee}
                      className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs font-bold rounded-lg transition-colors border border-transparent hover:border-red-200 disabled:opacity-50"
                    >
                      {newEmployee ? newEmployee.name : (newUserName || 'Yeni işçi')}-ə yaz
                    </button>
                    <button
                      onClick={() => handleResolveAudit(audit, null, audit.auditType === 'shortage' ? 'expense' : 'income')}
                      className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                      Mən götürmüşəm (Xərc)
                    </button>
                  </div>
                </div>
              );
            })}
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
        {employees.map((employee) => (
          <motion.div
            key={employee.id}
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0 }
            }}
            whileHover={{ y: -5 }}
            className={cn(
              "bg-white dark:bg-gray-800 rounded-2xl shadow-sm border p-6 transition group relative overflow-hidden",
              employee.role === 'admin' 
                ? "border-indigo-500/50 dark:border-indigo-400/50 shadow-indigo-100/50 dark:shadow-indigo-900/20" 
                : "border-gray-100 dark:border-gray-700 hover:shadow-md"
            )}
          >
            {employee.role === 'admin' && (
              <div className="absolute top-0 right-0 px-3 py-1 bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-bl-xl shadow-sm z-10">
                ADMİN
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center mr-4 shadow-inner transition-colors",
                  employee.role === 'admin' 
                    ? "bg-indigo-600 text-white shadow-indigo-200 dark:shadow-indigo-900/30" 
                    : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                )}>
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">{employee.name}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{employee.job_title}</p>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <button 
                  onClick={() => fetchSalaryHistory(employee)}
                  className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  title="Tarixçəyə bax"
                >
                  <History className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => fetchDebtHistory(employee)}
                  className={cn(
                    "p-2 transition-colors",
                    employee.total_debt > 0 ? "text-red-500 hover:text-red-600" : "text-gray-400 hover:text-indigo-600"
                  )}
                  title="Borclara bax"
                >
                  <DollarSign className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => handleEdit(employee)}
                  className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  title={t('common.edit')}
                >
                  <Edit2 className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <DollarSign className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                {t('hr.salary')}: <span className="font-bold text-gray-900 dark:text-white ml-1">{employee.salary} ₼</span>
              </div>
              <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <Calendar className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                {t('hr.hireDate')}: <span className="font-medium text-gray-900 dark:text-white ml-1">{employee.hire_date ? format(new Date(employee.hire_date), 'dd.MM.yyyy') : '-'}</span>
              </div>
              <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <History className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                İş Qrafiki: <span className="font-medium text-gray-900 dark:text-white ml-1">{employee.work_schedule || '-'}</span>
              </div>
              <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg flex justify-between items-center">
                <span className="text-xs font-bold text-green-700 dark:text-green-400">Satış Bonusu ({employee.bonus_percentage || 0.8}%):</span>
                <span className="text-sm font-black text-green-600 dark:text-green-300">
                  {(bonuses.find(b => b.seller_name?.toLowerCase().trim() === employee.name?.toLowerCase().trim())?.total_bonus || 0).toFixed(2)} ₼
                </span>
              </div>
              {employee.total_debt > 0 && (
                <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg flex justify-between items-center text-red-700 dark:text-red-400">
                  <span className="text-xs font-bold">Cari Borc (Kəsirlər):</span>
                  <span className="text-sm font-black">
                    {employee.total_debt.toFixed(2)} ₼
                  </span>
                </div>
              )}
              
              <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800 shadow-sm relative overflow-hidden group/payable">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Ödəniləcək Cəmi</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-bold italic">Bu ay üçün</span>
                </div>
                <div className="flex justify-between items-end">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500 font-bold">Maaş + Bonus - Çıxılan</span>
                    {employee.current_month_deductions > 0 && (
                      <span className="text-[10px] text-red-500 font-black mt-0.5 tracking-tight animate-pulse">
                        -{employee.current_month_deductions.toFixed(2)} ₼ kəsilib
                      </span>
                    )}
                  </div>
                  <span className="text-lg font-black text-indigo-700 dark:text-indigo-300">
                    {(
                      (employee.salary || 0) + 
                      (bonuses.find(b => b.seller_name?.toLowerCase().trim() === employee.name?.toLowerCase().trim())?.total_bonus || 0) - 
                      (employee.current_month_deductions || 0)
                    ).toFixed(2)} ₼
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <AnimatePresence>
        {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto overflow-x-hidden touch-pan-y pb-28 lg:pb-8"
          >
            <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingEmployee ? 'İşçi məlumatlarını redaktə et' : t('hr.addEmployeeTitle')}
              </h2>
              <button 
                onClick={() => { setShowModal(false); setEditingEmployee(null); }} 
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title={t('common.cancel')}
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label htmlFor="hr-full-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('hr.fullName')}</label>
                  <input id="hr-full-name" title={t('hr.fullName')} required type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="hr-job-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vəzifə (Məs: Barista)</label>
                  <input id="hr-job-title" title="Vəzifə" required type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="hr-work-schedule" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">İş Qrafiki (Məs: 09:00 - 18:00)</label>
                  <input id="hr-work-schedule" title="İş Qrafiki" type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.work_schedule} onChange={e => setFormData({ ...formData, work_schedule: e.target.value })} placeholder="09:00 - 18:00" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('hr.salary')} (₼)</label>
                    <input id="hr-salary" title={t('hr.salary')} required type="number" step="0.01" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.salary} onChange={e => setFormData({ ...formData, salary: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="hr-hire-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('hr.hireDate')}</label>
                    <input id="hr-hire-date" title={t('hr.hireDate')} required type="date" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.hire_date} onChange={e => setFormData({ ...formData, hire_date: e.target.value })} />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-2">
                  <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-3">Sistem Giriş Məlumatları</p>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="hr-username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">İstifadəçi adı</label>
                        <input id="hr-username" title="İstifadəçi adı" required type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} placeholder="mammad" />
                      </div>
                      <div>
                        <label htmlFor="hr-password" title="Şifrə" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Şifrə</label>
                        <input id="hr-password" title="Şifrə" required type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="123456" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="hr-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                        <input id="hr-email" title="Email" required type="email" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="mammad@gelato.az" />
                      </div>
                      <div>
                        <label htmlFor="hr-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telefon</label>
                        <input id="hr-phone" title="Telefon" type="tel" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+994" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="hr-system-role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sistem Rolu</label>
                        <select
                          id="hr-system-role"
                          title="Sistem Rolu"
                          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2"
                          value={formData.user_role}
                          onChange={e => setFormData({ ...formData, user_role: e.target.value as 'admin' | 'user' })}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="hr-bonus" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Satış Bonusu (%)</label>
                        <input
                          id="hr-bonus"
                          required
                          type="number"
                          step="0.01"
                          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2"
                          value={formData.bonus_percentage}
                          onChange={e => setFormData({ ...formData, bonus_percentage: e.target.value })}
                          title="Satış Bonusu (%)"
                          placeholder="0.8"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col-reverse lg:flex-row justify-end gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => { setShowModal(false); setEditingEmployee(null); }} 
                  className="w-full lg:w-auto px-4 py-3 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full lg:w-auto px-4 py-3 lg:py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-50 flex items-center justify-center"
                >
                  {isSubmitting ? 'Gözləyin...' : (editingEmployee ? t('common.save') : t('common.add'))}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedHistoryEmployee && (
          <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-lg shadow-2xl overflow-y-auto flex flex-col max-h-[85vh] lg:max-h-[80vh] touch-pan-y pb-28 lg:pb-8"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Dəyişiklik Tarixçəsi</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{selectedHistoryEmployee.name}</p>
                </div>
                <button
                  onClick={() => setSelectedHistoryEmployee(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                  title={t('common.cancel')}
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {isLoadingHistory ? (
                  <div className="py-12 flex justify-center">
                    <LoadingSpinner message="Yüklənir..." />
                  </div>
                ) : salaryHistory.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Heç bir tarixçə tapılmadı.</p>
                  </div>
                ) : (
                  <div className="space-y-6 relative before:absolute before:inset-0 before:left-4 before:w-0.5 before:bg-gray-100 dark:before:bg-gray-700 before:h-full">
                    {salaryHistory.map((log, idx) => (
                      <div key={log.id} className="relative pl-10">
                        <div className="absolute left-2.5 top-1.5 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-gray-800" />
                        <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                          <div className="flex justify-between items-start mb-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              log.change_type === 'promotion' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {log.change_type === 'promotion' ? 'Vəzifə Artımı' : 'Maaş Dəyişikliyi'}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                              {format(new Date(log.changed_at), 'dd.MM.yyyy')}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 mt-3">
                            {log.old_salary !== log.new_salary && (
                              <div>
                                <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{t('hr.salary')}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-xs line-through text-gray-400">{log.old_salary} ₼</span>
                                  <TrendingUp className="w-3 h-3 text-green-500" />
                                  <span className="text-sm font-bold text-gray-900 dark:text-white">{log.new_salary} ₼</span>
                                </div>
                              </div>
                            )}
                            {log.old_bonus_percentage !== log.new_bonus_percentage && (
                              <div>
                                <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Bonus %</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-xs line-through text-gray-400">{log.old_bonus_percentage}%</span>
                                  <TrendingUp className="w-3 h-3 text-green-500" />
                                  <span className="text-sm font-bold text-gray-900 dark:text-white">{log.new_bonus_percentage}%</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {log.old_role !== log.new_role && (
                            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                              <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{t('hr.role')}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-gray-400">{log.old_role}</span>
                                <span className="text-xs text-gray-500">→</span>
                                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{log.new_role}</span>
                              </div>
                            </div>
                          )}
                          
                          {log.note && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">"{log.note}"</p>}
                          <p className="text-[9px] text-gray-400 mt-2 text-right italic">Tərəfindən: {log.users?.name || 'Sistem'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </>
      )}
      <AnimatePresence>
        {selectedDebtEmployee && (
          <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-lg shadow-2xl overflow-y-auto flex flex-col max-h-[85vh] lg:max-h-[80vh] touch-pan-y pb-28 lg:pb-8"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Borc və Kəsir Tarixçəsi</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{selectedDebtEmployee.name}</p>
                </div>
                <button
                  onClick={() => setSelectedDebtEmployee(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                  title={t('common.cancel')}
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-900/30 flex justify-between items-center sm:block">
                  <div>
                    <p className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-1">Cari Borc</p>
                    <p className="text-2xl font-black text-red-700 dark:text-red-300">{selectedDebtEmployee.total_debt.toFixed(2)} ₼</p>
                  </div>
                  <div className="mt-0 sm:mt-4 text-left sm:text-right">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Ödəniş Məbləği</p>
                    <input
                      type="number"
                      step="0.01"
                      className="w-24 border-b-2 border-red-200 dark:border-red-900 bg-transparent text-xl font-black text-red-700 dark:text-red-300 outline-none text-right"
                      value={debtPaymentAmount}
                      onChange={e => setDebtPaymentAmount(e.target.value)}
                      title="Ödəniş məbləği"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleSettleDebt(selectedDebtEmployee, 'salary_deduction')}
                    disabled={selectedDebtEmployee.total_debt <= 0 || !debtPaymentAmount}
                    className="flex-1 bg-indigo-600 text-white rounded-xl text-[10px] font-bold hover:bg-indigo-700 py-2 disabled:opacity-50"
                  >
                    Maaşdan Çıx
                  </button>
                  <button
                    onClick={() => handleSettleDebt(selectedDebtEmployee, 'manual_payment')}
                    disabled={selectedDebtEmployee.total_debt <= 0 || !debtPaymentAmount}
                    className="flex-1 border border-emerald-500 text-emerald-600 rounded-xl text-[10px] font-bold hover:bg-emerald-50 py-2 disabled:opacity-50"
                  >
                    Nağd Ödəniş
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                {isLoadingDebts ? (
                  <div className="py-12 flex justify-center">
                    <LoadingSpinner message="Yüklənir..." />
                  </div>
                ) : debtRecords.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400 italic">
                    Heç bir borc yazısı tapılmadı.
                  </div>
                ) : (
                  debtRecords.map((record) => (
                    <div key={record.id} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800 flex justify-between items-center transition-colors">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded",
                            record.amount > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                          )}>
                            {record.type === 'shortage' ? 'Kəsir' : record.type === 'salary_deduction' ? 'Maaşdan Çıxılış' : 'Ödəniş'}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium">
                            {format(new Date(record.created_at), 'dd.MM.yyyy')}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{record.notes}</p>
                      </div>
                      <span className={cn(
                        "text-sm font-black tabular-nums",
                        record.amount > 0 ? "text-red-600" : "text-emerald-600"
                      )}>
                        {record.amount > 0 ? '+' : ''}{record.amount.toFixed(2)} ₼
                      </span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
