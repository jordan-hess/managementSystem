-- Team-leader rotation: corrects the 4 personal patterns from a 30-day
-- cycle to the real 28-day one.
--
-- WHAT WAS WRONG
--
-- team-leader-personal-rotation-patterns.sql seeded E/F/G/H/I by taking a
-- September 2026 roster CSV and using the whole calendar month as the cycle,
-- and says so in its own header: "these 5 patterns are 30 days long
-- (September in full), not the 28 the 4 existing Social-team patterns use".
--
-- Two compounding errors:
--
--   1. CYCLE LENGTH. The real team-leader rotation is 28 days, like the
--      Social-team patterns A-D. Storing it as 30 makes the roster slip 2
--      days every cycle. September happened to look right (the pattern was
--      copied from it), and every month after drifted further - which is
--      why this presented as "the rotation breaks across month boundaries".
--      Measured against the real roster, the stored patterns were wrong on
--      10-18 of September's 30 days and 18-24 of October's 31.
--
--   2. WRONG SOURCE MONTH. The CSV it was built from was the merged
--      roster+attendance export, not the planned roster. That export is the
--      system's own (already incorrect) output with SL/AL overlaid, so the
--      seed encoded the bug it was meant to fix.
--
-- WHAT IS RIGHT
--
-- Source: the October 2026 team-leader roster, which is clean (no
-- exceptions) and self-proves the cycle length - for all four leaders,
-- Oct 29-31 reproduce Oct 1-3 exactly. Cross-checked against the September
-- planned roster, which continues into it seamlessly: Sep 3-30 reproduce
-- Oct 1-28 exactly for Taylor and Jamie. Casey and Riley each differ
-- on one adjacent-day swap (Casey Sep 14<->15, Riley Sep 7<->8) where an
-- OFF and an 8:00 traded places - one-off manual swaps, which belong in
-- roster_overrides, not in the rotation.
--
-- Sequences were generated programmatically from the October CSV, not
-- hand-transcribed. anchor_date is 2026-10-01, so shift_sequence[1] is
-- literally that leader's 1 October shift and the mapping can be
-- eyeballed against the source roster.
--
-- No application code changes: lib/roster/rotationEngine.ts already handles
-- any cycle length against any anchor with a single modulo and no
-- month-boundary branch. The engine was never the bug - the data was.
--
-- Coverage invariant preserved: on every day of the 28-day cycle at least
-- one leader is on 8:00 and exactly one is on 11:00 (one day carries two
-- lates, none carries zero).
--
-- NOT CHANGED: pattern H (seeded for "Gershon") is left as-is. No profile
-- references it, and the October roster covers only the four active
-- leaders, so there is no source to rebuild it from. If that slot becomes
-- active again it needs its own 28-day sequence.
--
-- Apply by hand, as with every file in this directory. DATABASE_URL lives
-- in .env.local and never reaches your shell, so export it first:
--   Git Bash:   export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env.local)"
--   PowerShell: $env:DATABASE_URL = ((Select-String -Path .env.local -Pattern '^DATABASE_URL=').Line -replace '^DATABASE_URL=','')
--   psql "$DATABASE_URL" -c "select current_database(), inet_server_addr();"
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f Database/migrations/fix-tl-rotation-to-28-day-cycle-2026-09-23.sql
--
-- Idempotent - re-running sets the same values.

BEGIN;

-- Taylor Brooks
UPDATE roster_rotation_patterns SET
  shift_sequence = '{EARLY,EARLY,OFF,OFF,EARLY,LATE,LATE,LATE,LATE,OFF,OFF,EARLY,EARLY,EARLY,OFF,OFF,LATE,LATE,LATE,OFF,OFF,EARLY,EARLY,EARLY,EARLY,EARLY,OFF,EARLY}'::roster_shift[],
  anchor_date = '2026-10-01',
  updated_at = NOW()
WHERE code = 'E';

-- Jamie Carter
UPDATE roster_rotation_patterns SET
  shift_sequence = '{LATE,LATE,OFF,OFF,LATE,EARLY,EARLY,OFF,OFF,LATE,LATE,LATE,OFF,OFF,EARLY,EARLY,EARLY,EARLY,EARLY,OFF,EARLY,EARLY,EARLY,EARLY,OFF,EARLY,LATE,LATE}'::roster_shift[],
  anchor_date = '2026-10-01',
  updated_at = NOW()
WHERE code = 'F';

-- Casey.Hughes
UPDATE roster_rotation_patterns SET
  shift_sequence = '{OFF,OFF,LATE,LATE,LATE,EARLY,EARLY,EARLY,OFF,OFF,EARLY,EARLY,OFF,EARLY,EARLY,EARLY,EARLY,OFF,EARLY,LATE,LATE,LATE,LATE,OFF,OFF,EARLY,EARLY,EARLY}'::roster_shift[],
  anchor_date = '2026-10-01',
  updated_at = NOW()
WHERE code = 'G';

-- Riley Parker
UPDATE roster_rotation_patterns SET
  shift_sequence = '{EARLY,EARLY,EARLY,EARLY,EARLY,OFF,EARLY,EARLY,EARLY,EARLY,OFF,EARLY,LATE,LATE,LATE,LATE,OFF,OFF,EARLY,EARLY,EARLY,OFF,OFF,LATE,LATE,LATE,OFF,OFF}'::roster_shift[],
  anchor_date = '2026-10-01',
  updated_at = NOW()
WHERE code = 'I';

-- Every corrected pattern must now be 28 long. Aborts the transaction
-- rather than leaving a half-corrected set behind.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM roster_rotation_patterns
  WHERE code IN ('E','F','G','I') AND array_length(shift_sequence, 1) <> 28;
  IF bad > 0 THEN
    RAISE EXCEPTION 'Expected all 4 team-leader patterns to be 28 days; % are not', bad;
  END IF;
END $$;

COMMIT;

-- Verify (expect len 28 and anchor 2026-10-01 on all four):
--   SELECT code, anchor_date, array_length(shift_sequence,1) AS len
--   FROM roster_rotation_patterns WHERE code IN ('E','F','G','I') ORDER BY code;
