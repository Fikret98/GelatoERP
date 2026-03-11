import React, { useState, useEffect } from 'react';
import { Plus, Search, User, Calendar, DollarSign, Edit2, TrendingUp, History } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import LoadingSpinner from '../components/ui/LoadingSpinner';

export default function HR() {
  const { t } = useLanguage();
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
    bonus_percentage: '0.8'
  });
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedHistoryEmployee, setSelectedHistoryEmployee] = useState<any | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

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

  const fetchData = async () => {
    try {
      setIsLoadingPage(true);
      const [
        { data: usersData, error: userErr },
        { data: bonusData }
      ] = await Promise.all([
        supabase.from('users').select('*, employees!employees_user_id_fkey(*)').order('name'),
        supabase.from('seller_bonuses_view').select('*')
      ]);

      if (userErr) throw userErr;

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
          isSystemUser: true
        };
      });

      setEmployees(merged);
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
      role: employee.job_title || '', // Correctly use the business job title
      salary: (employee.salary || 0).toString(),
      hire_date: employee.hire_date || format(new Date(), 'yyyy-MM-dd'),
      username: employee.username || '',
      password: employee.password || '',
      email: employee.email || '',
      phone: employee.phone || '',
      address: employee.address || '',
      user_role: employee.role || 'user', // Correctly use the system role from the users table
      bonus_percentage: (employee.bonus_percentage || 0.8).toString()
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
            changed_by: (await supabase.auth.getUser()).data.user?.id || null 
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
          hire_date: formData.hire_date
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
          hire_date: formData.hire_date
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
        bonus_percentage: '0.8'
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.hr')}</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center hover:bg-indigo-700 transition"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('hr.newEmployee')}
        </button>
      </div>

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
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {employees.map((employee) => (
          <motion.div
            key={employee.id}
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0 }
            }}
            whileHover={{ y: -5 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 mr-4">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{employee.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{employee.job_title}</p>
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
              <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg flex justify-between items-center">
                <span className="text-xs font-bold text-green-700 dark:text-green-400">Satış Bonusu ({employee.bonus_percentage || 0.8}%):</span>
                <span className="text-sm font-black text-green-600 dark:text-green-300">
                  {(bonuses.find(b => b.seller_name?.toLowerCase().trim() === employee.name?.toLowerCase().trim())?.total_bonus || 0).toFixed(2)} ₼
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <AnimatePresence>
        {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[60] p-0 lg:p-4">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('hr.fullName')}</label>
                  <input required type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vəzifə (Məs: Barista)</label>
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
                    <div className="grid grid-cols-2 gap-4">
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Satış Bonusu (%)</label>
                        <input
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
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
    </motion.div>
  );
}
