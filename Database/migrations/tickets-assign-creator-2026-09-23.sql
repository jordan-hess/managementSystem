-- Backfills tickets.assigned_to with the ticket's creator for every ticket
-- that has never been assigned to anyone.
--
-- Until now nothing wrote assigned_to at creation - it was only ever set by
-- a transfer (lib/activeAssistance/actions.ts) or a callback reassign
-- (app/(app)/t2/actions.ts). So every ticket a Social agent raised against a
-- T2 queue showed up in the Tickets list as "Unassigned" (the list joins the
-- assignee's name - components/tickets/TicketListTable.tsx), with the raiser's
-- name visible only in the ticket history, and the list's "filter by assigned
-- agent" dropdown - which matches on assigned_to - returned none of them.
--
-- createTicketAction and createBillingTicketAction now set assigned_to at
-- INSERT, so this file only has to catch the tickets that already exist.
-- Apply it with `psql -f` once, after the code that writes assigned_to is
-- deployed; until it runs, existing tickets keep reading "Unassigned".
--
-- WHERE assigned_to IS NULL is what makes this safe and re-runnable: a ticket
-- that was genuinely handed to someone else keeps that assignee, and running
-- the file twice changes nothing the second time.
--
-- created_by is NOT NULL on this table, so every matched row gets a real
-- assignee - no row is left NULL by this update.

BEGIN;

UPDATE tickets
SET assigned_to = created_by
WHERE assigned_to IS NULL;

-- Expect 0 after the update. Anything else means a row had a NULL created_by,
-- which the schema is not supposed to allow - investigate before COMMIT.
SELECT count(*) AS still_unassigned FROM tickets WHERE assigned_to IS NULL;

COMMIT;
