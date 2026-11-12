-- Holistic QA Platform — seeds the 8 dm_call_combined criteria and their 40
-- rating-definition rows, transcribed verbatim from the client's "
-- Quality Scorecard – DM + Call (Combined Case)" CSV. 7 of the 8 codes are
-- shared with the other channels (same code, channel-specific label/weight/
-- rating text, same pattern as qa-platform-seed-criteria-and-ratings.sql);
-- cross_channel_consistency_handoff is new, introduced by this scorecard
-- only. Weights: 10/10/15/25/20/10/5/5 = 100.
--
-- The CSV's own criterion grid only gives short names (e.g. "Professionalism
-- & Brand Tone"), not the longer dash-suffixed descriptions the other three
-- channels' labels carry. For the 6 codes whose CSV name is textually
-- identical (or near-identical) to social_media's existing label, this reuses
-- social_media's description verbatim rather than inventing new copy — the
-- CSV's own text (e.g. "Product & Process Knowledge, SLA & Compliance") is a
-- character-for-character match to social_media's label prefix, strong
-- evidence this scorecard was derived from it. cross_channel_consistency_handoff
-- has no equivalent elsewhere, so its description is composed directly from
-- the CSV's own rating-5 anchor text for that row. Idempotent.

INSERT INTO qa_criteria (code, channel, label, weight, sort_order) VALUES
  ('greeting_professionalism', 'dm_call_combined', 'Professionalism & Brand Tone — Professional greeting, appropriate brand tone, confident and respectful communication', 10, 1),
  ('customer_verification_security', 'dm_call_combined', 'Security & Channel Compliance — Ensures no personal or account related information is displayed publicly', 10, 2),
  ('understanding_the_issue', 'dm_call_combined', 'Understanding the Issue — Uses tools to investigate query, asks relevant questions, and accurately identifies the customer''s reason for contact', 15, 3),
  ('technical_knowledge_process_compliance', 'dm_call_combined', 'Product & Process Knowledge, SLA & Compliance — Provides accurate information about internet packages, coverage, devices, connectivity, billing and troubleshooting; follows required processes, escalation rules and SLA requirements, while ensuring the case is accurately and completely documented for future interactions', 25, 4),
  ('resolution_ownership', 'dm_call_combined', 'Resolution, Ownership & Follow-Up (FCR) — Takes ownership, provides the correct resolution, avoids unnecessary transfers and follows through', 20, 5),
  ('communication_customer_experience', 'dm_call_combined', 'Communication, Empathy & Readability — Communicates clearly and concisely, demonstrates empathy, uses appropriate spelling and grammar, and structures responses so they are easy to read and understand', 10, 6),
  ('cross_channel_consistency_handoff', 'dm_call_combined', 'Cross-Channel Consistency & Handoff — Ensures a seamless handoff between the social/DM thread and the call, with no repetition or contradiction between channels', 5, 7),
  ('case_documentation', 'dm_call_combined', 'Case Documentation — Leaves accurate, complete and useful notes for future interactions', 5, 8)
ON CONFLICT (code, channel) WHERE channel IS NOT NULL DO NOTHING;

