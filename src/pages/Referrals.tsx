import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import PatientDrawerAdaptive from '../components/PatientDrawerAdaptive';
import StageChangeModal from '../components/StageChangeModal';
import SimpleConfirmationModal from '../components/ui/SimpleConfirmationModal';
import ReferralTable from '../components/ReferralTable';
import type { Order, WorkflowStage, ArchiveFilter } from '../lib/types';
import workflowData from '../../schemas/workflow.json';
import { toast } from '../lib/toast';
import ReferralFilterBar from '../components/ReferralFilterBar';
import { Loader2, FileText } from 'lucide-react';
import { useSearch } from '../contexts/SearchContext';
import { useDebounce } from '../hooks/useDebounce';
import EmptyState from '../components/ui/EmptyState';
import MassUpdateModal from '../components/MassUpdateModal';
import BulkActionsFooter from '../components/BulkActionsFooter';
import { useAuth } from '../contexts/AuthContext';
import { useUIState } from '../state/useUIState';
import MassDocUpdateModal from '../components/MassDocUpdateModal';
import AdvancedFilterPanel from '../components/AdvancedFilterPanel';
import { useExportCenter } from '@/state/useExportCenter';
import { addNote as apiAddNote } from '@/api/notes.api';
import { isBackward } from '@/lib/utils';
import { useMediaQuery } from '../hooks/useMediaQuery';
import ListSkeleton from '@/components/ui/ListSkeleton';

export interface AdvancedFilters {
  firstName?: string;
  lastName?: string;
  dob?: string;
  insurance?: string;
  dateStart?: string;
  dateEnd?: string;
  workflowStage?: string;
  docFilterKey?: string;
  docFilterStatus?: string;
  payer_region?: string;
  rep_name?: string;
  stoplight_status?: 'green' | 'yellow' | 'red' | 'all';
  archive_status?: ArchiveFilter;
}

const defaultAdvancedFilters: AdvancedFilters = {
    firstName: '',
    lastName: '',
    dob: '',
    insurance: '',
    dateStart: '',
    dateEnd: '',
    workflowStage: '',
    docFilterKey: '',
    docFilterStatus: '',
    payer_region: '',
    rep_name: '',
    stoplight_status: 'all',
    archive_status: 'active',
};

