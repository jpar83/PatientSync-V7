import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Loader2, ArrowLeft, Edit, Download, Archive, RotateCcw, MoreVertical, Eye, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/ui/EmptyState';
import type { Patient, Order, WorkflowStage, Denial, Equipment } from '@/lib/types';
import ViewPatientDetails from '@/components/ViewPatientDetails';
import WorkflowHub from '@/components/WorkflowHub';
import AddNoteModal from '@/components/AddNoteModal';
import StageChangeModal from '@/components/StageChangeModal';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import { isBackward, formatDateForExport } from '@/lib/utils';
import workflowData from '../../schemas/workflow.json';
import { useNoteMutations } from '@/hooks/useNoteMutations';
import { addNote as apiAddNote } from '@/api/notes.api';
import { useExportCenter } from '@/state/useExportCenter';
import ArchivePatientModal from '@/components/ArchivePatientModal';
import StoplightStatusControl from '@/components/StoplightStatusControl';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import SimpleConfirmationModal from '@/components/ui/SimpleConfirmationModal';
import EditPatientModal from '@/components/patient/EditPatientModal';

const PatientDetailPage: React.FC = () => {
    const { id: patientId } = useParams<{ id: string }>();
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [showStageModal, setShowStageModal] = useState(false);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const openExportModal = useExportCenter(state => state.openModal);
    const navigate = useNavigate();

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ['patient_full_details', patientId],
        queryFn: async () => {
            if (!patientId) return null;

            const { data: patientData, error: patientError } = await supabase.from('patients').select('*').eq('id', patientId).single();
            if (patientError) throw patientError;

            const { data: orderData, error: orderError } = await supabase.from('orders').select('*, vendors(name, email)').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(1).single();
            if (orderError && orderError.code !== 'PGRST116') console.warn("Error fetching primary order:", orderError);

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
        enabled: !!patientId,
    });
    
    const { addNote } = useNoteMutations(patientId!, refetch);

    const patient = data?.patient;
    const order = data?.order;

    const handleAddNoteSave = async (note: string) => {
        addNote.mutate(note);
    };

    const handleStageSave = async ({ newStage, note, regressionReason }: { newStage: WorkflowStage; note: string; regressionReason?: string }) => {
        if (!order || !patient) return;
        
        const isRegression = isBackward(order.workflow_stage, newStage);
    
        const { error: orderError } = await supabase.from('orders').update({ workflow_stage: newStage, last_stage_note: note, last_stage_change: new Date().toISOString() }).eq('id', order.id);
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
        refetch();
        queryClient.invalidateQueries({ queryKey: ['referrals_direct_all'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard_metrics'] });
        queryClient.invalidateQueries({ queryKey: ['regression_insights'] });
        setShowStageModal(false);
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
            setShowArchiveModal(false);
            refetch();
            queryClient.invalidateQueries({ queryKey: ['allDataForPatientsPage'] });
        } catch (error: any) {
            toast(`Error: ${error.message}`, 'err');
        } finally {
            setIsArchiving(false);
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
            navigate('/patients', { replace: true });
        }
        setIsDeleting(false);
        setShowDeleteModal(false);
    };

    const workflowStages = workflowData.workflow.map(w => w.stage) as WorkflowStage[];

    if (isLoading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>;
    }

    if (isError || !data || !patient) {
        return <div className="p-8"><EmptyState title="Error" message="Could not load patient details." /></div>;
    }

    const { equipment, denials } = data;

    return (
        <div className="h-full overflow-y-auto">
            <div className="container mx-auto max-w-7xl py-6 px-4 space-y-6">
                <header className="grid grid-cols-3 items-center">
                    <div className="justify-self-start">
                        <Button asChild variant="ghost">
                            <Link to="/patients">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back to Patients
                            </Link>
                        </Button>
                    </div>

                    <div className="justify-self-center text-center">
                        {order && (
                            <div>
                                <p className="text-xs text-muted">Start Date</p>
                                <p className="text-sm font-semibold text-text">
                                    {order.referral_date ? new Date(order.referral_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 justify-self-end">
                        {patient && (
                            <StoplightStatusControl
                                orderId={order?.id}
                                patientId={patient.id}
                                currentStatus={order?.stoplight_status || patient.stoplight_status}
                                onUpdate={refetch}
                            />
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" className="h-9 w-9">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEditModalOpen(true)}>
                                    <Edit className="h-4 w-4 mr-2" /> Edit Patient
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openExportModal({ reportType: 'patient_details', filters: { patients: [patient.id] } })}>
                                    <Download className="h-4 w-4 mr-2" /> Export
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => setShowArchiveModal(true)}
                                    className={cn(patient.archived ? "text-blue-600" : "text-amber-700")}
                                >
                                    {patient.archived ? <RotateCcw className="h-4 w-4 mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
                                    {patient.archived ? 'Restore' : 'Archive'}
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
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <div className="lg:col-span-2 space-y-6">
                        <ViewPatientDetails patient={patient} order={order} equipment={equipment} denials={denials} />
                    </div>
                    <div className="lg:col-span-1">
                        <WorkflowHub 
                            order={order} 
                            patient={patient} 
                            onStageChangeClick={() => setShowStageModal(true)} 
                            onAddNoteClick={() => setShowNoteModal(true)}
                            onUpdate={refetch}
                        />
                    </div>
                </div>
            </div>

            <EditPatientModal
                open={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                patientId={patientId}
                onSaved={() => {
                    refetch();
                }}
            />

            <AddNoteModal 
                isOpen={showNoteModal} 
                onClose={() => setShowNoteModal(false)} 
                onSave={handleAddNoteSave} 
            />
            
            {showStageModal && order && (
                <StageChangeModal
                    current={order.workflow_stage as WorkflowStage}
                    stages={workflowStages}
                    onSave={handleStageSave}
                    onClose={() => setShowStageModal(false)}
                    order={order}
                />
            )}

            <ArchivePatientModal
                isOpen={showArchiveModal}
                onClose={() => setShowArchiveModal(false)}
                onConfirm={handleArchiveConfirm}
                isArchiving={isArchiving}
                patientName={patient.name || 'this patient'}
                isArchived={!!patient.archived}
            />
            
            <SimpleConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={handleDeleteConfirm}
                isLoading={isDeleting}
                title="Permanently Delete Patient?"
                message={<>Are you sure you want to permanently delete <strong>{patient?.name}</strong> and all their associated data (referrals, notes, etc.)? <br /><strong className="text-red-600">This action is irreversible.</strong></>}
                confirmButtonText="Yes, Delete Patient"
                confirmButtonVariant="danger"
            />
        </div>
    );
};

export default PatientDetailPage;
