import React from 'react';
import PatientDrawerAdaptive from './PatientDrawerAdaptive';
import type { Patient } from '../lib/types';

// This component is now a wrapper to ensure the correct adaptive component is always used,
// resolving inconsistencies between mobile and desktop views.
export default function PatientDrawerMobile({ patient, open, onClose, onUpdate }: { patient: Patient | null, open: boolean, onClose: () => void, onUpdate: () => void }) {
    const patientId = patient ? patient.id : null;

    return (
        <PatientDrawerAdaptive
            patientId={patientId}
            open={open}
            onClose={onClose}
            onUpdate={onUpdate}
        />
    );
}
