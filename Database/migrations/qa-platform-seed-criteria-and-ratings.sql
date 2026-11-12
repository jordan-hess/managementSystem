-- Holistic QA Platform (Phase 1) — seeds the 21 channel-scoped criteria
-- (7 codes x 3 channels) and 105 rating-definition rows (7 x 3 x 5),
-- transcribed verbatim from the client's Quality_Scorecard_final PDFs
-- (Calls, Social Media, Tier 2). No global/NULL-channel rows — see
-- qa-platform-schema.sql's comment on qa_criteria.channel. `code` is a
-- stable positional/conceptual key shared across channels (same weight,
-- same rough intent per position in all three real scorecards); the LABEL
-- and rating text genuinely differ per channel. Note: Social Media's
-- position-4 text explicitly folds in "ensuring the case is accurately and
-- completely documented," overlapping position 7's Case Documentation —
-- transcribed verbatim as given, not deduped. Idempotent.

INSERT INTO qa_criteria (code, channel, label, weight, sort_order) VALUES
  ('greeting_professionalism', 'calls', 'Greeting & Professionalism — Professional greeting, appropriate tone, confident and respectful communication', 10, 1),
  ('customer_verification_security', 'calls', 'Customer Verification & Security — Correctly verifies the customer before discussing account-specific information', 10, 2),
  ('understanding_the_issue', 'calls', 'Understanding the Issue — Uses active listening, asks relevant questions and accurately identifies the customer''s reason for contact', 15, 3),
  ('technical_knowledge_process_compliance', 'calls', 'Technical / Product Knowledge, Process & Compliance — Provides accurate information about internet packages, coverage, devices, connectivity, billing and troubleshooting; follows company procedures, escalation rules, authentication and documentation requirements', 30, 4),
  ('resolution_ownership', 'calls', 'Resolution & Ownership — Takes ownership, provides the correct resolution, avoids unnecessary transfers and follows through', 20, 5),
  ('communication_customer_experience', 'calls', 'Communication & Customer Experience — Explains information clearly, avoids jargon and demonstrates empathy', 10, 6),
  ('case_documentation', 'calls', 'Case Documentation — Leaves accurate, complete and useful notes for future interactions', 5, 7),

  ('greeting_professionalism', 'social_media', 'Professionalism & Brand Tone — Professional greeting, appropriate brand tone, confident and respectful communication', 10, 1),
  ('customer_verification_security', 'social_media', 'Closing the loop & Public response — Ensures no personal or account related information is displayed publicly', 10, 2),
  ('understanding_the_issue', 'social_media', 'Understanding the Issue — Uses tools to investigate query, asks relevant questions, and accurately identifies the customer''s reason for contact', 15, 3),
  ('technical_knowledge_process_compliance', 'social_media', 'Product & Process Knowledge, SLA & Compliance — Provides accurate information about internet packages, coverage, devices, connectivity, billing and troubleshooting; follows required processes, escalation rules and SLA requirements, while ensuring the case is accurately and completely documented for future interactions', 30, 4),
  ('resolution_ownership', 'social_media', 'Resolution, Ownership & Follow-Up (FCR) — Takes ownership, provides the correct resolution, avoids unnecessary transfers and follows through', 20, 5),
  ('communication_customer_experience', 'social_media', 'Communication, Empathy & Readability — Communicates clearly and concisely, demonstrates empathy, uses appropriate spelling and grammar, and structures responses so they are easy to read and understand', 10, 6),
  ('case_documentation', 'social_media', 'Case Documentation — Leaves accurate, complete and useful notes for future interactions', 5, 7),

  ('greeting_professionalism', 'tier2', 'Engagement & Professionalism — Professional greeting, appropriate tone, confident and respectful communication', 10, 1),
  ('customer_verification_security', 'tier2', 'Customer Verification & Security — Correctly verifies the customer before discussing account-specific information', 10, 2),
  ('understanding_the_issue', 'tier2', 'Understanding the Issue — Uses active listening, asks relevant questions and accurately identifies the customer''s reason for contact', 15, 3),
  ('technical_knowledge_process_compliance', 'tier2', 'Technical / Product Knowledge, Process & Compliance — Provides accurate information about internet packages, coverage, devices, connectivity, billing and troubleshooting; follows company procedures, escalation rules, authentication and documentation requirements', 30, 4),
  ('resolution_ownership', 'tier2', 'Resolution & Ownership — Takes ownership, provides the correct resolution, avoids unnecessary transfers and follows through', 20, 5),
  ('communication_customer_experience', 'tier2', 'Communication & Customer Experience — Explains information clearly, avoids jargon and demonstrates empathy', 10, 6),
  ('case_documentation', 'tier2', 'Case Documentation — Leaves accurate, complete and useful notes for future interactions', 5, 7)