INSERT INTO qa_rating_definitions (criterion_id, channel, rating, definition_text)
SELECT c.id, c.channel, v.rating, v.definition_text
FROM (VALUES
  ('greeting_professionalism', 'dm_call_combined', 1, 'Unprofessional, defensive or inappropriate tone (social) / no proper greeting, distracted or background noise (call); risk to brand reputation.'),
  ('greeting_professionalism', 'dm_call_combined', 2, 'Noticeably scripted/robotic reply, or flat/curt tone with slipping professionalism on the call.'),
  ('greeting_professionalism', 'dm_call_combined', 3, 'Professional but flat; misses the brand personality, or greeting misses a required element.'),
  ('greeting_professionalism', 'dm_call_combined', 4, 'Professional and polite; slightly generic/template tone, or a little scripted/rushed.'),
  ('greeting_professionalism', 'dm_call_combined', 5, 'Warm, on-brand and friendly throughout — matches the brand''s public voice or a genuinely warm greeting.'),

  ('customer_verification_security', 'dm_call_combined', 1, 'Sensitive account/personal info shared or requested publicly; or no verification performed before discussing the account.'),
  ('customer_verification_security', 'dm_call_combined', 2, 'Details requested/discussed in a way that risks exposure; or verification attempted but incomplete.'),
  ('customer_verification_security', 'dm_call_combined', 3, 'Loop left open / info requested in a semi-secure way; or one required verification check missed.'),
  ('customer_verification_security', 'dm_call_combined', 4, 'Correct move to DM with a small delay, or full verification with one step rushed/out of order.'),
  ('customer_verification_security', 'dm_call_combined', 5, 'Moves to a secure/private channel before discussing details, and/or completes full verification correctly (name + DOB + required checks).'),

  ('understanding_the_issue', 'dm_call_combined', 1, 'Misreads or ignores the actual complaint/question; no investigation or active listening evident.'),
  ('understanding_the_issue', 'dm_call_combined', 2, 'Partial understanding; response doesn''t fully match what was raised, or moves to troubleshooting too early.'),
  ('understanding_the_issue', 'dm_call_combined', 3, 'General understanding but misses nuance (urgency, prior contact, context).'),
  ('understanding_the_issue', 'dm_call_combined', 4, 'Understands the issue well; one more clarifying question or probe would help.'),
  ('understanding_the_issue', 'dm_call_combined', 5, 'Accurately reads tone and substance, asks the right follow-up, and confirms the real issue before acting on either channel.'),

  ('technical_knowledge_process_compliance', 'dm_call_combined', 1, 'Incorrect info given (publicly or on the call); protocol/compliance ignored; SLA breached with no communication.'),
  ('technical_knowledge_process_compliance', 'dm_call_combined', 2, 'Noticeable inaccuracies or outdated info; multiple process/SLA/authentication steps missed.'),
  ('technical_knowledge_process_compliance', 'dm_call_combined', 3, 'Adequate but generic; mostly compliant with one step missed (e.g. late DM move, SLA running close).'),
  ('technical_knowledge_process_compliance', 'dm_call_combined', 4, 'Mostly accurate; small gap that didn''t affect the outcome; very minor process deviation.'),
  ('technical_knowledge_process_compliance', 'dm_call_combined', 5, 'Accurate, confident info on products/coverage/troubleshooting; every process, escalation, authentication and SLA step followed correctly.'),

  ('resolution_ownership', 'dm_call_combined', 1, 'Incorrect or no resolution; no ownership; issue left unresolved; required process not followed.'),
  ('resolution_ownership', 'dm_call_combined', 2, 'Limited ownership; key info missed; incomplete resolution; customer left to chase; unnecessary back-and-forth.'),
  ('resolution_ownership', 'dm_call_combined', 3, 'Accurate info and appropriate resolution, process followed; an avoidable transfer or lack of follow-up may leave it not fully closed.'),
  ('resolution_ownership', 'dm_call_combined', 4, 'Takes ownership, accurate resolution, manages expectations, minimal unnecessary transfers; confirmation could be stronger.'),
  ('resolution_ownership', 'dm_call_combined', 5, 'Owns the issue end-to-end, tailored resolution, proactively addresses related concerns, no unnecessary transfers, confirms resolution on both channels.'),

  ('communication_customer_experience', 'dm_call_combined', 1, 'Poor, dismissive or tone-deaf communication; rude or impatient; long dead air on the call.'),
  ('communication_customer_experience', 'dm_call_combined', 2, 'Unclear, overly long, or mismatched to the channel; customer has to ask for clarification often.'),
  ('communication_customer_experience', 'dm_call_combined', 3, 'Understandable but generic/corporate for social, or a little clinical on the call.'),
  ('communication_customer_experience', 'dm_call_combined', 4, 'Clear and professional; could be warmer, more concise, or offer more reassurance.'),
  ('communication_customer_experience', 'dm_call_combined', 5, 'Warm, human, jargon-free communication that reassures the customer and turns the contact into a positive moment.'),

  ('cross_channel_consistency_handoff', 'dm_call_combined', 1, 'Call contradicts or repeats what was already covered on social; escalation to a call was avoidable or badly handled; customer has to re-explain everything.'),
  ('cross_channel_consistency_handoff', 'dm_call_combined', 2, 'Some inconsistency between channels; handoff caused noticeable friction or repetition.'),
  ('cross_channel_consistency_handoff', 'dm_call_combined', 3, 'Broadly consistent; customer repeats minor details when moving from social to the call.'),
  ('cross_channel_consistency_handoff', 'dm_call_combined', 4, 'Consistent across channels with a smooth handoff; a small gap in context carried over.'),
  ('cross_channel_consistency_handoff', 'dm_call_combined', 5, 'Seamless handoff — the call picks up exactly where the ticket left off, no repetition, fully consistent information.'),

  ('case_documentation', 'dm_call_combined', 1, 'Interaction(s) not logged at all; no notes; closed under the wrong category.'),
  ('case_documentation', 'dm_call_combined', 2, 'Log thin, inconsistent, or partially inaccurate; ticket and call not linked.'),
  ('case_documentation', 'dm_call_combined', 3, 'Basic log; lacks detail on outcome or actions taken; ambiguous notes.'),
  ('case_documentation', 'dm_call_combined', 4, 'Logged well with a minor gap (e.g. missing timestamp or reference).'),
  ('case_documentation', 'dm_call_combined', 5, 'Both the ticket and the call are logged completely and accurately, and linked to each other.')
) AS v(code, channel, rating, definition_text)
JOIN qa_criteria c ON c.code = v.code AND c.channel = v.channel
ON CONFLICT (criterion_id, channel, rating) WHERE channel IS NOT NULL DO NOTHING;