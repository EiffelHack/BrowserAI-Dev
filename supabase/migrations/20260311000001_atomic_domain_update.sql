-- Atomic domain authority update function.
-- Uses Postgres atomic operations so concurrent requests don't lose samples.
-- Called after each query with per-domain verification signals.

CREATE OR REPLACE FUNCTION update_domain_scores(
  updates jsonb -- Array of {domain, verified_count, total_count}
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
  d text;
  v_count int;
  t_count int;
  existing record;
  new_score numeric;
  new_count int;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    d := item->>'domain';
    v_count := (item->>'verified_count')::int;
    t_count := (item->>'total_count')::int;

    -- Lock the row to prevent concurrent updates
    SELECT dynamic_score, sample_count INTO existing
    FROM domain_authority
    WHERE domain = d
    FOR UPDATE;

    IF FOUND THEN
      -- Incremental mean: for each sample, blend into running average
      new_count := COALESCE(existing.sample_count, 0) + t_count;
      IF COALESCE(existing.sample_count, 0) = 0 THEN
        new_score := CASE WHEN t_count > 0 THEN v_count::numeric / t_count ELSE 0 END;
      ELSE
        -- Running average: old_avg + (new_batch_avg - old_avg) * batch_size / new_total
        new_score := COALESCE(existing.dynamic_score, 0.5) +
          (CASE WHEN t_count > 0 THEN v_count::numeric / t_count ELSE 0 END - COALESCE(existing.dynamic_score, 0.5))
          * t_count::numeric / new_count;
      END IF;

      UPDATE domain_authority
      SET dynamic_score = ROUND(new_score::numeric, 4),
          sample_count = new_count,
          updated_at = now()
      WHERE domain = d;
    ELSE
      -- Domain not in table yet — insert with dynamic score only
      INSERT INTO domain_authority (domain, tier, static_score, dynamic_score, sample_count, curated)
      VALUES (
        d,
        3, -- default mid-tier
        0.50, -- neutral static score
        ROUND((CASE WHEN t_count > 0 THEN v_count::numeric / t_count ELSE 0 END)::numeric, 4),
        t_count,
        false
      )
      ON CONFLICT (domain) DO UPDATE SET
        dynamic_score = ROUND((CASE WHEN t_count > 0 THEN v_count::numeric / t_count ELSE 0 END)::numeric, 4),
        sample_count = domain_authority.sample_count + t_count,
        updated_at = now();
    END IF;
  END LOOP;
END;
$$;