ON CONFLICT (code, channel) WHERE channel IS NOT NULL DO NOTHING;

INSERT INTO qa_rating_definitions (criterion_id, channel, rating, definition_text)
SELECT c.id, c.channel, v.rating, v.definition_text
FROM (VALUES
  -- Calls
  ('greeting_professionalism', 'calls', 1, 'No proper greeting; unprepared, distracted, or background noise/conversation audible.'),
  ('greeting_professionalism', 'calls', 2, 'Flat or unclear greeting; professionalism slips during the call (interruptions, curt tone).'),
  ('greeting_professionalism', 'calls', 3, 'Greeting given but lacks warmth or misses a required element (name or reason for call).'),
  ('greeting_professionalism', 'calls', 4, 'Clear, professional greeting; polite tone but a little scripted or rushed in places.'),
  ('greeting_professionalism', 'calls', 5, 'Warm, on-brand greeting stating name and reason for call; friendly, engaged tone throughout.'),

  ('customer_verification_security', 'calls', 1, 'No verification performed; account details discussed with an unverified caller.'),
  ('customer_verification_security', 'calls', 2, 'Verification attempted but incomplete before sharing account details.'),
  ('customer_verification_security', 'calls', 3, 'Partial verification; one required check (e.g. DOB) missed.'),
  ('customer_verification_security', 'calls', 4, 'Full verification completed but one step felt rushed or slightly out of order.'),
  ('customer_verification_security', 'calls', 5, 'Full verification completed correctly (name + DOB + required checks) before discussing the account.'),

  ('understanding_the_issue', 'calls', 1, 'Little to no grasp of what the customer is actually experiencing.'),
  ('understanding_the_issue', 'calls', 2, 'Partial understanding; moves to troubleshooting without fully confirming the problem.'),
  ('understanding_the_issue', 'calls', 3, 'Grasps the general issue but misses some detail or context.'),
  ('understanding_the_issue', 'calls', 4, 'Understands the issue well; could have probed once more before moving to a solution.'),
  ('understanding_the_issue', 'calls', 5, 'Actively listens, asks smart follow-up questions, and confirms the real issue before acting.'),

  ('technical_knowledge_process_compliance', 'calls', 1, 'Little to no product/technical knowledge; customer left uninformed or misinformed; process and compliance requirements largely ignored.'),
  ('technical_knowledge_process_compliance', 'calls', 2, 'Noticeable knowledge gaps; gives inaccurate info that has to be corrected; multiple process steps missed or compliance requirements not met.'),
  ('technical_knowledge_process_compliance', 'calls', 3, 'Adequate knowledge but needs prompts, hesitates, or gives a slightly incomplete answer; mostly compliant, one process step missed or done out of order.'),
  ('technical_knowledge_process_compliance', 'calls', 4, 'Mostly accurate knowledge; minor gaps that don''t affect the outcome; follows process with a very minor, non-critical deviation.'),
  ('technical_knowledge_process_compliance', 'calls', 5, 'Strong, accurate knowledge of company products, coverage, devices, and troubleshooting steps; follows every required authentication, process, and escalation step correctly.'),

  ('resolution_ownership', 'calls', 1, 'Provides incorrect or no resolution, takes no ownership, leaves the issue/complaint unresolved or unanswered, and fails to follow the required process.'),
  ('resolution_ownership', 'calls', 2, 'Shows limited understanding and ownership; misses key information, provides an incomplete resolution, leaves the customer to chase for assistance, or creates unnecessary back-and-forth.'),
  ('resolution_ownership', 'calls', 3, 'Provides accurate information and an appropriate resolution, follows the required process, and attempts to resolve the issue; an avoidable transfer or lack of follow-up may prevent the interaction from being fully closed.'),
  ('resolution_ownership', 'calls', 4, 'Takes ownership of the issue, provides an accurate resolution, manages expectations, minimises unnecessary transfers and back-and-forth, and follows up where required; confirmation of resolution could be stronger.'),
  ('resolution_ownership', 'calls', 5, 'Owns the issue end-to-end, fully understands the customer''s needs, provides an accurate and tailored resolution, proactively addresses related concerns, avoids unnecessary transfers and repeat contact, follows through, confirms the issue is resolved, and ensures the customer has no further assistance required.'),

  ('communication_customer_experience', 'calls', 1, 'Poor communication: confusing, unprofessional, or dismissive tone; impatient and unprofessional tone; dead air on contact.'),
  ('communication_customer_experience', 'calls', 2, 'Communication is unclear or inconsistent; customer has to ask for clarification often; speaking over the customer; dead air on the call, long hold with no acknowledgement.'),
  ('communication_customer_experience', 'calls', 3, 'Understandable but a little clinical, technical, or short on empathy; customer needing to repeat information on call; unnecessary hold.'),
  ('communication_customer_experience', 'calls', 4, 'Clear and professional; empathy present but could offer more reassurance or plain language.'),
  ('communication_customer_experience', 'calls', 5, 'Clear, warm, jargon-free communication; genuine empathy; customer feels reassured and valued.'),

  ('case_documentation', 'calls', 1, 'No notes logged, or notes are missing/incorrect.'),
  ('case_documentation', 'calls', 2, 'Notes are thin or partially inaccurate.'),
  ('case_documentation', 'calls', 3, 'Notes cover the basics but lack detail on actions taken.'),
  ('case_documentation', 'calls', 4, 'Notes are good with minor gaps (e.g. missing a timestamp or reference).'),
  ('case_documentation', 'calls', 5, 'Notes are complete and accurate; any colleague could pick up the case seamlessly.'),

  -- Social Media
  ('greeting_professionalism', 'social_media', 1, 'Unprofessional, defensive, or inappropriate tone; risk to brand reputation.'),
  ('greeting_professionalism', 'social_media', 2, 'Noticeably scripted/robotic for a social channel.'),
  ('greeting_professionalism', 'social_media', 3, 'Reply is professional but flat, or misses the brand personality.'),
  ('greeting_professionalism', 'social_media', 4, 'Professional and polite; slightly generic/template tone.'),
  ('greeting_professionalism', 'social_media', 5, 'Warm, on-brand reply that matches the brand''s public voice; friendly and professional even if the customer is frustrated.'),

  ('customer_verification_security', 'social_media', 1, 'Sensitive account/personal information shared or requested in public view; sensitive account/personal information requested in public instead of diverting to DM; loop left open.'),
  ('customer_verification_security', 'social_media', 2, 'Account/personal details requested or discussed in a way that risks exposure.'),
  ('customer_verification_security', 'social_media', 3, 'Loop left open; some account-specific info is requested in a semi-secure way.'),
  ('customer_verification_security', 'social_media', 4, 'Response correct, small delay in moving to DM; loop closed correctly but minor steps missing.'),
  ('customer_verification_security', 'social_media', 5, 'Moves the conversation to a secure/private channel correctly before requesting or discussing any account details; loop closed publicly.'),

  ('understanding_the_issue', 'social_media', 1, 'Misreads or ignores the customer''s actual complaint or question; no sign of any investigation completed.'),
  ('understanding_the_issue', 'social_media', 2, 'Partial understanding; response doesn''t fully match what the customer raised.'),
  ('understanding_the_issue', 'social_media', 3, 'General understanding but misses nuance (e.g. urgency, prior complaints).'),
  ('understanding_the_issue', 'social_media', 4, 'Understands the issue well; one more clarifying question would help; sufficient investigation done, with minor steps missed.'),
  ('understanding_the_issue', 'social_media', 5, 'Accurately reads the tone and substance of the post/DM and asks the right follow-up before responding; investigation of the account completed.'),

  ('technical_knowledge_process_compliance', 'social_media', 1, 'Incorrect information posted publicly, requiring correction; protocol/compliance requirements ignored.'),
  ('technical_knowledge_process_compliance', 'social_media', 2, 'Noticeable inaccuracies or outdated info given publicly; multiple process/SLA steps missed.'),
  ('technical_knowledge_process_compliance', 'social_media', 3, 'Adequate but generic; could be more specific or helpful; mostly compliant, one step missed (e.g. late move to DM or SLA running over).'),
  ('technical_knowledge_process_compliance', 'social_media', 4, 'Mostly accurate; small gap that didn''t affect the outcome; process followed with a very minor deviation, SLA still met.'),
  ('technical_knowledge_process_compliance', 'social_media', 5, 'Accurate, confident info on company products, coverage, and known issues; correctly signposts to the right channel; follows social process/SLA fully.'),

  ('resolution_ownership', 'social_media', 1, 'Provides incorrect or no resolution, takes no ownership, leaves the issue/complaint unresolved or unanswered, and fails to follow the required process; failed to call the customer.'),
  ('resolution_ownership', 'social_media', 2, 'Shows limited ownership, misses key information, provides an incomplete resolution, leaves the customer to chase for assistance, or creates unnecessary back-and-forth.'),
  ('resolution_ownership', 'social_media', 3, 'Provides accurate information and an appropriate resolution, follows the required process, and attempts to resolve the issue; an avoidable transfer or lack of follow-up may prevent the interaction from being fully closed.'),
  ('resolution_ownership', 'social_media', 4, 'Takes ownership of the issue, provides an accurate resolution, manages expectations, minimises unnecessary transfers and back-and-forth, and follows up where required; confirmation of resolution could be stronger.'),
  ('resolution_ownership', 'social_media', 5, 'Owns the issue end-to-end, provides an accurate and tailored resolution, proactively addresses related concerns, avoids unnecessary transfers and repeat contact, follows through, confirms the issue is resolved, and ensures the customer has no further assistance required.'),

  ('communication_customer_experience', 'social_media', 1, 'Poor, dismissive, or tone-deaf communication that could harm brand perception; inappropriate behaviour/rude.'),
  ('communication_customer_experience', 'social_media', 2, 'Communication unclear, overly long, or mismatched to platform norms.'),
  ('communication_customer_experience', 'social_media', 3, 'Understandable but generic or slightly corporate for a social channel.'),
  ('communication_customer_experience', 'social_media', 4, 'Clear and professional; could be warmer or more concise.'),
  ('communication_customer_experience', 'social_media', 5, 'Warm, human, on-brand writing; concise and genuinely reassuring — turns a public complaint into a positive moment.'),

  ('case_documentation', 'social_media', 1, 'Interaction not logged at all; no notes; closed under incorrect category; applied incorrect macro.'),
  ('case_documentation', 'social_media', 2, 'Log thin, inconsistent, or partially inaccurate; closed under incorrect category.'),
  ('case_documentation', 'social_media', 3, 'Basic log; lacks detail on outcome or actions taken; ambiguous notes.'),
  ('case_documentation', 'social_media', 4, 'Logged well with a minor gap.'),
  ('case_documentation', 'social_media', 5, 'Interaction logged completely and accurately in the CRM/social tool, linked to any related ticket.'),

  -- Tier 2
  ('greeting_professionalism', 'tier2', 1, 'Unprofessional or absent engagement; no context given.'),
  ('greeting_professionalism', 'tier2', 2, 'Abrupt or unclear engagement; stakeholder left unsure what''s happening.'),
  ('greeting_professionalism', 'tier2', 3, 'Engagement is functional but lacks warmth or clarity on next steps.'),
  ('greeting_professionalism', 'tier2', 4, 'Professional engagement; slightly rushed or informal in places.'),
  ('greeting_professionalism', 'tier2', 5, 'Professional, clear opening whether engaging a customer, field tech, or internal stakeholder; sets expectations calmly.'),

  ('customer_verification_security', 'tier2', 1, 'No verification; changes made or info shared without confirming authorisation; no calls are recorded.'),
  ('customer_verification_security', 'tier2', 2, 'Verification incomplete before proceeding with changes or info sharing.'),
  ('customer_verification_security', 'tier2', 3, 'Partial verification; one required check missed.'),
  ('customer_verification_security', 'tier2', 4, 'Verification completed with a minor step slightly out of order.'),
  ('customer_verification_security', 'tier2', 5, 'Confirms customer/site/asset identity and access permissions correctly before making changes or sharing network details.'),

  ('understanding_the_issue', 'tier2', 1, 'Misdiagnoses the issue or acts without understanding it; fails to understand or investigate the issue.'),
  ('understanding_the_issue', 'tier2', 2, 'Partial diagnosis; action taken without fully confirming root cause; performs some investigation or troubleshooting but misses key information.'),
  ('understanding_the_issue', 'tier2', 3, 'General understanding but misses a relevant detail (e.g. related outage, site history); correctly understands and investigates the issue.'),
  ('understanding_the_issue', 'tier2', 4, 'Understands the issue well; one more diagnostic check would strengthen it.'),
  ('understanding_the_issue', 'tier2', 5, 'Correctly diagnoses the fault/root cause using the right data and tools before acting.'),

  ('technical_knowledge_process_compliance', 'tier2', 1, 'Little to no relevant technical knowledge shown; change-management/compliance requirements largely ignored.'),
  ('technical_knowledge_process_compliance', 'tier2', 2, 'Noticeable technical gaps; incorrect action or advice given; multiple process steps missed.'),
  ('technical_knowledge_process_compliance', 'tier2', 3, 'Adequate knowledge but needed support or a second check; mostly compliant, one process step missed or out of order.'),
  ('technical_knowledge_process_compliance', 'tier2', 4, 'Mostly accurate; minor gap that didn''t affect the outcome; process followed with a very minor, non-critical deviation.'),
  ('technical_knowledge_process_compliance', 'tier2', 5, 'Strong, accurate technical knowledge of network infrastructure, tools, and troubleshooting procedures; follows change-management, escalation, and safety/compliance procedures correctly.'),

  ('resolution_ownership', 'tier2', 1, 'No ownership taken; fault unresolved or handled incorrectly; loop not closed off publicly.'),
  ('resolution_ownership', 'tier2', 2, 'Minimal ownership; fault lingers without clear next steps.'),
  ('resolution_ownership', 'tier2', 3, 'Progresses the fault but hands off when it could''ve been resolved directly.'),
  ('resolution_ownership', 'tier2', 4, 'Takes ownership and resolves the fault; follow-through could be tighter.'),
  ('resolution_ownership', 'tier2', 5, 'Owns the fault through to resolution, coordinates the right teams, and confirms service is restored; ticket closed correctly.'),

  ('communication_customer_experience', 'tier2', 1, 'Poor or absent communication during the fault; spelling and grammar error.'),
  ('communication_customer_experience', 'tier2', 2, 'Communication inconsistent; stakeholders left chasing for updates.'),
  ('communication_customer_experience', 'tier2', 3, 'Understandable but technical/jargon-heavy or reactive rather than proactive.'),
  ('communication_customer_experience', 'tier2', 4, 'Clear and professional; could be more proactive or plain-language.'),
  ('communication_customer_experience', 'tier2', 5, 'Clear, calm, jargon-free updates to whoever needs them; keeps people informed proactively.'),

  ('case_documentation', 'tier2', 1, 'Fault not logged, or log missing/incorrect; notes not updated.'),
  ('case_documentation', 'tier2', 2, 'Documentation thin or partially inaccurate.'),
  ('case_documentation', 'tier2', 3, 'Basic documentation; lacks technical detail or timeline.'),
  ('case_documentation', 'tier2', 4, 'Good documentation with a minor gap.'),
  ('case_documentation', 'tier2', 5, 'Fault ticket/log is complete, accurate, and technical enough for any engineer to pick up the case.')
) AS v(code, channel, rating, definition_text)
JOIN qa_criteria c ON c.code = v.code AND c.channel = v.channel
ON CONFLICT (criterion_id, channel, rating) WHERE channel IS NOT NULL DO NOTHING;