const Referrals: React.FC = () => {
    const { term, setTerm } = useSearch();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const setBulkActionsVisible = useUIState(state => state.setBulkActionsVisible);
    const openExportModal = useExportCenter(state => state.openModal);
    const isDesktop = useMediaQuery('(min-width: 1024px)');

    const debouncedTerm = useDebounce(term, 300);
    const accountFilter = searchParams.get('account');
    const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(defaultAdvancedFilters);
    
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [patientForDrawer, setPatientForDrawer] = useState<string | null>(null);
    const [showStageModal, setShowStageModal] = useState(false);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
    const [showMassUpdateModal, setShowMassUpdateModal] = useState(false);
    const [showMassDocUpdateModal, setShowMassDocUpdateModal] = useState(false);
    const [isAdvancedPanelOpen, setIsAdvancedPanelOpen] = useState(false);
    const [exportingSnapshotId, setExportingSnapshotId] = useState<string | null>(null);

    useEffect(() => {
        const insurance = searchParams.get('insurance');
        const dateStart = searchParams.get('dateStart');
        const dateEnd = searchParams.get('dateEnd');
        const region = searchParams.get('region');
        const rep = searchParams.get('rep');
        const stoplight = searchParams.get('stoplight_status');

        const newFilters: AdvancedFilters = {};
        if (insurance) newFilters.insurance = insurance;
        if (dateStart) newFilters.dateStart = dateStart;
        if (dateEnd) newFilters.dateEnd = dateEnd;
        if (region) newFilters.payer_region = region;
        if (rep) newFilters.rep_name = rep;
        if (stoplight) newFilters.stoplight_status = stoplight as any;

        if (Object.keys(newFilters).length > 0) {
            setAdvancedFilters(prev => ({ ...prev, ...newFilters }));
        }
    }, [searchParams]);

    const invalidateAndRefetch = () => {
        queryClient.invalidateQueries({ queryKey: ['referrals_direct_all'] });
    };

    const { data: allOrders, isLoading, error } = useQuery({
        queryKey: ['referrals_direct_all'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('orders')
                .select('*, patients(*), denials(id), equipment(id)');
            if (error) throw error;
            return data as Order[];
        }
    });
    
    const orders = useMemo(() => {
        if (!allOrders) return [];
        
        let filtered = allOrders.filter(order => {
            if (advancedFilters.archive_status === 'active') return order.is_archived !== true;
            if (advancedFilters.archive_status === 'archived') return order.is_archived === true;
            return true; // for 'all'
        });

        if (accountFilter) {
            filtered = filtered.filter(order => order.patients?.primary_insurance === accountFilter);
        }

        if (advancedFilters.stoplight_status && advancedFilters.stoplight_status !== 'all') {
            filtered = filtered.filter(order => order.stoplight_status === advancedFilters.stoplight_status);
        }

        const { firstName, lastName, dob, insurance, dateStart, dateEnd, workflowStage, docFilterKey, docFilterStatus, payer_region, rep_name } = advancedFilters;
        if (Object.values(advancedFilters).some(v => v)) {
            filtered = filtered.filter(order => {
                const patient = order.patients;
                if (!patient) return false;

                if (firstName && !patient.name?.toLowerCase().includes(firstName.toLowerCase())) return false;
                if (lastName && !patient.name?.toLowerCase().includes(lastName.toLowerCase())) return false;
                
                if (dob && patient.dob) {
                    const patientDob = new Date(patient.dob).toISOString().split('T')[0];
                    if (patientDob !== dob) return false;
                }

                if (insurance) {
                    const insuranceList = insurance.split(',').map(i => i.toLowerCase().trim());
                    if (!patient.primary_insurance || !insuranceList.includes(patient.primary_insurance.toLowerCase())) {
                        return false;
                    }
                }

                if (dateStart && order.referral_date) {
                    if (new Date(order.referral_date) < new Date(dateStart)) return false;
                }

                if (dateEnd && order.referral_date) {
                    const endDate = new Date(dateEnd);
endDate.setHours(23, 59, 59, 999);
                    if (new Date(order.referral_date) > endDate) return false;
                }

                if (workflowStage && order.workflow_stage !== workflowStage) return false;

                if (docFilterKey && docFilterStatus) {
                    const isRequired = order.patients?.required_documents?.includes(docFilterKey);
                    const isComplete = order.document_status?.[docFilterKey] === 'Complete';

                    if (docFilterStatus === 'Complete' && !isComplete) return false;
                    if (docFilterStatus === 'Missing' && (!isRequired || isComplete)) return false;
                    if (docFilterStatus === 'Not Required' && isRequired) return false;
                }

                if (payer_region && order.payer_region !== payer_region) return false;
                if (rep_name && order.rep_name !== rep_name) return false;
                
                return true;
            });
        }

        if (debouncedTerm) {
            const lowercasedTerm = debouncedTerm.toLowerCase();
            filtered = filtered.filter(order => 
                (order.patients?.name?.toLowerCase().includes(lowercasedTerm)) ||
                (order.patients?.primary_insurance?.toLowerCase().includes(lowercasedTerm)) ||
                (order.workflow_stage?.toLowerCase().includes(lowercasedTerm))
            );
        }
        
        return filtered.sort((a, b) => (a.patients?.name || '').localeCompare(b.patients?.name || ''));
    }, [allOrders, accountFilter, debouncedTerm, advancedFilters]);
    
    useEffect(() => {
        setSelectedOrderIds([]);
    }, [accountFilter, debouncedTerm, advancedFilters]);
    
    useEffect(() => {
      setBulkActionsVisible(selectedOrderIds.length > 0);
      return () => {
        setBulkActionsVisible(false);
      };
    }, [selectedOrderIds, setBulkActionsVisible]);

    useEffect(() => {
        const openPatientId = searchParams.get('openPatientId');
        if (openPatientId) {
            setPatientForDrawer(openPatientId);
            searchParams.delete('openPatientId');
            setSearchParams(searchParams, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    const handleStageChangeClick = (order: Order) => {
        setSelectedOrder(order);
        setShowStageModal(true);
    };

    const handlePatientClick = (order: Order) => {
        setPatientForDrawer(order.patient_id);
    };
    
    const handleArchiveClick = (order: Order) => {
        setSelectedOrder(order);
        setShowArchiveModal(true);
    };

    const handleDeleteClick = (order: Order) => {
        setOrderToDelete(order);
    };

    const handleExportSnapshot = async (order: Order) => {
        if (!order || !order.patient_id) return;
        setExportingSnapshotId(order.id);
        toast('Generating snapshot...', 'ok');
        try {
            const { data: denials, error: denialsError } = await supabase
                .from('denials')
                .select('id')
                .eq('order_id', order.id);
            if (denialsError) throw denialsError;

            await generatePatientSnapshotPDF({ order, auditLog: [], denials: denials as any[], user });
            toast('Snapshot PDF generated.', 'ok');
        } catch (error: any) {
            toast(`Failed to generate PDF: ${error.message}`, 'err');
        } finally {
            setExportingSnapshotId(null);
        }
    };

    const handleStageSave = async ({ newStage, note, regressionReason }: { newStage: WorkflowStage; note: string; regressionReason?: string }) => {
        if (!selectedOrder || !selectedOrder.patients) return;
        
        const isRegression = isBackward(selectedOrder.workflow_stage, newStage);
    
        const { error: orderError } = await supabase.from('orders').update({
            workflow_stage: newStage,
            last_stage_note: note,
            last_stage_change: new Date().toISOString()
        }).eq('id', selectedOrder.id);
    
        if (orderError) { 
            toast('Failed to update stage.', 'err');
            return;
        }
    
        await apiAddNote({
          patient_id: selectedOrder.patient_id,
          body: note,
          source: 'stage_change',
          stage_from: selectedOrder.workflow_stage,
          stage_to: newStage,
        });
        
        if (isRegression && regressionReason) {
            await supabase.from('regressions').insert({
                order_id: selectedOrder.id,
                reason: regressionReason,
                notes: note,
                previous_stage: selectedOrder.workflow_stage,
                new_stage: newStage,
                user_id: user?.id,
            });
        }
    
        toast('Stage updated.', 'ok'); 
        invalidateAndRefetch();
        queryClient.invalidateQueries({ queryKey: ['dashboard_metrics'] });
        queryClient.invalidateQueries({ queryKey: ['regression_insights'] });
        setShowStageModal(false);
        setSelectedOrder(null);
    };

    const handleArchiveConfirm = async () => {
        if (!selectedOrder) return;
        const newStatus = !selectedOrder.is_archived;
        const { error } = await supabase.from('orders').update({ is_archived: newStatus }).eq('id', selectedOrder.id);
        if (error) {
            toast(`Failed to ${newStatus ? 'archive' : 'restore'} referral.`, 'err');
        } else {
            await apiAddNote({
                patient_id: selectedOrder.patient_id,
                body: `Referral ${newStatus ? 'archived' : 'restored'}.`,
                source: 'manual',
            });
            toast(`Referral ${newStatus ? 'archived' : 'restored'}.`, 'ok');
            invalidateAndRefetch();
        }
        setShowArchiveModal(false);
        setSelectedOrder(null);
    };

    const handleDeleteConfirm = async () => {
        if (!orderToDelete) return;
        setIsDeleting(true);
        const { error } = await supabase.rpc('delete_referral_and_dependents', {
            p_order_id: orderToDelete.id
        });
    
        if (error) {
            toast(`Failed to delete referral: ${error.message}`, 'err');
        } else {
            toast('Referral permanently deleted.', 'ok');
            invalidateAndRefetch();
        }
        setIsDeleting(false);
        setOrderToDelete(null);
    };
    
    const workflowStages = workflowData.workflow.map(w => w.stage) as WorkflowStage[];

    const clearAllFilters = () => {
        setAdvancedFilters(defaultAdvancedFilters);
        setTerm('');
        searchParams.delete('account');
        searchParams.delete('insurance');
        searchParams.delete('dateStart');
        searchParams.delete('dateEnd');
        searchParams.delete('region');
        searchParams.delete('rep');
        searchParams.delete('stoplight_status');
        setSearchParams(searchParams, { replace: true });
    };

    const handleToggleSelection = (orderId: string) => {
        if (orderId === 'all-on') {
            setSelectedOrderIds(orders.map(o => o.id));
            return;
        }
        if (orderId === 'all-off') {
            setSelectedOrderIds([]);
            return;
        }
        setSelectedOrderIds(prev =>
            prev.includes(orderId)
                ? prev.filter(id => id !== orderId)
                : [...prev, orderId]
        );
    };

    const handleMassStageUpdate = async ({ newStage, note }: { newStage: WorkflowStage; note: string }) => {
        if (selectedOrderIds.length === 0) return;

        const ordersToUpdate = allOrders?.filter(o => selectedOrderIds.includes(o.id)) || [];

        const { error: updateError } = await supabase
            .from('orders')
            .update({
                workflow_stage: newStage,
                last_stage_note: note,
                last_stage_change: new Date().toISOString()
            })
            .in('id', selectedOrderIds);
        
        if (updateError) {
            toast(`Failed to update ${selectedOrderIds.length} referrals.`, 'err');
            return;
        }

        const notePayloads = ordersToUpdate.map(order => ({
            patient_id: order.patient_id,
            body: note,
            source: 'stage_change' as const,
            stage_from: order.workflow_stage,
            stage_to: newStage,
        }));

        await supabase.from('patient_notes').insert(notePayloads);

        toast(`${selectedOrderIds.length} referrals updated to "${newStage}".`, 'ok');
        invalidateAndRefetch();
        setSelectedOrderIds([]);
        setShowMassUpdateModal(false);
    };

    const handleMassDocUpdate = async ({ docKeys, note }: { docKeys: string[]; note: string }) => {
        if (selectedOrderIds.length === 0 || docKeys.length === 0) return;

        const { error } = await supabase.rpc('bulk_update_order_docs', {
            order_ids: selectedOrderIds,
            doc_keys: docKeys,
            note: note,
            user_email: user?.email || 'System'
        });

        if (error) {
            toast(`Failed to update documents: ${error.message}`, 'err');
        } else {
            toast(`${docKeys.length} document(s) for ${selectedOrderIds.length} referrals updated.`, 'ok');
            invalidateAndRefetch();
            setSelectedOrderIds([]);
            setShowMassDocUpdateModal(false);
        }
    };
    
    const isAdvancedFilterActive = useMemo(() => {
        return JSON.stringify(advancedFilters) !== JSON.stringify(defaultAdvancedFilters);
    }, [advancedFilters]);

    const showClearButton = useMemo(() => {
        return isAdvancedFilterActive || !!debouncedTerm || !!accountFilter;
    }, [isAdvancedFilterActive, debouncedTerm, accountFilter]);

    const viewQuery = useMemo(() => {
        const query: Record<string, any> = {};
        if (debouncedTerm) query.search = debouncedTerm;
        if (accountFilter) query.account = accountFilter;
        if (isAdvancedFilterActive) {
            Object.entries(advancedFilters).forEach(([key, value]) => {
                if (JSON.stringify(value) !== JSON.stringify(defaultAdvancedFilters[key as keyof AdvancedFilters])) {
                    query[key] = value;
                }
            });
        }
        return query;
    }, [debouncedTerm, accountFilter, advancedFilters, isAdvancedFilterActive]);

    if (isDesktop) {
        return (
            <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-900/50">
                <ReferralFilterBar
                    onClearFilters={clearAllFilters}
                    accountFilter={accountFilter}
                    numSelected={selectedOrderIds.length}
                    totalCount={orders.length}
                    onOpenAdvanced={() => setIsAdvancedPanelOpen(true)}
                    isAdvancedFilterActive={showClearButton}
                    onExportClick={() => openExportModal({ filters: viewQuery })}
                />
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-4 overflow-hidden p-2 sm:p-4">
                    <div className="lg:col-span-1 xl:col-span-2 flex flex-col overflow-hidden soft-card">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>
                        ) : error ? (
                            <EmptyState title="Error" message="Could not load referrals." />
                        ) : (
                            <div className="flex-1 overflow-y-auto">
                                <ReferralTable 
                                    orders={orders}
                                    isLoading={isLoading}
                                    onViewDetails={handlePatientClick}
                                    onStageChangeClick={handleStageChangeClick}
                                    onArchiveToggle={handleArchiveClick}
                                    onDelete={handleDeleteClick}
                                    onExportSnapshot={handleExportSnapshot}
                                    exportingSnapshotId={exportingSnapshotId}
                                    term={debouncedTerm}
                                    selectedOrderIds={selectedOrderIds}
                                    onToggleSelection={handleToggleSelection}
                                    onUpdate={invalidateAndRefetch}
                                />
                            </div>
                        )}
                    </div>
                    <div className="hidden lg:block lg:col-span-1 xl:col-span-3 overflow-hidden">
                        {patientForDrawer ? (
                            <PatientDrawerAdaptive 
                                displayMode="inline"
                                patientId={patientForDrawer}
                                open={!!patientForDrawer}
                                onClose={() => setPatientForDrawer(null)}
                                onUpdate={invalidateAndRefetch}
                            />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-zinc-800/50 rounded-2xl border-2 border-dashed border-gray-300 dark:border-zinc-700">
                                <FileText className="h-12 w-12 text-gray-400" />
                                <p className="mt-2 text-sm font-semibold text-muted">Select a referral</p>
                                <p className="text-xs text-muted">Details will be shown here.</p>
                            </div>
                        )}
                    </div>
                </div>
                <BulkActionsFooter
                    selectedCount={selectedOrderIds.length}
                    onClear={() => setSelectedOrderIds([])}
                    onUpdateStage={() => setShowMassUpdateModal(true)}
                    onUpdateDocs={() => setShowMassDocUpdateModal(true)}
                />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-900/50">
            <ReferralFilterBar
                id="tour-referrals-filters"
                onClearFilters={clearAllFilters}
                accountFilter={accountFilter}
                numSelected={selectedOrderIds.length}
                totalCount={orders.length}
                onOpenAdvanced={() => setIsAdvancedPanelOpen(true)}
                isAdvancedFilterActive={showClearButton}
                onExportClick={() => openExportModal({ filters: viewQuery })}
            />

            <div id="tour-referrals-list" className="flex-1 overflow-y-auto pb-nav-safe">
                {isLoading ? (
                    <div className="p-4"><ListSkeleton rows={10} /></div>
                ) : error ? (
                    <EmptyState title="Error" message="Could not load referrals." />
                ) : (
                    <div className="soft-card overflow-x-auto m-2 sm:m-4">
                        <ReferralTable 
                            orders={orders}
                            isLoading={isLoading}
                            onViewDetails={handlePatientClick}
                            onStageChangeClick={handleStageChangeClick}
                            onArchiveToggle={handleArchiveClick}
                            onDelete={handleDeleteClick}
                            onExportSnapshot={handleExportSnapshot}
                            exportingSnapshotId={exportingSnapshotId}
                            term={debouncedTerm}
                            selectedOrderIds={selectedOrderIds}
                            onToggleSelection={handleToggleSelection}
                            onUpdate={invalidateAndRefetch}
                        />
                    </div>
                )}
            </div>

            <PatientDrawerAdaptive
                patientId={patientForDrawer}
                open={!!patientForDrawer}
                onClose={() => setPatientForDrawer(null)}
                onUpdate={invalidateAndRefetch}
            />
            {showStageModal && selectedOrder && (
                <StageChangeModal
                    current={selectedOrder.workflow_stage as WorkflowStage}
                    stages={workflowStages}
                    onSave={handleStageSave}
                    onClose={() => setShowStageModal(false)}
                    order={selectedOrder}
                />
            )}
            <SimpleConfirmationModal
                isOpen={showArchiveModal}
                onClose={() => setShowArchiveModal(false)}
                onConfirm={handleArchiveConfirm}
                isLoading={false}
                title={`${selectedOrder?.is_archived ? 'Restore' : 'Archive'} Referral`}
                message={`Are you sure you want to ${selectedOrder?.is_archived ? 'restore' : 'archive'} the referral for ${selectedOrder?.patients?.name}?`}
                confirmButtonText={`Yes, ${selectedOrder?.is_archived ? 'Restore' : 'Archive'}`}
            />
            <SimpleConfirmationModal
                isOpen={!!orderToDelete}
                onClose={() => setOrderToDelete(null)}
                onConfirm={handleDeleteConfirm}
                isLoading={isDeleting}
                title="Permanently Delete Referral?"
                message={<>Are you sure you want to permanently delete the referral for <strong>{orderToDelete?.patients?.name}</strong>?<br /><strong className="text-red-600">This action is irreversible and will delete all associated data.</strong></>}
                confirmButtonText="Yes, Delete Permanently"
                confirmButtonVariant="danger"
            />
            <BulkActionsFooter
                selectedCount={selectedOrderIds.length}
                onClear={() => setSelectedOrderIds([])}
                onUpdateStage={() => setShowMassUpdateModal(true)}
                onUpdateDocs={() => setShowMassDocUpdateModal(true)}
            />
            <MassUpdateModal
                isOpen={showMassUpdateModal}
                onClose={() => setShowMassUpdateModal(false)}
                onConfirm={handleMassStageUpdate}
                selectedCount={selectedOrderIds.length}
                stages={workflowStages}
            />
            <MassDocUpdateModal
                isOpen={showMassDocUpdateModal}
                onClose={() => setShowMassDocUpdateModal(false)}
                onConfirm={handleMassDocUpdate}
                selectedCount={selectedOrderIds.length}
            />
            <AdvancedFilterPanel
                isOpen={isAdvancedPanelOpen}
                onClose={() => setIsAdvancedPanelOpen(false)}
                activeFilters={advancedFilters}
                onApply={setAdvancedFilters}
                onClear={clearAllFilters}
            />
        </div>
    );
};

export default Referrals;
