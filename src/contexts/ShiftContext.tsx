import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { toast } from 'react-hot-toast';

interface Shift {
  id: string;
  user_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  status: 'open' | 'closed';
}

interface ShiftContextType {
  activeShift: Shift | null;
  loading: boolean;
  openShift: (openingBalance: number) => Promise<void>;
  closeShift: (actualBalance: number, notes?: string) => Promise<void>;
  refreshShift: () => Promise<void>;
  getExpectedCash: () => Promise<number>;
  getLastShiftClosingBalance: () => Promise<number>;
}

const ShiftContext = createContext<ShiftContextType | undefined>(undefined);

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshShift = async () => {
    if (!user) {
      setActiveShift(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_active_shift', {
        p_user_id: user.id
      });

      if (error) throw error;
      setActiveShift(data && data.length > 0 ? data[0] : null);
    } catch (e) {
      console.error('Error fetching shift:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshShift();
  }, [user]);

  const openShift = async (openingBalance: number) => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shifts')
        .insert([{
          user_id: user.id,
          opening_balance: openingBalance,
          status: 'open'
        }])
        .select()
        .single();

      if (error) throw error;
      setActiveShift(data);
      toast.success('Növbə açıldı');
    } catch (e: any) {
      toast.error('Növbə açılarkən xəta: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const closeShift = async (actualBalance: number, notes?: string) => {
    if (!activeShift) return;
    setLoading(true);
    try {
      // 1. Get current totals for this shift
      const [{ data: salesData }, { data: expData }, { data: incData }] = await Promise.all([
        supabase.from('sales').select('total_amount, payment_method').eq('shift_id', activeShift.id),
        supabase.from('expenses').select('amount, payment_method').eq('shift_id', activeShift.id),
        supabase.from('incomes').select('amount, payment_method').eq('shift_id', activeShift.id)
      ]);

      const cashSales = (salesData || [])
        .filter(s => s.payment_method === 'cash')
        .reduce((sum, s) => sum + s.total_amount, 0);
      const cardSales = (salesData || [])
        .filter(s => s.payment_method === 'card')
        .reduce((sum, s) => sum + s.total_amount, 0);

      const cashIncomes = (incData || [])
        .filter(i => i.payment_method === 'cash')
        .reduce((sum, i) => sum + i.amount, 0);
      const cardIncomes = (incData || [])
        .filter(i => i.payment_method === 'card')
        .reduce((sum, i) => sum + i.amount, 0);

      const cashExpenses = (expData || [])
        .filter(e => e.payment_method === 'cash')
        .reduce((sum, e) => sum + e.amount, 0);
      const cardExpenses = (expData || [])
        .filter(e => e.payment_method === 'card')
        .reduce((sum, e) => sum + e.amount, 0);
      
      const expectedCash = activeShift.opening_balance + cashSales + cashIncomes - cashExpenses;

      // 2. Update the shift record
      const { error } = await supabase
        .from('shifts')
        .update({
          closed_at: new Date().toISOString(),
          status: 'closed',
          actual_cash_balance: actualBalance,
          expected_cash_balance: expectedCash,
          cash_sales: cashSales,
          card_sales: cardSales,
          total_incomes: cashIncomes + cardIncomes,
          total_expenses: cashExpenses + cardExpenses,
          notes: notes
        })
        .eq('id', activeShift.id);

      if (error) throw error;
      
      // 3. Record shortage/excess as financial adjustment to sync system balance
      const shortage = expectedCash - actualBalance;
      if (shortage !== 0) {
        if (shortage > 0) {
          // It's a shortage (kəsir) -> Record as Expense and Debt
          await Promise.all([
            supabase.from('employee_debts').insert([{
              user_id: activeShift.user_id,
              shift_id: activeShift.id,
              amount: shortage,
              type: 'shortage',
              notes: `Növbə #${activeShift.id} kəsiri`
            }]),
            supabase.from('expenses').insert([{
              date: new Date().toISOString(),
              category: 'Kassa Kəsiri',
              amount: shortage,
              description: `Növbə #${activeShift.id} kəsiri (Avtomatik tənzimləmə)`,
              payment_method: 'cash',
              user_id: activeShift.user_id,
              shift_id: activeShift.id
            }])
          ]);
        } else {
          // It's an excess (artıq) -> Record as Income
          const excess = Math.abs(shortage);
          await supabase.from('incomes').insert([{
            date: new Date().toISOString(),
            category: 'Kassa Artığı',
            amount: excess,
            description: `Növbə #${activeShift.id} artığı (Avtomatik tənzimləmə)`,
            payment_method: 'cash',
            user_id: activeShift.user_id,
            shift_id: activeShift.id
          }]);
        }
      }

      setActiveShift(null);
      toast.success('Növbə bağlandı');
    } catch (e: any) {
      toast.error('Növbə bağlanarkən xəta: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const getExpectedCash = async (): Promise<number> => {
    if (!activeShift) return 0;
    try {
      const [{ data: salesData }, { data: expData }, { data: incData }] = await Promise.all([
        supabase.from('sales').select('total_amount').eq('shift_id', activeShift.id).eq('payment_method', 'cash'),
        supabase.from('expenses').select('amount').eq('shift_id', activeShift.id).eq('payment_method', 'cash'),
        supabase.from('incomes').select('amount').eq('shift_id', activeShift.id).eq('payment_method', 'cash')
      ]);

      const cashSales = (salesData || []).reduce((sum, s) => sum + s.total_amount, 0);
      const cashIncomes = (incData || []).reduce((sum, i) => sum + i.amount, 0);
      const cashExpenses = (expData || []).reduce((sum, e) => sum + e.amount, 0);
      
      return activeShift.opening_balance + cashSales + cashIncomes - cashExpenses;
    } catch (e) {
      console.error('Error calculating expected cash:', e);
      return activeShift.opening_balance;
    }
  };

  const getLastShiftClosingBalance = async (): Promise<number> => {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('actual_cash_balance')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data?.actual_cash_balance || 0;
    } catch (e) {
      console.error('Error fetching last shift balance:', e);
      return 0;
    }
  };

  return (
    <ShiftContext.Provider value={{ 
      activeShift, 
      loading, 
      openShift, 
      closeShift, 
      refreshShift,
      getExpectedCash,
      getLastShiftClosingBalance
    }}>
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift() {
  const context = useContext(ShiftContext);
  if (context === undefined) {
    throw new Error('useShift must be used within a ShiftProvider');
  }
  return context;
}
