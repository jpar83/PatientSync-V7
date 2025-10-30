/*
# [Function] get_analytics_data
Creates a new RPC function to dynamically query and aggregate referral data for the analytics page.

## Query Description: [This function allows for complex filtering and grouping of referral data directly in the database, improving performance by offloading work from the client. It calculates key KPIs and returns a timeseries or dimension-grouped dataset.]

## Metadata:
- Schema-Category: ["Structural", "Safe"]
- Impact-Level: ["Low"]
- Requires-Backup: [false]
- Reversible: [true]

## Structure Details:
- Creates a new function: `get_analytics_data`

## Security Implications:
- RLS Status: [Enabled]
- Policy Changes: [No]
- Auth Requirements: [authenticated]

## Performance Impact:
- Indexes: [Relies on existing indexes on `orders` and `patients` tables]
- Triggers: [None]
- Estimated Impact: [Low, as it's a read-only function.]
*/
create or replace function get_analytics_data(
    start_date_param date,
    end_date_param date,
    group_by_period text,
    group_by_dimension text,
    filter_territories text[] default null,
    filter_payers text[] default null,
    filter_stages text[] default null,
    filter_docs_ready boolean default null
)
returns json as $$
begin
    return (
        with filtered_referrals as (
            select
                o.id,
                coalesce(o.referral_date, o.created_at) as effective_date,
                p.primary_insurance as payer,
                o.payer_region as territory,
                o.workflow_stage as stage,
                (
                    (select count(*) filter (where value = '"Complete"') from jsonb_each_text(o.document_status)) = cardinality(p.required_documents)
                    and cardinality(p.required_documents) > 0
                ) as is_docs_ready
            from orders o
            join patients p on o.patient_id = p.id
            where coalesce(o.referral_date, o.created_at)::date between start_date_param and end_date_param
              and (filter_territories is null or o.payer_region = any(filter_territories))
              and (filter_payers is null or p.primary_insurance = any(filter_payers))
              and (filter_stages is null or o.workflow_stage = any(filter_stages))
        ),
        filtered_by_docs_ready as (
            select * from filtered_referrals
            where filter_docs_ready is null or is_docs_ready = filter_docs_ready
        ),
        kpis as (
            select
                count(*) as total_referrals,
                count(*) filter (where is_docs_ready) as docs_ready_count,
                case when count(*) > 0 then (count(*) filter (where is_docs_ready))::float / count(*)::float * 100 else 0 end as docs_ready_rate,
                (
                    select to_char(date_trunc(group_by_period, effective_date), 'YYYY-MM-DD')
                    from filtered_by_docs_ready
                    group by 1
                    order by count(*) desc
                    limit 1
                ) as busiest_period
            from filtered_by_docs_ready
        ),
        timeseries as (
            select
                case
                    when group_by_dimension = 'time' then to_char(date_trunc(group_by_period, effective_date), 'YYYY-MM-DD')
                    when group_by_dimension = 'payer' then coalesce(payer, 'N/A')
                    when group_by_dimension = 'territory' then coalesce(territory, 'N/A')
                    when group_by_dimension = 'stage' then coalesce(stage, 'N/A')
                end as period,
                count(*) as total_referrals,
                count(*) filter (where is_docs_ready) as docs_ready
            from filtered_by_docs_ready
            group by 1
            order by 1
        )
        select json_build_object(
            'kpis', (select to_json(k) from kpis k),
            'timeseries', (select coalesce(json_agg(ts), '[]'::json) from timeseries ts)
        )
    );
end;
$$ language plpgsql stable;
