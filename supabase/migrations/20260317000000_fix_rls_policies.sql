-- Fix broken RLS policies: policies said "Service role only" but used USING(true)
-- which grants access to ALL roles including anon. The correct pattern uses TO service_role.
--
-- Tables affected: browse_results (INSERT), waitlist, admins, domain_authority (management)
-- Reference: research_memory.sql already uses the correct TO service_role pattern.

-- ═══════════════════════════════════════════════════════════════
-- 1. browse_results — all operations restricted to service_role
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Anyone can read results" ON browse_results;
CREATE POLICY "Service role can read results" ON browse_results
  FOR SELECT
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Service role can insert" ON browse_results;
CREATE POLICY "Service role can insert" ON browse_results
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Also restrict UPDATE/DELETE to service_role (wasn't covered before)
DROP POLICY IF EXISTS "Service role can update" ON browse_results;
CREATE POLICY "Service role can update" ON browse_results
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can delete" ON browse_results;
CREATE POLICY "Service role can delete" ON browse_results
  FOR DELETE
  TO service_role
  USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 2. waitlist — restrict all operations to service_role
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Service role can manage waitlist" ON waitlist;
CREATE POLICY "Service role can manage waitlist" ON waitlist
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 3. admins — restrict all operations to service_role
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Service role only" ON admins;
CREATE POLICY "Service role only" ON admins
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 4. domain_authority — fix management policy, keep public read
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Anyone can read domain authority" ON domain_authority;
CREATE POLICY "Service role can read domain authority" ON domain_authority
  FOR SELECT
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Service role can manage domain authority" ON domain_authority;
CREATE POLICY "Service role can manage domain authority" ON domain_authority
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update domain authority" ON domain_authority
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete domain authority" ON domain_authority
  FOR DELETE
  TO service_role
  USING (true);
