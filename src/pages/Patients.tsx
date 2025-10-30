import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { Patient, Order, ArchiveFilter, WorkflowStage } from '../lib/types';
import { Loader2 } from 'lucide-react';
import { useSearch } from '../contexts/SearchContext';
import { useDebounce } from '../hooks/useDebounce';
import { useExportCenter } from '@/state/useExportCenter';
import { Checkbox } from '@/components/ui/Checkbox';
import PatientBulkActionsFooter from '@/components/PatientBulkActionsFooter';
import SimpleConfirmationModal from '@/components/ui/SimpleConfirmationModal';
import { toast } from '@/lib/toast';
import { useUIState } from '@/state/useUIState';
import ReferralFilterBar from '@/components/ReferralFilterBar';
import AdvancedFilterPanel from '@/components/AdvancedFilterPanel';
import { useVirtualizer } from '@tanstack/react-virtual';
import EmptyState from '@/components/ui/EmptyState';
import ListSkeleton from '@/components/ui/ListSkeleton';
import StageChangeModal from '@/components/StageChangeModal';
import ArchivePatientModal from '@/components/ArchivePatientModal';
import { generatePatientSnapshotPDF } from '@/lib/pdfUtils';
import workflowData from '../../schemas/workflow.json';
import { isBackward } from '@/lib/utils';
import { addNote as apiAddNote } from '@/api/notes.api';
import { useAuth } from '@/contexts/AuthContext';
import EditPatientModal from '@/components/patient/EditPatientModal';
import PatientListItem from '@/components/patient/PatientListItem';

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

