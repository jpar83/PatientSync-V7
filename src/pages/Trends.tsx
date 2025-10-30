import React from "react";
import { useQuery } from '@tanstack/react-query';
import { supabase } from "../lib/supabaseClient";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";
import { Loader2, TrendingUp, Calendar, CheckCircle2 } from "lucide-react";
import { useAnalyticsFilters } from '@/state/useAnalyticsFilters';
import AnalyticsFilterBar from '@/components/dashboard/AnalyticsFilterBar';
import EmptyState from "@/components/ui/EmptyState";
import AnalyticsKpiCard from "@/components/dashboard/AnalyticsKpiCard";

const CustomLegend = ({ payload }: any) => (
    <div className="flex justify-center items-center gap-2 mb-4">
        {payload.map((entry: any, index: any) => (
            <div key={`item-${index}`} className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full bg-sky-100/50 dark:bg-sky-900/20 text-sky-800 dark:text-sky-200">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.value}
            </div>
        ))}
    </div>
);

export default function Trends() {
  const filters = useAnalyticsFilters();
  const { dateRange, groupByPeriod, groupByDimension, territories, payers, stages, docsReady } = filters;

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['analytics_data', filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_analytics_data', {
        start_date_param: dateRange.from.toISOString().split('T')[0],
        end_date_param: dateRange.to.toISOString().split('T')[0],
        group_by_period: groupByPeriod,
        group_by_dimension: groupByDimension,
        filter_territories: territories.length > 0 ? territories : null,
        filter_payers: payers.length > 0 ? payers : null,
        filter_stages: stages.length > 0 ? stages : null,
        filter_docs_ready: docsReady,
      });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const kpis = analyticsData?.kpis;
  const timeseries = analyticsData?.timeseries || [];

  const renderChart = () => {
    if (groupByDimension === 'time') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={timeseries} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="period" stroke="var(--color-muted)" fontSize={12} tickFormatter={(tick) => new Date(tick).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
            <YAxis stroke="var(--color-muted)" fontSize={12} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
              }}
            />
            <Legend content={<CustomLegend />} verticalAlign="top" />
            <Line type="monotone" dataKey="total_referrals" name="New Referrals" stroke="#0ea5e9" strokeWidth={2} />
            <Line type="monotone" dataKey="docs_ready" name="Docs Ready" stroke="#10b981" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={timeseries} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="period" stroke="var(--color-muted)" fontSize={12} />
          <YAxis stroke="var(--color-muted)" fontSize={12} allowDecimals={false} />
          <Tooltip
            contentStyle={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                borderRadius: '0.5rem',
                fontSize: '12px',
            }}
          />
          <Bar dataKey="total_referrals" name="Total Referrals" fill="#0ea5e9" />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="container mx-auto max-w-7xl py-6 px-4 space-y-6">
        <h1 className="text-2xl font-bold text-sky-900 dark:text-sky-100">Analytics Overview</h1>
        <AnalyticsFilterBar />

        {isLoading ? (
          <div className="flex justify-center items-center h-80">
            <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
          </div>
        ) : !kpis ? (
          <EmptyState title="No Data" message="No analytics data available for the selected filters." />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnalyticsKpiCard title="Total Referrals" value={kpis.total_referrals?.toString() || '0'} icon={TrendingUp} />
              <AnalyticsKpiCard title="Busiest Period" value={kpis.busiest_period ? new Date(kpis.busiest_period).toLocaleDateString() : 'N/A'} icon={Calendar} />
              <AnalyticsKpiCard title="Docs Ready Rate" value={`${(kpis.docs_ready_rate || 0).toFixed(0)}%`} icon={CheckCircle2} />
            </div>
            <div className="soft-card p-4">
              {timeseries.length < 1 ? (
                <div className="flex justify-center items-center h-80">
                  <p className="text-gray-500 text-sm">No data to display for this period.</p>
                </div>
              ) : (
                renderChart()
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
