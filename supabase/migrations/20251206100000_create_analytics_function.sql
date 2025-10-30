CREATE OR REPLACE FUNCTION get_analytics_data(
    start_date_param date,
    end_date_param date,
    group_by_period text,
    group_by_dimension text,
    filter_territories text[],
    filter_payers text[],
    filter_stages text[],
    filter_docs_ready boolean
)
RETURNS jsonb AS $$
DECLARE
    kpi_data jsonb;
    timeseries_data jsonb;
    sql_query text;
BEGIN
    -- KPI Calculations
    WITH filtered_referrals AS (
        SELECT
            o.id,
            COALESCE(o.referral_date, o.created_at) as effective_date,
            p.primary_insurance as payer,
            o.payer_region as territory,
            o.workflow_stage as stage,
            (SELECT COUNT(*) = COUNT(*) FILTER (WHERE o.document_status->>d.key = 'Complete') FROM unnest(p.required_documents) as d(key)) as is_docs_ready
        FROM orders o
        JOIN patients p ON o.patient_id = p.id
        WHERE COALESCE(o.referral_date, o.created_at)::date BETWEEN start_date_param AND end_date_param
        AND (filter_territories IS NULL OR o.payer_region = ANY(filter_territories))
        AND (filter_payers IS NULL OR p.primary_insurance = ANY(filter_payers))
        AND (filter_stages IS NULL OR o.workflow_stage = ANY(filter_stages))
        AND (filter_docs_ready IS NULL OR (SELECT COUNT(*) = COUNT(*) FILTER (WHERE o.document_status->>d.key = 'Complete') FROM unnest(p.required_documents) as d(key)) = filter_docs_ready)
    )
    SELECT jsonb_build_object(
        'total_referrals', COUNT(*),
        'docs_ready_count', COUNT(*) FILTER (WHERE is_docs_ready),
        'busiest_period', (SELECT period FROM (SELECT date_trunc('week', effective_date)::date as period, COUNT(*) as referrals FROM filtered_referrals GROUP BY 1 ORDER BY 2 DESC LIMIT 1) as sub),
        'docs_ready_rate', (COUNT(*) FILTER (WHERE is_docs_ready) * 100.0 / NULLIF(COUNT(*), 0))
    )
    INTO kpi_data
    FROM filtered_referrals;

    -- Timeseries/Dimension Data
    IF group_by_dimension = 'time' THEN
        sql_query := format('
            WITH filtered_referrals AS (
                SELECT COALESCE(o.referral_date, o.created_at) as effective_date,
                       (SELECT COUNT(*) = COUNT(*) FILTER (WHERE o.document_status->>d.key = ''Complete'') FROM unnest(p.required_documents) as d(key)) as is_docs_ready
                FROM orders o JOIN patients p ON o.patient_id = p.id
                WHERE COALESCE(o.referral_date, o.created_at)::date BETWEEN %L AND %L
                AND (%L IS NULL OR o.payer_region = ANY(%L))
                AND (%L IS NULL OR p.primary_insurance = ANY(%L))
                AND (%L IS NULL OR o.workflow_stage = ANY(%L))
                AND (%L IS NULL OR (SELECT COUNT(*) = COUNT(*) FILTER (WHERE o.document_status->>d.key = ''Complete'') FROM unnest(p.required_documents) as d(key)) = %L)
            )
            SELECT jsonb_agg(t) FROM (
                SELECT
                    date_trunc(%L, effective_date)::date as period,
                    COUNT(*) as total_referrals,
                    COUNT(*) FILTER (WHERE is_docs_ready) as docs_ready
                FROM filtered_referrals
                GROUP BY 1
                ORDER BY 1
            ) t',
            start_date_param, end_date_param,
            filter_territories, filter_territories,
            filter_payers, filter_payers,
            filter_stages, filter_stages,
            filter_docs_ready, filter_docs_ready,
            group_by_period
        );
    ELSE
        sql_query := format('
            WITH filtered_referrals AS (
                SELECT p.primary_insurance as payer, o.payer_region as territory, o.workflow_stage as stage
                FROM orders o JOIN patients p ON o.patient_id = p.id
                WHERE COALESCE(o.referral_date, o.created_at)::date BETWEEN %L AND %L
                AND (%L IS NULL OR o.payer_region = ANY(%L))
                AND (%L IS NULL OR p.primary_insurance = ANY(%L))
                AND (%L IS NULL OR o.workflow_stage = ANY(%L))
            )
            SELECT jsonb_agg(t) FROM (
                SELECT %I as period, COUNT(*) as total_referrals
                FROM filtered_referrals
                GROUP BY 1
                ORDER BY 2 DESC
            ) t',
            start_date_param, end_date_param,
            filter_territories, filter_territories,
            filter_payers, filter_payers,
            filter_stages, filter_stages,
            group_by_dimension
        );
    END IF;

    EXECUTE sql_query INTO timeseries_data;

    RETURN jsonb_build_object('kpis', kpi_data, 'timeseries', COALESCE(timeseries_data, '[]'::jsonb));
END;
$$ LANGUAGE plpgsql;
