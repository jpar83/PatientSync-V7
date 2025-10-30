import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";
import type { Patient, Order } from '../lib/types';
import { usStates, preferredContactMethods } from "../lib/formConstants";
import DocumentConfigurator from "./DocumentConfigurator";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "@/lib/toast";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { addNote as apiAddNote } from "@/api/notes.api";

const recommendedFields: (keyof Patient)[] = ['name', 'dob', 'pcp_name', 'phone_number', 'address_line1', 'city', 'zip', 'primary_insurance'];

const Section = ({ id, title, children, isOpen, toggle }: { id: string, title: string, children: React.ReactNode, isOpen: boolean, toggle: () => void }) => (
  <div className="py-2">
    <button
      type="button"
      onClick={toggle}
      className="flex justify-between w-full text-left font-semibold text-text hover:text-accent"
    >
      {title}
      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
    </button>
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key={id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden mt-3 space-y-3 text-sm"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

interface EditPatientDetailsProps {
    patient: Patient;
    order: Order | null;
    formId: string;
    onSaved: () => void;
}

export default function EditPatientDetails({ patient, order, formId, onSaved }: EditPatientDetailsProps) {
  const [patientData, setPatientData] = useState<Partial<Patient>>(patient);
  const [orderData, setOrderData] = useState<Partial<Order>>(order || {});
  const [openSection, setOpenSection] = useState("patient");
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const formatDate = (dateStr: string | null | undefined) => dateStr ? new Date(dateStr).toISOString().split('T')[0] : '';
    setPatientData({ ...patient, dob: formatDate(patient.dob) });
    setOrderData({ ...order, referral_date: formatDate(order?.referral_date) } || {});
  }, [patient, order]);
  
  const handlePatientChange = (key: keyof Patient, value: any) => {
    setPatientData(p => ({ ...p, [key]: value }));
  };

  const handleOrderChange = (key: keyof Order, value: any) => {
    setOrderData(o => ({ ...o, [key]: value }));
  };

  const toggle = (id: string) => setOpenSection(openSection === id ? "" : id);

  const getOrCreateProviderId = async (name: string | null | undefined): Promise<string | null> => {
    if (!name?.trim()) return null;
    const normalizedName = name.trim().toUpperCase();

    const { data: existing } = await supabase
        .from('insurance_providers')
        .select('id')
        .eq('name', normalizedName)
        .single();

    if (existing) return existing.id;

    const { data: created, error: createError } = await supabase
        .from('insurance_providers')
        .insert({ name: normalizedName, source: 'form-edit' })
        .select('id')
        .single();
    
    if (createError) throw createError;
    toast(`New provider "${normalizedName}" added.`, 'ok');
    queryClient.invalidateQueries({ queryKey: ['insurance_providers'] });
    return created.id;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    setIsSaving(true);

    const providerId = await getOrCreateProviderId(patientData.primary_insurance);
    
    const patientPayload = { ...patientData, insurance_provider_id: providerId };
    delete patientPayload.id; delete patientPayload.created_at;
    if (patientPayload.dob === '') { patientPayload.dob = null; }

    try {
      const { data: updatedPatient, error: patientUpdateError } = await supabase.from('patients').update(patientPayload).eq('id', patient.id).select().single();
      if (patientUpdateError) throw patientUpdateError;
      
      if(order?.id) {
        const orderPayload = { ...orderData };
        delete orderPayload.id; delete orderPayload.created_at; delete orderPayload.patients; delete orderPayload.vendors;
        const { error: orderUpdateError } = await supabase.from('orders').update(orderPayload).eq('id', order.id);
        if (orderUpdateError) throw orderUpdateError;
      }
      
      await apiAddNote({
        patient_id: patient.id,
        body: 'Patient details updated.',
        source: 'manual',
      });
      
      const missingRecommended = recommendedFields.some(field => !patientData[field]);
      if (missingRecommended) toast('Saved with missing recommended fields.', 'warning');
      else toast('Patient details saved successfully.', 'ok');
      
      onSaved();
    } catch (error: any) {
      console.error("Failed to save patient details:", error);
      if (error.code === '23505') {
          toast('This email address is already in use.', 'err');
      } else {
          toast(`Failed to save patient details.`, 'err');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      {isSaving && <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10"><Loader2 className="h-6 w-6 animate-spin" /></div>}
      <Section id="patient" title="Patient Information" isOpen={openSection === 'patient'} toggle={() => toggle('patient')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
            <Input label="Full Name" name="name" value={patientData.name || ''} onChange={(e) => handlePatientChange('name', e.target.value)} isRecommended />
            <Input label="Date of Birth" name="dob" type="date" value={patientData.dob || ''} onChange={(e) => handlePatientChange('dob', e.target.value)} isRecommended />
            <Input label="Referral Start Date" name="referral_date" type="date" value={orderData.referral_date || ''} onChange={(e) => handleOrderChange('referral_date', e.target.value)} isRecommended />
            <Input label="Gender" name="gender" value={patientData.gender || ''} onChange={(e) => handlePatientChange('gender', e.target.value)} />
            <Input label="Referring Doctor" name="referring_physician" value={patientData.referring_physician || ''} onChange={(e) => handlePatientChange('referring_physician', e.target.value)} />
            <Input label="Primary Care Provider (PCP)" name="pcp_name" value={patientData.pcp_name || ''} onChange={(e) => handlePatientChange('pcp_name', e.target.value)} isRecommended />
            <Input label="PCP Phone/Fax" name="pcp_phone" value={patientData.pcp_phone || ''} onChange={(e) => handlePatientChange('pcp_phone', e.target.value)} />
        </div>
      </Section>
      
      <Section id="contact" title="Contact Information" isOpen={openSection === 'contact'} toggle={() => toggle('contact')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
              <Input label="Phone Number" name="phone_number" type="tel" value={patientData.phone_number || ''} onChange={(e) => handlePatientChange('phone_number', e.target.value)} isRecommended />
              <Input label="Email" name="email" type="email" value={patientData.email || ''} onChange={(e) => handlePatientChange('email', e.target.value)} />
              <Input label="Address Line 1" name="address_line1" value={patientData.address_line1 || ''} onChange={(e) => handlePatientChange('address_line1', e.target.value)} wrapperClassName="sm:col-span-2" isRecommended />
              <Input label="Address Line 2" name="address_line2" value={patientData.address_line2 || ''} onChange={(e) => handlePatientChange('address_line2', e.target.value)} wrapperClassName="sm:col-span-2" />
              <Input label="City" name="city" value={patientData.city || ''} onChange={(e) => handlePatientChange('city', e.target.value)} isRecommended />
              <Select label="State" name="state" options={usStates} value={patientData.state || ''} onChange={(e) => handlePatientChange('state', e.target.value)} isRecommended />
              <Input label="ZIP Code" name="zip" value={patientData.zip || ''} onChange={(e) => handlePatientChange('zip', e.target.value)} isRecommended />
              <Select label="Preferred Contact Method" name="preferred_contact_method" options={preferredContactMethods} value={patientData.preferred_contact_method || ''} onChange={(e) => handlePatientChange('preferred_contact_method', e.target.value)} />
          </div>
      </Section>

      <Section id="insurance" title="Insurance" isOpen={openSection === 'insurance'} toggle={() => toggle('insurance')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
              <Input label="Primary Insurance" name="primary_insurance" value={patientData.primary_insurance || ''} onChange={(e) => handlePatientChange('primary_insurance', e.target.value)} isRecommended />
              <Input label="Policy Number" name="policy_number" value={patientData.policy_number || ''} onChange={(e) => handlePatientChange('policy_number', e.target.value)} />
              <Input label="Group Number" name="group_number" value={patientData.group_number || ''} onChange={(e) => handlePatientChange('group_number', e.target.value)} />
          </div>
      </Section>

      <Section id="docs" title="Documents & Exceptions" isOpen={openSection === 'docs'} toggle={() => toggle('docs')}>
          <DocumentConfigurator
              patient={patientData}
              order={orderData}
              onPatientUpdate={(key, val) => handlePatientChange(key as keyof Patient, val)}
              onOrderUpdate={(key, val) => handleOrderChange(key as keyof Order, val)}
          />
      </Section>
    </form>
  );
}
