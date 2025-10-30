import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import ViewPatientDetails from "@/components/ViewPatientDetails";
import WorkflowHub from "@/components/WorkflowHub";
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../lib/toast';
import type { Patient, Order, WorkflowStage, Denial, Equipment } from '../lib/types';
import { Loader2, Edit, FileText, Activity, Archive, RotateCcw, X, MoreVertical, Trash2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import StageChangeModal from '../components/StageChangeModal';
import AddNoteModal from '../components/AddNoteModal';
import SimpleConfirmationModal from '../components/ui/SimpleConfirmationModal';
import workflowData from '../../schemas/workflow.json';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUIState } from '@/state/useUIState';
import { isBackward, formatDateForExport } from "../lib/utils";
import { generatePatientSnapshotPDF } from '@/lib/pdfUtils';
import StoplightStatusControl from './StoplightStatusControl';
import { useNoteMutations } from "@/hooks/useNoteMutations";
import { addNote as apiAddNote } from "@/api/notes.api";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useNavigate } from "react-router-dom";
import ArchivePatientModal from "./ArchivePatientModal";
import EditPatientModal from "./patient/EditPatientModal";

export default function PatientDrawerAdaptive({
  patientId,
  open,
  onClose,
  onUpdate,
}: {
  patientId: string | null,
  open: boolean,
  onClose: () => void,
  onUpdate: () => void,
}) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'details' | 'workflow'>('workflow');
  const [showStageModal, setShowStageModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();
  const setOverlayVisible = useUIState(state => state.setOverlayVisible);
  const [isExporting, setIsExporting] = useState(false);
  const navigate = useNavigate();
  const [editModalOpen, setEditModalOpen] = useState(false);

  const { addNote } = useNoteMutations(patientId || '', onUpdate);

  useEffect(() => {
    setOverlayVisible(open);
    return () => {
      setOverlayVisible(false);
    };
  }, [open, setOverlayVisible]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['patient_full_details', patientId],
    queryFn: async () => {
        if (!patientId) return null;

        const { data: patientData, error: patientError } = await supabase.from('patients').select('*').eq('id', patientId).single();
        if (patientError) throw patientError;

        const { data: orderData, error: orderError } = await supabase.from('orders').select('*, vendors(name, email)').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(1).single();
        if (orderError && orderError.code !== 'PGRST116') {
            console.warn("Error fetching primary order for patient:", orderError);
        }

        let equipmentData: Equipment[] = [];
        let denialsData: Denial[] = [];

        if (orderData) {
            const [equipmentRes, denialsRes] = await Promise.all([
                supabase.from('equipment').select('*').eq('order_id', orderData.id),
                supabase.from('denials').select('*').eq('order_id', orderData.id),
            ]);
            equipmentData = equipmentRes.data || [];
            denialsData = denialsRes.data || [];
        }

        return {
            patient: patientData as Patient,
            order: orderData as Order | null,
            equipment: equipmentData,
            denials: denialsData,
        };
    },
    enabled: !!patientId && open,
    staleTime: 1000 * 60,
  });

  const patient = data?.patient;
  const order = data?.order;
  const equipment = data?.equipment ?? [];
  const denials = data?.denials ?? [];

  useEffect(() => {
    if (isError) {
        toast('Failed to fetch patient details.', 'err');
        onClose();
    }
  }, [isError, onClose]);

  useEffect(() => {
    if (open) {
      setActiveTab('workflow');
    }
  }, [open, patientId]);

  const handleStageSave = async ({ newStage, note, regressionReason }: { newStage: WorkflowStage; note: string; regressionReason?: string }) => {
    if (!order || !patient) return;
    
    const isRegression = isBackward(order.workflow_stage, newStage);

    const { error: orderError } = await supabase.from('orders').update({
        workflow_stage: newStage,
        last_stage_note: note,
        last_stage_change: new Date().toISOString()
    }).eq('id', order.id);

    if (orderError) { 
        toast('Failed to update stage.', 'err');
        return;
    }

    await apiAddNote({
      patient_id: patient.id,
      body: note,
      source: 'stage_change',
      stage_from: order.workflow_stage,
      stage_to: newStage,
    });
    
    if (isRegression && regressionReason) {
        await supabase.from('regressions').insert({
            order_id: order.id,
            reason: regressionReason,
            notes: note,
            previous_stage: order.workflow_stage,
            new_stage: newStage,
            user_id: user?.id,
        });
    }

    toast('Stage updated.', 'ok'); 
    onUpdate(); 
    queryClient.invalidateQueries({ queryKey: ['dashboard_metrics'] });
    queryClient.invalidateQueries({ queryKey: ['regression_insights'] });
    setShowStageModal(false);
  };

  const handleAddNoteSave = async (note: string) => {
    addNote.mutate(note);
  };
  
  const handleArchiveConfirm = async (note: string) => {
    if (!patient) return;
    setIsArchiving(true);
    const newArchivedStatus = !patient.archived;

    try {
        const { error: patientError } = await supabase
            .from('patients')
            .update({ archived: newArchivedStatus })
            .eq('id', patient.id);
        if (patientError) throw patientError;

        const { error: orderError } = await supabase
            .from('orders')
            .update({ is_archived: newArchivedStatus })
            .eq('patient_id', patient.id);
        if (orderError) console.warn('Could not update associated orders, but patient status was changed.', orderError);

        await apiAddNote({
            patient_id: patient.id,
            body: `Patient ${newArchivedStatus ? 'archived' : 'restored'}. Reason: ${note}`,
            source: 'manual',
        });
        toast(`Patient has been ${newArchivedStatus ? 'archived' : 'restored'}.`, 'ok');
        onUpdate();
        onClose();
    } catch (error: any) {
        toast(`Failed to update archive status: ${error.message}`, 'err');
    } finally {
        setIsArchiving(false);
        setShowArchiveModal(false);
    }
  };
  
  const handleDeleteConfirm = async () => {
    if (!patient) return;
    setIsDeleting(true);
    const { error } = await supabase.rpc('delete_patient_and_all_referrals', {
        p_patient_id: patient.id
    });

    if (error) {
        toast(`Failed to delete patient: ${error.message}`, 'err');
    } else {
        toast('Patient and all associated data permanently deleted.', 'ok');
        onUpdate();
        onClose();
    }
    setIsDeleting(false);
    setShowDeleteModal(false);
  };

  const handleExportSnapshot = async () => {
    if (!order || !patient) {
        toast('Patient or order data not available for export.', 'warning');
        return;
    }
    setIsExporting(true);
    toast('Generating snapshot...', 'ok');
    try {
        const { data: auditLog, error: auditError } = await supabase
            .from('audit_log')
            .select('*')
            .contains('details', { patient_id: order.patient_id })
            .order('timestamp', { ascending: false })
            .limit(5);
        if (auditError) throw auditError;

        await generatePatientSnapshotPDF({ order, auditLog: auditLog as any[], denials, user });
        toast('Snapshot PDF generated.', 'ok');
    } catch (error: any) {
        toast(`Failed to generate PDF: ${error.message}`, 'err');
    } finally {
        setIsExporting(false);
    }
  };

  const handleStoplightUpdate = () => {
    onUpdate();
  };

  const referralStartDate = order?.referral_date ? formatDateForExport(order.referral_date, true) : '—';
  const workflowStages = workflowData.workflow.map(w => w.stage) as WorkflowStage[];

  const header = (
    <div
      className="flex-shrink-0 sticky top-0 z-20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-lg px-4 pt-3 pb-0 border-b border-black/5 dark:border-white/5"
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="text-sm uppercase tracking-wide text-muted">Patient Details</div>
          <div className="text-xl font-bold tracking-tight text-text">{patient?.name || 'Loading...'}</div>
          {patient && (
              <div className="mt-0.5 text-xs text-muted flex flex-wrap items-center gap-x-3">
                  <span>{patient.primary_insurance || 'No Payer'}</span>
                  <span className="text-gray-300 dark:text-gray-600">•</span>
                  <span>{order?.workflow_stage || 'No Stage'}</span>
                  <span className="text-gray-300 dark:text-gray-600">•</span>
                  <span className="bg-yellow-400 dark:bg-yellow-500 text-black font-bold px-2 py-0.5 rounded-md">
                    Start Date: {referralStartDate}
                  </span>
              </div>
          )}
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          {!isLoading && patient && (
            <StoplightStatusControl 
              orderId={order?.id}
              patientId={patient.id} 
              currentStatus={order?.stoplight_status || patient.stoplight_status}
              onUpdate={handleStoplightUpdate} 
            />
          )}
          {!isLoading && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/patient/${patientId}`)}>
                    <Eye className="h-4 w-4 mr-2" /> View Full Page
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditModalOpen(true)}>
                  <Edit className="h-4 w-4 mr-2" /> Edit Patient
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleExportSnapshot} 
                  disabled={!order || isExporting}
                  title={!order ? "Patient has no active referral to generate a snapshot from." : "Generate PDF Snapshot"}
                >
                  {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                  Snapshot
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowArchiveModal(true)}
                  className={cn(patient?.archived ? "text-blue-600" : "text-amber-700")}
                >
                  {patient?.archived ? <RotateCcw className="h-4 w-4 mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
                  {patient?.archived ? 'Restore' : 'Archive'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowDeleteModal(true)}
                  className="text-red-600 dark:text-error"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Patient
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button onClick={onClose} className="text-muted text-2xl leading-none pb-1" aria-label="Close">
            ×
          </button>
        </div>
      </div>
      <div className="mt-2 -mb-px flex space-x-4 px-4">
          <TabButton isActive={activeTab === 'workflow'} onClick={() => setActiveTab('workflow')}><Activity className="h-4 w-4 mr-2" />Workflow</TabButton>
          <TabButton isActive={activeTab === 'details'} onClick={() => setActiveTab('details')}><FileText className="h-4 w-4 mr-2" />Details</TabButton>
      </div>
    </div>
  );

  const drawerContent = (
    <div className="flex h-full flex-col bg-surface shadow-xl">
      {header}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 md:p-4">
            {isLoading ? (
            <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
            ) : patient ? (
            <AnimatePresence mode="wait">
                <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {activeTab === 'details' && <ViewPatientDetails patient={patient!} order={order} equipment={equipment} denials={denials} />}
                  {activeTab === 'workflow' && <WorkflowHub order={order} patient={patient!} onStageChangeClick={() => setShowStageModal(true)} onAddNoteClick={() => setShowNoteModal(true)} onUpdate={onUpdate} />}
                </motion.div>
            </AnimatePresence>
            ) : (
            <div className="p-6 text-center text-muted">Patient not found.</div>
            )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 overflow-hidden z-50" role="dialog" aria-modal="true">
            <motion.div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            ></motion.div>
            
            <motion.div
              className="fixed inset-x-0 bottom-0 max-h-[95vh] pointer-events-auto flex flex-col"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <div className="mx-auto max-w-4xl w-full flex-1 min-h-0">
                <div className="rounded-t-2xl overflow-hidden h-full bg-surface">
                  {drawerContent}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      <EditPatientModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        patientId={patientId}
        onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['patient_full_details', patientId] });
            onUpdate();
        }}
      />

      {showStageModal && order && <StageChangeModal current={order.workflow_stage as WorkflowStage} stages={workflowStages} onSave={handleStageSave} onClose={() => setShowStageModal(false)} order={order} />}
      {showNoteModal && patient && <AddNoteModal isOpen={showNoteModal} onClose={() => setShowNoteModal(false)} onSave={handleAddNoteSave} />}
      <ArchivePatientModal
        isOpen={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        onConfirm={(note) => handleArchiveConfirm(note)}
        isArchiving={isArchiving}
        patientName={patient?.name || 'this patient'}
        isArchived={!!patient?.archived}
      />
      <SimpleConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        title="Permanently Delete Patient?"
        message={<>Are you sure you want to permanently delete <strong>{patient?.name}</strong> and all their associated data? <br /><strong className="text-red-600">This action is irreversible.</strong></>}
        confirmButtonText="Yes, Delete Patient"
        confirmButtonVariant="danger"
      />
    </>
  );
}

const TabButton: React.FC<{ children: React.ReactNode, isActive: boolean, onClick: () => void }> = ({ children, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={cn(
            'flex items-center whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm focus-ring rounded-t-md',
            isActive ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text hover:border-gray-300 dark:hover:border-gray-600'
        )}
    >
        {children}
    </button>
);
