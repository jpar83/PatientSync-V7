import React from 'react';
import ModalFormShell from "@/components/ui/ModalFormShell";
import EditPatientDetails from "@/components/EditPatientDetails";
import { Button } from "@/components/ui/button";
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import type { Patient, Order } from '@/lib/types';

type Props = {
  open: boolean;
  onClose: () => void;
  patientId: string | null;
  onSaved?: () => void;
};

export default function EditPatientModal({ open, onClose, patientId, onSaved }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['patient_edit_modal_data', patientId],
    queryFn: async () => {
        if (!patientId) return null;
        const { data: patientData, error: patientError } = await supabase.from('patients').select('*').eq('id', patientId).single();
        if (patientError) throw patientError;
        
        const { data: orderData } = await supabase.from('orders').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(1).single();
        
        return { patient: patientData as Patient, order: (orderData as Order) || null };
    },
    enabled: !!patientId && open,
  });

  return (
    <ModalFormShell
      open={open}
      onClose={onClose}
      title="Edit Patient"
      maxWidthClass="sm:max-w-3xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button form="edit-patient-form" type="submit">Save Patient</Button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex justify-center items-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : data ? (
        <EditPatientDetails
          patient={data.patient}
          order={data.order}
          formId="edit-patient-form"
          onSaved={() => { onClose(); onSaved?.(); }}
        />
      ) : (
        <div className="text-center p-8">Patient data could not be loaded.</div>
      )}
    </ModalFormShell>
  );
}
