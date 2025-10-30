import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAnalyticsFilters } from '@/state/useAnalyticsFilters';
import DateRangePicker from './DateRangePicker';
import MultiSelect from '../ui/MultiSelect';
import { Select } from '../ui/Select';
import { Button } from '../ui/button';
import { SlidersHorizontal, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AdvancedFiltersPanel: React.FC<{ filterOptions: any }> = ({ filterOptions }) => {
    const { territories, stages, docsReady, setFilters } = useAnalyticsFilters();
    const toOptions = (items: string[]) => items.map(item => ({ label: item, value: item }));

    const handleResetAdvanced = () => {
        setFilters({ territories: [], stages: [], docsReady: null });
    };

    return (
        <motion.div
            key="advanced-filters"
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: 'auto', opacity: 1, marginTop: '1rem' }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
        >
            <div className="border-t border-sky-100 dark:border-sky-900/20 pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <MultiSelect
                        label="Territories"
                        options={toOptions(filterOptions?.territories || [])}
                        selected={territories}
                        onChange={(selected) => setFilters({ territories: selected })}
                    />
                    <MultiSelect
                        label="Stages"
                        options={toOptions(filterOptions?.stages || [])}
                        selected={stages}
                        onChange={(selected) => setFilters({ stages: selected })}
                    />
                    <Select
                        label="Docs Ready Status"
                        value={docsReady === null ? 'all' : String(docsReady)}
                        onChange={(e) => setFilters({ docsReady: e.target.value === 'all' ? null : e.target.value === 'true' })}
                        options={[
                            { label: 'All', value: 'all' },
                            { label: 'Ready', value: 'true' },
                            { label: 'Not Ready', value: 'false' },
                        ]}
                    />
                </div>
                <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={handleResetAdvanced}>
                        <X className="h-4 w-4 mr-1" />
                        Reset Advanced Filters
                    </Button>
                </div>
            </div>
        </motion.div>
    );
};

const AnalyticsFilterBar: React.FC = () => {
  const { dateRange, groupByDimension, groupByPeriod, payers, setFilters } = useAnalyticsFilters();
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const { data: filterOptions } = useQuery({
    queryKey: ['analytics_filter_options'],
    queryFn: async () => {
      const [payersRes, territoriesRes, stagesRes] = await Promise.all([
        supabase.from('patients').select('primary_insurance'),
        supabase.from('orders').select('payer_region'),
        supabase.from('orders').select('workflow_stage'),
      ]);
      const unique = (arr: any[], key: string) => [...new Set(arr.map(item => item[key]).filter(Boolean))].sort();
      return {
        payers: unique(payersRes.data || [], 'primary_insurance'),
        territories: unique(territoriesRes.data || [], 'payer_region'),
        stages: unique(stagesRes.data || [], 'workflow_stage'),
      };
    },
  });

  const toOptions = (items: string[]) => items.map(item => ({ label: item, value: item }));

  return (
    <div className="bg-gradient-to-r from-sky-100/50 via-white to-sky-50/50 dark:from-zinc-900/50 dark:via-zinc-900 dark:to-zinc-900/50 rounded-xl p-3 shadow-sm border border-sky-100 dark:border-sky-900/50">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <DateRangePicker value={dateRange} onChange={(value) => setFilters({ dateRange: value })} />
            <Select
                label="Group By"
                value={groupByDimension}
                onChange={(e) => setFilters({ groupByDimension: e.target.value as any })}
                options={[
                    { label: 'Time', value: 'time' },
                    { label: 'Payer', value: 'payer' },
                    { label: 'Territory', value: 'territory' },
                    { label: 'Stage', value: 'stage' },
                ]}
            />
            {groupByDimension === 'time' && (
                <Select
                    label="Period"
                    value={groupByPeriod}
                    onChange={(e) => setFilters({ groupByPeriod: e.target.value as any })}
                    options={[
                        { label: 'Week', value: 'week' },
                        { label: 'Month', value: 'month' },
                        { label: 'Quarter', value: 'quarter' },
                        { label: 'Year', value: 'year' },
                    ]}
                />
            )}
            <MultiSelect
                label="Payers"
                options={toOptions(filterOptions?.payers || [])}
                selected={payers}
                onChange={(selected) => setFilters({ payers: selected })}
            />
            <Button variant="outline" onClick={() => setIsAdvancedOpen(prev => !prev)}>
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Advanced
            </Button>
        </div>
        <AnimatePresence>
            {isAdvancedOpen && <AdvancedFiltersPanel filterOptions={filterOptions} />}
        </AnimatePresence>
    </div>
  );
};

export default AnalyticsFilterBar;