const Patients: React.FC = () => {
  const { term, setTerm } = useSearch();
  const { user } = useAuth();
  const debouncedTerm = useDebounce(term, 300);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(defaultAdvancedFilters);
  const [isAdvancedPanelOpen, setIsAdvancedPanelOpen] = useState(false);
  const openExportModal = useExportCenter(state => state.openModal);
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const setBulkActionsVisible = useUIState(state => state.setBulkActionsVisible);
  const parentRef = useRef<HTMLDivElement>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [selectedOrderForStage, setSelectedOrderForStage] = useState<Order | null>(null);
  const [patientToArchive, setPatientToArchive] = useState<Patient | null>(null);
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportingSnapshotId, setExportingSnapshotId] = useState<string | null>(null);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);

  const invalidateAndRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['allDataForPatientsPage'] });
  };

  useEffect(() => {
    const stage = searchParams.get('stage');
    const stoplight = searchParams.get('stoplight_status');
    const archive = searchParams.get('archive_status');
    const account = searchParams.get('account');

    const newFilters: Partial<AdvancedFilters> = {};
    if (stage) newFilters.workflowStage = stage;
    if (stoplight) newFilters.stoplight_status = stoplight as any;
    if (archive) newFilters.archive_status = archive as any;
    if (account) newFilters.insurance = account;

    if (Object.keys(newFilters).length > 0) {
        setAdvancedFilters(prev => ({ ...prev, ...newFilters }));
        setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: allData, isLoading } = useQuery({
    queryKey: ['allDataForPatientsPage'],
    queryFn: async () => {
      const [patientsRes, ordersRes] = await Promise.all([
        supabase.from('patients').select('*'),
        supabase.from('orders').select('id, patient_id, workflow_stage, status, is_archived, created_at, updated_at, referral_date, document_status, stoplight_status'),
      ]);
      if (patientsRes.error) throw patientsRes.error;
      if (ordersRes.error) throw ordersRes.error;
      return {
        patients: (patientsRes.data as Patient[]) || [],
        orders: (ordersRes.data as Order[]) || [],
      };
    },
  });
  
  useEffect(() => {
    setBulkActionsVisible(selectedPatientIds.length > 0);
  }, [selectedPatientIds, setBulkActionsVisible]);

  const filteredPatients = useMemo(() => {
    if (!allData) return [];
    const { patients, orders = [] } = allData;

    return patients.filter(patient => {
        const patientOrders = orders.filter(o => o.patient_id === patient.id);
        const latestOrder = patientOrders.length > 0
            ? [...patientOrders].sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0]
            : null;

        const isArchived = patient.archived === true || latestOrder?.is_archived === true || ['Delivered', 'Closed', 'Archived'].includes(latestOrder?.status || '');

        if (advancedFilters.archive_status === 'active' && isArchived) return false;
        if (advancedFilters.archive_status === 'archived' && !isArchived) return false;

        if (debouncedTerm) {
            const lowercasedTerm = debouncedTerm.toLowerCase();
            if (
                !patient.name?.toLowerCase().includes(lowercasedTerm) &&
                !patient.email?.toLowerCase().includes(lowercasedTerm) &&
                !patient.primary_insurance?.toLowerCase().includes(lowercasedTerm)
            ) return false;
        }

        if (advancedFilters.stoplight_status && advancedFilters.stoplight_status !== 'all') {
            if (patient.stoplight_status !== advancedFilters.stoplight_status) return false;
        }
        
        const { firstName, lastName, dob, insurance, dateStart, dateEnd, workflowStage, docFilterKey, docFilterStatus } = advancedFilters;

        if (firstName && !patient.name?.toLowerCase().includes(firstName.toLowerCase())) return false;
        if (lastName && !patient.name?.toLowerCase().includes(lastName.toLowerCase())) return false;
        if (dob && patient.dob) {
            const patientDob = new Date(patient.dob).toISOString().split('T')[0];
            if (patientDob !== dob) return false;
        }
        if (insurance && !patient.primary_insurance?.toLowerCase().includes(insurance.toLowerCase())) return false;

        if (dateStart || dateEnd || workflowStage || (docFilterKey && docFilterStatus)) {
            if (patientOrders.length === 0) return false;
            
            const hasMatchingOrder = patientOrders.some(order => {
                if (dateStart && order.referral_date && new Date(order.referral_date) < new Date(dateStart)) return false;
                if (dateEnd && order.referral_date) {
                    const endDate = new Date(dateEnd);
                    endDate.setHours(23, 59, 59, 999);
                    if (new Date(order.referral_date) > endDate) return false;
                }
                if (workflowStage && order.workflow_stage !== workflowStage) return false;
                if (docFilterKey && docFilterStatus) {
                    const isRequired = patient.required_documents?.includes(docFilterKey);
                    const isComplete = order.document_status?.[docFilterKey] === 'Complete';
                    if (docFilterStatus === 'Complete' && !isComplete) return false;
                    if (docFilterStatus === 'Missing' && (!isRequired || isComplete)) return false;
                    if (docFilterStatus === 'Not Required' && isRequired) return false;
                }
                return true;
            });
            if (!hasMatchingOrder) return false;
        }

        return true;
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allData, debouncedTerm, advancedFilters]);
  
  useEffect(() => {
    setSelectedPatientIds([]);
  }, [debouncedTerm, advancedFilters]);

  const rowVirtualizer = useVirtualizer({
    count: filteredPatients.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 74,
    overscan: 5,
  });

  const handleViewPatient = (patientId: string) => {
    navigate(`/patient/${patientId}`);
  };

  const handleStageChangeClick = (order: Order | null) => {
    if (order) {
        setSelectedOrderForStage(order);
    } else {
        toast('This patient has no active referral to modify.', 'warning');
    }
  };

  const handleArchiveClick = (patient: Patient) => {
      setPatientToArchive(patient);
  };

  const handleDeletePatientClick = (patient: Patient) => {
    setPatientToDelete(patient);
  };

  const handleExportSnapshot = async (order: Order | null) => {
      if (!order || !order.patient_id) {
          toast('No referral data available for export.', 'warning');
          return;
      }
      setExportingSnapshotId(order.id);
      toast('Generating snapshot...', 'ok');
      try {
          const { data: patient, error: patientError } = await supabase.from('patients').select('*').eq('id', order.patient_id).single();
          if (patientError) throw patientError;
          
          const fullOrder = { ...order, patients: patient };

          const { data: denials, error: denialsError } = await supabase.from('denials').select('id').eq('order_id', order.id);
          if (denialsError) throw denialsError;

          await generatePatientSnapshotPDF({ order: fullOrder, auditLog: [], denials: denials as any[], user });
          toast('Snapshot PDF generated.', 'ok');
      } catch (error: any) {
          toast(`Failed to generate PDF: ${error.message}`, 'err');
      } finally {
          setExportingSnapshotId(null);
      }
  };
  
  const handleStageSave = async ({ newStage, note, regressionReason }: { newStage: WorkflowStage; note: string; regressionReason?: string }) => {
    if (!selectedOrderForStage || !selectedOrderForStage.patient_id) return;
    
    const isRegression = isBackward(selectedOrderForStage.workflow_stage, newStage);

    const { error: orderError } = await supabase.from('orders').update({
        workflow_stage: newStage,
        last_stage_note: note,
        last_stage_change: new Date().toISOString()
    }).eq('id', selectedOrderForStage.id);

    if (orderError) { 
        toast('Failed to update stage.', 'err');
        return;
    }

    await apiAddNote({
      patient_id: selectedOrderForStage.patient_id,
      body: note,
      source: 'stage_change' as const,
      stage_from: selectedOrderForStage.workflow_stage,
      stage_to: newStage,
    });
    
    if (isRegression && regressionReason) {
        await supabase.from('regressions').insert({
            order_id: selectedOrderForStage.id,
            reason: regressionReason,
            notes: note,
            previous_stage: selectedOrderForStage.workflow_stage,
            new_stage: newStage,
            user_id: user?.id,
        });
    }

    toast('Stage updated.', 'ok'); 
    queryClient.invalidateQueries({ queryKey: ['allDataForPatientsPage'] });
    setSelectedOrderForStage(null);
  };

  const handleArchiveConfirm = async (note: string) => {
    if (!patientToArchive) return;
    setIsArchiving(true);
    const newArchivedStatus = !patientToArchive.archived;

    try {
        const { error: patientError } = await supabase
            .from('patients')
            .update({ archived: newArchivedStatus })
            .eq('id', patientToArchive.id);
        if (patientError) throw patientError;
    
        const { error: orderError } = await supabase
            .from('orders')
            .update({ is_archived: newArchivedStatus })
            .eq('patient_id', patientToArchive.id);
        if (orderError) console.warn('Could not update associated orders, but patient status was changed.', orderError);

        await apiAddNote({
            patient_id: patientToArchive.id,
            body: `Patient ${newArchivedStatus ? 'archived' : 'restored'}. Reason: ${note}`,
            source: 'manual',
        });

        toast(`Patient has been ${newArchivedStatus ? 'archived' : 'restored'}.`, 'ok');
        setPatientToArchive(null);
        queryClient.invalidateQueries({ queryKey: ['allDataForPatientsPage'] });
    } catch (error: any) {
        toast(`Error: ${error.message}`, 'err');
    } finally {
        setIsArchiving(false);
    }
  };
  
  const handleDeletePatientConfirm = async () => {
    if (!patientToDelete) return;
    setIsDeleting(true);
    const { error } = await supabase.rpc('delete_patient_and_all_referrals', {
        p_patient_id: patientToDelete.id
    });

    if (error) {
        toast(`Failed to delete patient: ${error.message}`, 'err');
    } else {
        toast('Patient and all associated data permanently deleted.', 'ok');
        queryClient.invalidateQueries({ queryKey: ['allDataForPatientsPage'] });
    }
    setIsDeleting(false);
    setPatientToDelete(null);
  };

  const handleToggleSelection = (patientId: string) => {
    setSelectedPatientIds(prev =>
        prev.includes(patientId)
            ? prev.filter(id => id !== patientId)
            : [...prev, patientId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPatientIds.length === filteredPatients.length) {
        setSelectedPatientIds([]);
    } else {
        setSelectedPatientIds(filteredPatients.map(p => p.id));
    }
  };

  const handleBulkArchive = async () => {
    setIsArchiving(true);
    const { error } = await supabase
        .from('patients')
        .update({ archived: true })
        .in('id', selectedPatientIds);

    if (error) {
        toast(`Failed to archive patients: ${error.message}`, 'err');
    } else {
        toast(`${selectedPatientIds.length} patients have been archived.`, 'ok');
        queryClient.invalidateQueries({ queryKey: ['allDataForPatientsPage'] });
        setSelectedPatientIds([]);
    }
    setIsArchiving(false);
    setShowArchiveConfirm(false);
  };

  const clearAllFilters = () => {
    setAdvancedFilters(defaultAdvancedFilters);
    setTerm('');
    searchParams.delete('account');
    setSearchParams(searchParams, { replace: true });
  };

  const workflowStages = workflowData.workflow.map(w => w.stage) as WorkflowStage[];
  const isAdvancedFilterActive = JSON.stringify(advancedFilters) !== JSON.stringify(defaultAdvancedFilters);

  const viewQuery = useMemo(() => {
    const query: Record<string, any> = {};
    if (debouncedTerm) query.search = debouncedTerm;
    if (isAdvancedFilterActive) {
      Object.entries(advancedFilters).forEach(([key, value]) => {
        if (JSON.stringify(value) !== JSON.stringify(defaultAdvancedFilters[key as keyof AdvancedFilters])) {
          const queryKey = key === 'insurance' ? 'account' : key;
          query[queryKey] = value;
        }
      });
    }
    return query;
  }, [debouncedTerm, advancedFilters, isAdvancedFilterActive]);

  const ordersByPatientId = useMemo(() => {
    if (!allData?.orders) return new Map<string, Order[]>();
    return allData.orders.reduce((acc, order) => {
      if (!acc.has(order.patient_id)) {
        acc.set(order.patient_id, []);
      }
      acc.get(order.patient_id)!.push(order);
      return acc;
    }, new Map<string, Order[]>());
  }, [allData?.orders]);

  return (
    <div className="h-full flex flex-col">
      <div className="container mx-auto max-w-7xl py-6 px-4 space-y-6 h-full flex flex-col">
        <ReferralFilterBar
          onClearFilters={clearAllFilters}
          accountFilter={advancedFilters.insurance || null}
          numSelected={selectedPatientIds.length}
          totalCount={filteredPatients.length}
          onOpenAdvanced={() => setIsAdvancedPanelOpen(true)}
          isAdvancedFilterActive={isAdvancedFilterActive}
          onExportClick={() => openExportModal({ reportType: 'patient_details', filters: viewQuery })}
        />

        <div className="flex-1 soft-card h-full flex flex-col overflow-hidden">
            <div className="hidden md:grid grid-cols-[auto_minmax(0,1fr)_150px_auto] items-center gap-4 px-4 py-2 border-b border-border-color bg-gray-50/50 dark:bg-zinc-800/50 text-xs font-semibold text-muted uppercase tracking-wider">
                <Checkbox
                label=""
                checked={filteredPatients.length > 0 && selectedPatientIds.length === filteredPatients.length}
                indeterminate={selectedPatientIds.length > 0 && selectedPatientIds.length < filteredPatients.length}
                onChange={handleSelectAll}
                className="h-4 w-4"
                />
                <span className="pl-5">Name</span>
                <span className="text-right">Case Status</span>
                <span className="text-center">Actions</span>
            </div>

            <div ref={parentRef} className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="p-4"><ListSkeleton rows={10} /></div>
                ) : (
                    <ul style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                        {filteredPatients.length === 0 ? (
                            <li className="col-span-full">
                                <div className="py-12">
                                    <EmptyState title="No Patients Found" message="No patients match the current filters." />
                                </div>
                            </li>
                        ) : rowVirtualizer.getVirtualItems().map(virtualItem => {
                            const patient = filteredPatients[virtualItem.index];
                            if (!patient) return null;
                            
                            const patientOrders = ordersByPatientId.get(patient.id) || [];
                            const latestOrder = patientOrders.length > 0
                                ? [...patientOrders].sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0]
                                : null;
                            
                            return (
                                <div
                                    key={virtualItem.key}
                                    style={{
                                        position: 'absolute', top: 0, left: 0, width: '100%',
                                        height: `${virtualItem.size}px`, transform: `translateY(${virtualItem.start}px)`,
                                        zIndex: openMenuId === patient.id ? 20 : 1,
                                    }}
                                >
                                    <PatientListItem
                                        patient={patient}
                                        latestOrder={latestOrder}
                                        isSelected={selectedPatientIds.includes(patient.id)}
                                        onToggleSelection={() => handleToggleSelection(patient.id)}
                                        onViewDetails={() => handleViewPatient(patient.id)}
                                        onEdit={() => setEditingPatientId(patient.id)}
                                        onArchive={() => handleArchiveClick(patient)}
                                        onDelete={() => handleDeletePatientClick(patient)}
                                        onStageChange={() => handleStageChangeClick(latestOrder)}
                                        onExportSnapshot={() => handleExportSnapshot(latestOrder)}
                                        isExporting={exportingSnapshotId === latestOrder?.id}
                                        onUpdate={invalidateAndRefetch}
                                        term={debouncedTerm}
                                        onMenuToggle={(isOpen) => setOpenMenuId(isOpen ? patient.id : null)}
                                        index={virtualItem.index}
                                    />
                                </div>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
        
        <PatientBulkActionsFooter
          selectedCount={selectedPatientIds.length}
          onClear={() => setSelectedPatientIds([])}
          onArchive={() => setShowArchiveConfirm(true)}
        />
        <AdvancedFilterPanel
          isOpen={isAdvancedPanelOpen}
          onClose={() => setIsAdvancedPanelOpen(false)}
          activeFilters={advancedFilters}
          onApply={setAdvancedFilters}
          onClear={clearAllFilters}
        />
      </div>
      {selectedOrderForStage && (
          <StageChangeModal
              current={selectedOrderForStage.workflow_stage as WorkflowStage}
              stages={workflowStages}
              onSave={handleStageSave}
              onClose={() => setSelectedOrderForStage(null)}
              order={selectedOrderForStage}
          />
      )}
      {patientToArchive && (
          <ArchivePatientModal
              isOpen={!!patientToArchive}
              onClose={() => setPatientToArchive(null)}
              onConfirm={handleArchiveConfirm}
              isArchiving={isArchiving}
              patientName={patientToArchive.name || 'this patient'}
              isArchived={!!patientToArchive.archived}
          />
      )}
      <SimpleConfirmationModal
          isOpen={!!patientToDelete}
          onClose={() => setPatientToDelete(null)}
          onConfirm={handleDeletePatientConfirm}
          isLoading={isDeleting}
          title="Permanently Delete Patient?"
          message={<>Are you sure you want to permanently delete <strong>{patientToDelete?.name}</strong> and all their associated data (referrals, notes, etc.)? <br /><strong className="text-red-600">This action is irreversible.</strong></>}
          confirmButtonText="Yes, Delete Patient"
          confirmButtonVariant="danger"
      />
      <EditPatientModal
          open={!!editingPatientId}
          onClose={() => setEditingPatientId(null)}
          patientId={editingPatientId}
          onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ['allDataForPatientsPage'] });
          }}
      />
    </div>
  );
};

export default Patients;
