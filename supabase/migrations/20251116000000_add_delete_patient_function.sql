/*
# [Function] delete_patient_and_all_referrals
Deletes a patient and all of their associated data, including all referrals, notes, equipment, denials, and history.

## Query Description: [This is a highly destructive operation that will permanently remove a patient and all their related records from the database. This includes all historical referral data, notes, and equipment logs associated with the patient. This action cannot be undone. It is recommended to archive patients instead of deleting them unless you are certain the data is no longer needed and must be purged for compliance or other reasons. Please ensure you have a backup before proceeding.]

## Metadata:
- Schema-Category: "Dangerous"
- Impact-Level: "High"
- Requires-Backup: true
- Reversible: false

## Structure Details:
- Deletes from: public.patients
- Cascading deletes (or manual deletes) from: public.orders, public.patient_notes, public.equipment, public.denials, public.workflow_history

## Security Implications:
- RLS Status: Assumes RLS is enabled. The function is defined with `SECURITY DEFINER` to allow deletion across tables, but is restricted to roles that can execute it.
- Policy Changes: No
- Auth Requirements: Should be restricted to admin-level roles.

## Performance Impact:
- Indexes: Uses indexes on foreign keys for efficient deletion.
- Triggers: May fire triggers on the affected tables.
- Estimated Impact: High impact for patients with many referrals. Should be fast for patients with few records.
*/
create or replace function public.delete_patient_and_all_referrals(p_patient_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  order_ids uuid[];
begin
  -- Get all order IDs for the patient
  select array_agg(id) into order_ids from public.orders where patient_id = p_patient_id;

  if array_length(order_ids, 1) > 0 then
    -- Delete dependents of orders first to avoid FK violations if CASCADE is not set
    delete from public.denials where order_id = any(order_ids);
    delete from public.equipment where order_id = any(order_ids);
    delete from public.workflow_history where order_id = any(order_ids);
  end if;

  -- Delete notes associated with the patient
  delete from public.patient_notes where patient_id = p_patient_id;
  
  -- Delete orders associated with the patient
  delete from public.orders where patient_id = p_patient_id;

  -- Finally, delete the patient
  delete from public.patients where id = p_patient_id;

  -- The function doesn't need to return anything
end;
$$;
