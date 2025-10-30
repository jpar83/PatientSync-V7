/*
  # [Function] delete_patient_and_all_referrals
  Creates a new database function to safely delete a patient and all of their associated data, including referrals, notes, equipment, and denials.

  ## Query Description: [This is a DANGEROUS operation. It will permanently delete a patient and all associated records from the database. This includes all referrals (orders), notes, equipment logs, and denial records linked to that patient. This action cannot be undone. Ensure you have selected the correct patient before proceeding.]

  ## Metadata:
  - Schema-Category: "Dangerous"
  - Impact-Level: "High"
  - Requires-Backup: true
  - Reversible: false

  ## Structure Details:
  - Creates a new function: `delete_patient_and_all_referrals(uuid)`
  - This function will perform DELETE operations on:
    - `public.equipment`
    - `public.denials`
    - `public.workflow_history`
    - `public.orders`
    - `public.patient_notes`
    - `public.patients`

  ## Security Implications:
  - RLS Status: Not directly applicable to function creation. The function itself will run with the permissions of the definer.
  - Policy Changes: No
  - Auth Requirements: The function is defined with `SECURITY DEFINER`, meaning it runs with the permissions of the user who created it (typically an admin).

  ## Performance Impact:
  - Indexes: No change.
  - Triggers: No change.
  - Estimated Impact: The function's performance will depend on the number of associated records for a given patient. Deleting a patient with many referrals and notes will be more intensive than deleting one with few.
*/
create or replace function public.delete_patient_and_all_referrals(p_patient_id uuid)
returns void as $$
declare
  order_ids uuid[];
begin
  -- Collect all order IDs for the patient
  select array_agg(id) into order_ids from public.orders where patient_id = p_patient_id;

  -- Delete dependents of orders if any exist
  if array_length(order_ids, 1) > 0 then
    delete from public.equipment where order_id = any(order_ids);
    delete from public.denials where order_id = any(order_ids);
    delete from public.workflow_history where order_id = any(order_ids);
  end if;
  
  -- Delete orders associated with the patient
  delete from public.orders where patient_id = p_patient_id;

  -- Delete patient notes
  delete from public.patient_notes where patient_id = p_patient_id;
  
  -- Finally, delete the patient record
  delete from public.patients where id = p_patient_id;
end;
$$ language plpgsql security definer;
