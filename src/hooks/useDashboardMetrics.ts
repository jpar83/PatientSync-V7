import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useMemo } from 'react';
import type { Order } from '@/lib/types';

interface DateRange {
  from: Date;
  to: Date;
}

export const useDashboardMetrics = (dateRange: DateRange) => {
  const { from, to } = dateRange;
  const periodDuration = (to.getTime() - from.getTime());
  const prevFrom = new Date(from.getTime() - periodDuration);
  const prevTo = new Date(from.getTime() - 1);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['dashboardMetricsData', from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const fetchMetricsForRange = async (startDate: Date, endDate: Date) => {
        const [
          { count: newReferrals },
          { count: totalDenials },
          { count: totalRegressions },
          { count: totalArchived },
          { data: ordersWithDocs, error: ordersError }
        ] = await Promise.all([
          supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
          supabase.from('denials').select('*', { count: 'exact', head: true }).gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
          supabase.from('regressions').select('*', { count: 'exact', head: true }).gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
          supabase.from('orders').select('*', { count: 'exact', head: true }).eq('is_archived', true).gte('updated_at', startDate.toISOString()).lte('updated_at', endDate.toISOString()),
          supabase.from('orders').select('document_status, patients(required_documents)').gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString())
        ]);

        if (ordersError) throw ordersError;

        const typedOrders = (ordersWithDocs as unknown as Order[]) || [];
        let docsCompleteCount = 0;
        let totalDocsRequired = 0;

        typedOrders.forEach(order => {
            const required = order.patients?.required_documents || [];
            if (required.length > 0) {
                totalDocsRequired += required.length;
                const completed = required.filter(docKey => order.document_status?.[docKey] === 'Complete').length;
                docsCompleteCount += completed;
            }
        });

        const readyForPar = typedOrders.filter(o => {
            const req = o.patients?.required_documents || [];
            return req.length > 0 && req.every(d => o.document_status?.[d] === 'Complete');
        }).length;

        const docsCompletePercent = totalDocsRequired > 0 ? (docsCompleteCount / totalDocsRequired) * 100 : 0;

        return {
          new_referrals: newReferrals ?? 0,
          ready_for_par: readyForPar,
          total_denials: totalDenials ?? 0,
          total_regressions: totalRegressions ?? 0,
          docs_complete_percent: docsCompletePercent,
          total_archived: totalArchived ?? 0,
        };
      };

      const [currentMetrics, prevMetrics, { data: ordersForPipeline, error: pipelineError }] = await Promise.all([
        fetchMetricsForRange(from, to),
        fetchMetricsForRange(prevFrom, prevTo),
        supabase.from('orders').select('workflow_stage, stoplight_status').or('is_archived.is.null,is_archived.eq.false')
      ]);

      if (pipelineError) throw pipelineError;
      
      const stoplightCounts = (ordersForPipeline as any[]).reduce((acc, order) => {
          const status = order.stoplight_status || 'green';
          acc[status]++;
          return acc;
      }, { green: 0, yellow: 0, red: 0 });

      return {
        currentMetrics,
        prevMetrics,
        orders: (ordersForPipeline as Order[]) || [],
        stoplightCounts,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const metrics = useMemo(() => {
    if (!data) return null;
    const { currentMetrics, prevMetrics, orders, stoplightCounts } = data;

    const calculateDelta = (current: number, prev: number) => {
        if (prev === 0) return current > 0 ? 100 : 0;
        return ((current - prev) / prev) * 100;
    };

    const kpis = {
      newReferrals: { value: currentMetrics.new_referrals, delta: calculateDelta(currentMetrics.new_referrals, prevMetrics.new_referrals) },
      readyForPar: { value: currentMetrics.ready_for_par, delta: calculateDelta(currentMetrics.ready_for_par, prevMetrics.ready_for_par) },
      denials: { value: currentMetrics.total_denials, delta: calculateDelta(currentMetrics.total_denials, prevMetrics.total_denials) },
      regressions: { value: currentMetrics.total_regressions, delta: calculateDelta(currentMetrics.total_regressions, prevMetrics.total_regressions) },
      docsCompletePercent: { value: currentMetrics.docs_complete_percent, delta: currentMetrics.docs_complete_percent - prevMetrics.docs_complete_percent },
      archived: { value: currentMetrics.total_archived, delta: calculateDelta(currentMetrics.total_archived, prevMetrics.total_archived) },
    };

    return { kpis, stoplightCounts, orders };
  }, [data]);

  return {
    metrics,
    isLoading,
    isFetching,
    error,
  };
};
