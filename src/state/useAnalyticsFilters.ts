import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { subDays } from 'date-fns';
import type { AnalyticsFilters } from '@/lib/types';

const initialState: AnalyticsFilters = {
  dateRange: { from: subDays(new Date(), 89), to: new Date() },
  groupByPeriod: 'week',
  groupByDimension: 'time',
  territories: [],
  payers: [],
  stages: [],
  docsReady: null,
};

interface AnalyticsFilterState extends AnalyticsFilters {
  setFilters: (patch: Partial<AnalyticsFilters>) => void;
  reset: () => void;
}

export const useAnalyticsFilters = create<AnalyticsFilterState>()(
  persist(
    (set) => ({
      ...initialState,
      setFilters: (patch) => set((state) => ({ ...state, ...patch })),
      reset: () => set(initialState),
    }),
    {
      name: 'analytics-filters-storage',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              dateRange: {
                from: new Date(state.dateRange.from),
                to: new Date(state.dateRange.to),
              },
            },
          };
        },
        setItem: (name, newValue) => {
          localStorage.setItem(name, JSON.stringify(newValue));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
