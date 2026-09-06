# Workaway Reachout

Workaway Reachout is an autonomous outreach assistant for Workaway hosts. It finds potentially suitable Workawayers, evaluates profile fit, sends a genuinely personalised first message within a host-approved campaign, and surfaces only positive, potentially positive, or unclear replies that may merit human attention.

The product is designed to remove repetitive discovery and first-contact work without allowing software to negotiate or confirm a stay. The host defines and approves the campaign once. The system then operates independently inside those boundaries and hands the conversation to the host as soon as a human reply may indicate interest.

## Product outcome

A host should be able to:

1. define who is suitable, what help is needed, when places are available, and what may be promised;
2. activate a controlled outreach campaign;
3. spend no time reviewing ordinary profiles or sending first messages;
4. receive a compact candidate dossier only when a Workawayer responds positively, potentially positively, or ambiguously;
5. personally continue every conversation and make every final hosting decision.

## Core decisions

- Campaign model: autonomous operation within host-approved rules.
- Candidate selection: hard eligibility filters followed by autonomous AI assessment and explainable ranking.
- Conversation boundary: automation stops after the first human reply.
- Final authority: the system never confirms a stay, negotiates terms, or makes commitments after handoff.
- Outreach quality: one profile-grounded message per candidate, not generic mass messaging.
- Platform safety: rate limits, explicit auditability, and immediate pause on warnings or interface uncertainty.

## Product principles

- The host remains accountable and retains final control.
- Hard campaign rules always override AI ranking.
- Every outreach decision must be explainable.
- Every claim in a message must come from host-approved facts or visible candidate information.
- Missing information must never be invented.
- Relevance and restraint are more important than message volume.
- The system stops at the first human response.
- The system does not bypass access controls, CAPTCHAs, rate limits, warnings, or account checks.
- Candidate data is minimised, protected, and removable.
- Platform support must never be overstated.

## Scope

The product covers:

- host campaign configuration;
- discovery of host-contactable Workawayer profiles;
- hard eligibility filtering;
- AI profile assessment and explainable ranking;
- autonomous candidate selection above an approved threshold;
- personalised first-message generation;
- controlled sending;
- deduplication and contact history;
- reply monitoring and conservative classification;
- immediate handoff to the host;
- dashboards, audit trails, deletion, and export.

## Non-goals

The initial product does not:

- conduct a multi-turn qualification conversation;
- answer candidate questions automatically;
- negotiate dates, duties, food, accommodation, payment, or other conditions;
- confirm or reject a stay on behalf of the host;
- send follow-up messages after a human reply;
- scrape inaccessible or non-host-visible information;
- infer sensitive personal characteristics;
- circumvent platform controls;
- conceal automation in order to avoid detection;
- optimise for maximum message volume.

## 1. Campaign Manager

A campaign is the approved operating envelope for autonomous outreach. It contains:

- campaign name and status;
- host account and listing context;
- desired arrival window;
- desired departure window;
- minimum and maximum stay duration;
- available places;
- individual, couple, or other permitted party configuration;
- destination and travel-intent requirements;
- required languages;
- required skills;
- preferred skills;
- help categories and concrete tasks;
- objectively necessary practical requirements;
- accommodation, food, facilities, and other approved conditions;
- house rules and material exclusions;
- recent-activity or profile-freshness requirements;
- minimum match score;
- daily and weekly send limits;
- campaign capacity and stopping rules;
- allowed message tone and length;
- approved host facts and promises;
- prohibited claims and topics;
- activation, pause, resume, and end dates.

Before activation, the host sees the interpreted hard filters, ranking criteria, approved factual source, stopping rules, and representative message examples. Activating the campaign authorises the system to select and contact candidates only within those boundaries.

Material campaign changes require renewed host approval. Reducing volume or pausing a campaign does not.

## 2. Workawayer Discovery

The Discovery component finds profiles made available to hosts through Workaway and records only the information necessary for eligibility, ranking, outreach, deduplication, and handoff.

Discovery must:

- respect the host's authenticated access level;
- consider only candidates the host is permitted to contact;
- identify availability, intended destinations, skills, languages, profile activity, and other campaign-relevant information;
- avoid candidates already contacted, excluded, handed off, or declined for the same campaign;
- keep the canonical Workaway profile link or identifier;
- record when information was observed;
- treat stale, incomplete, or uncertain fields explicitly.

A discovered profile is not automatically eligible and is not automatically stored indefinitely.

## 3. Eligibility Engine

Hard filters determine whether a candidate may enter AI assessment. Examples include:

- compatible travel or availability window;
- minimum stay length;
- destination interest;
- required language;
- required skill where genuinely necessary;
- acceptable party type for the available accommodation;
- active membership or contactability where visible;
- not previously contacted or excluded;
- remaining campaign capacity;
- no campaign-specific disqualifying condition.

Failure of any required rule excludes the candidate. The AI ranking layer cannot override a hard exclusion.

Every eligibility result records rule-level outcomes and the source data used. Unknown values follow the campaign's predefined policy: exclude, flag for manual review, or treat as a ranking penalty. Unknown values must never silently pass a required condition.

## 4. AI Matching and Ranking

Eligible profiles are assessed for substantive fit. The model may consider:

- overlap between offered and needed skills;
- stated interests and preferred exchange types;
- destination and travel-plan alignment;
- availability quality and expected stay length;
- evidence of relevant experience;
- language compatibility;
- alignment between the candidate's stated goals and the host's approved offering;
- profile completeness and recency;
- campaign-specific positive indicators.

The output includes:

- overall score;
- separate dimension scores;
- positive match reasons;
- missing or uncertain information;
- any risk of mismatch;
- citations to the exact profile fields or passages supporting the assessment;
- model and rubric version.

The system contacts only candidates above the approved threshold and within campaign limits. Ranking is autonomous, but fully traceable.

### Prohibited inference

The model must not infer or rank by sensitive characteristics such as health status, disability, religion, ethnicity, sexual orientation, political beliefs, financial status, or other protected or highly personal traits. Age, family situation, or similar visible attributes may be used only when lawful and objectively necessary for the accommodation or exchange. The reason must be documented in the campaign.

## 5. Personalised Outreach Engine

Each first message is generated for one candidate. It must contain:

- a natural greeting;
- one or more accurate references to the candidate's profile;
- a concrete explanation of why the host believes the exchange may fit;
- the relevant period;
- a concise description of the relevant help and offering;
- an honest, low-pressure invitation to indicate interest;
- no implication that a place has already been reserved or confirmed.

### Factual grounding

Candidate-specific statements must be traceable to visible profile content. Host-specific statements must be traceable to the approved campaign fact set. A message is blocked when:

- a required fact is missing;
- the model introduces an unsupported claim;
- a profile reference cannot be traced;
- the message conflicts with campaign rules;
- it implies a commitment the host has not authorised;
- it is too similar to prior messages without meaningful profile-specific content;
- confidence is below the approved threshold.

The initial language should follow the candidate's profile preference when reliably detectable and supported by the configured language capabilities. Otherwise, the campaign default is used.

## 6. Sending and Rate Control

The sender uses conservative, configurable limits and never treats volume as the primary success metric.

Required controls:

- daily and weekly send limits;
- minimum spacing between messages;
- campaign capacity limit;
- duplicate prevention across retries and sessions;
- candidate-level idempotency keys;
- confirmation that the platform accepted a message before recording it as sent;
- safe handling of uncertain send results;
- global emergency stop;
- campaign pause and resume;
- automatic stop when likely placement capacity is reached;
- automatic stop on platform warnings or abnormal response patterns.

Sending is not performed through detection-evasion techniques. The product must not mimic human timing to conceal automation. Any pacing exists to protect recipients, campaign quality, platform stability, and account safety.

## 7. Reply Monitor and Handoff

The Reply Monitor observes new responses to messages initiated by the product and classifies them conservatively as:

- Positive: clear interest or a request to continue;
- Potentially positive: interest combined with a question, condition, or uncertainty;
- Negative: clear decline;
- Unavailable: positive in principle but unavailable within the campaign period;
- Unclear: intent cannot be determined reliably;
- Automated or system: not a human candidate response.

### Handoff rule

Any Positive, Potentially positive, or Unclear human response immediately:

1. stops all automation for that candidate;
2. locks the thread against additional automated sends;
3. creates a candidate dossier;
4. notifies the host through configured channels;
5. exposes a direct action to open the Workaway conversation.

The system sends no acknowledgement, clarification, follow-up, or other automated response after a human reply. Negative and Unavailable replies are recorded without an automated response.

## 8. Candidate Dossier

Each handoff dossier includes:

- candidate name;
- profile image where permitted;
- canonical Workaway profile link;
- relevant availability and travel plans;
- relevant skills and supporting profile excerpts;
- overall and dimension match scores;
- exact match reasons;
- uncertainty and missing-data notes;
- the exact outbound message;
- the complete inbound reply;
- contact timestamps;
- campaign and rule versions;
- suggested human next step;
- direct link to continue personally.

The dossier is a decision aid, not a recommendation to accept the person. The host performs all further communication and safety assessment.

## 9. Host Dashboard

The dashboard provides:

- active, scheduled, paused, and ended campaigns;
- capacity and date windows;
- discovered, excluded, eligible, scored, selected, contacted, and handed-off counts;
- candidate ranking and selection reasons;
- outbound message history;
- Positive, Potentially positive, and Unclear inbox;
- pending handoff dossiers;
- platform and authenticated-session health;
- send-limit consumption;
- adapter warnings and failed actions;
- estimated remaining suitable candidate pool;
- global stop control.

The primary inbox excludes routine declines and technical noise. Those remain available in separate activity and audit views.

## 10. Workaway Platform Adapter

Integration preference:

1. use an official Workaway API or approved integration if one becomes available and supports the required host workflow;
2. otherwise use a local browser extension or desktop agent operating within the host's already authenticated browser session;
3. do not copy or store the Workaway password in a remote automation service.

The adapter owns page interpretation, navigation, message submission, delivery confirmation, inbox observation, compatibility checks, and platform-specific error classification.

### Compatibility behavior

The adapter validates expected page structures and important interface elements before any write action. If Workaway changes the interface or an expected state is missing:

- stop sending;
- retain pending candidates without retrying;
- mark the adapter incompatible or uncertain;
- alert the host;
- require updated compatibility validation before resuming.

The adapter must not bypass CAPTCHAs, access restrictions, membership controls, account verification, warnings, or platform-imposed limits. A CAPTCHA or account check pauses automation for human resolution.

## 11. Data Model

Core entities include:

- HostAccount;
- HostListing;
- ApprovedFact;
- Campaign;
- CampaignRule;
- CampaignVersion;
- Candidate;
- CandidateSnapshot;
- EligibilityDecision;
- MatchAssessment;
- MatchEvidence;
- OutreachMessage;
- SendAttempt;
- Conversation;
- InboundReply;
- ReplyClassification;
- HandoffDossier;
- Exclusion;
- PlatformSession;
- AdapterVersion;
- AuditEvent;
- RetentionPolicy.

All automated decisions must be reproducible from versioned inputs, rules, prompts or rubrics, model identity, and adapter state.

## 12. Data Flow

1. The host creates and approves a campaign.
2. Discovery reads host-visible candidate profiles.
3. Deduplication removes already handled candidates.
4. Eligibility rules apply hard exclusions.
5. AI scores and ranks eligible candidates.
6. The selection policy admits candidates above threshold within capacity and rate limits.
7. The Outreach Engine produces a grounded message.
8. A validator verifies facts, profile citations, tone, limits, and commitments.
9. The adapter submits the message and verifies platform acceptance.
10. The Reply Monitor observes the resulting conversation.
11. A first human response is classified.
12. Positive, Potentially positive, and Unclear responses trigger immediate handoff.
13. The candidate thread is locked against further automation.

## 13. Privacy and Data Governance

The product collects only information needed for matching, outreach, deduplication, audit, and handoff.

Requirements:

- local or strongly encrypted storage;
- encryption in transit where networked components exist;
- explicit retention periods;
- deletion of expired candidate snapshots;
- host-accessible export and deletion;
- no sale or advertising use of candidate data;
- no use of candidate content to train general-purpose models without separate lawful authority and consent;
- minimised logging of page content;
- secrets kept outside logs and model prompts;
- role-based access if multiple host users are later supported;
- documented subprocessors when cloud inference is used.

Profile data remains subject to Workaway's applicable terms and privacy rules. Public visibility does not imply unrestricted reuse.

## 14. Failure Handling

The campaign automatically pauses when:

- the authenticated session expires;
- a CAPTCHA or account verification appears;
- Workaway shows a warning or suspected rate limit;
- expected page structure changes;
- required campaign facts are missing;
- candidate analysis is below the required confidence;
- a generated statement lacks approved evidence;
- repeated network or submission errors occur;
- send status is uncertain;
- a possible duplicate is detected;
- observed send or reply volume is abnormal;
- local integrity checks fail.

A message is recorded as Sent only after platform confirmation. An uncertain submission is quarantined for reconciliation rather than automatically retried. This prevents duplicate outreach.

Failures are visible, actionable, and classified as host action required, adapter update required, temporary retry permitted, or campaign configuration required.

## 15. Security

Security requirements include:

- no remote storage of the Workaway password;
- encrypted session and application secrets;
- least-privilege components;
- signed releases and adapter updates;
- authenticated communication between local components;
- protection against forged local commands;
- redaction of personal data and secrets from diagnostic logs;
- dependency and supply-chain scanning;
- tamper-evident audit history;
- secure automatic updates with rollback;
- no arbitrary server-delivered code execution;
- immediate global revocation of automation.

## 16. Observability and Auditability

The host can inspect:

- why a candidate passed or failed each hard rule;
- why AI assigned each score;
- which profile evidence supported a decision;
- which campaign version authorised contact;
- what exact message was generated;
- whether and when Workaway confirmed submission;
- how a reply was classified;
- why automation paused or handed off;
- every material configuration change.

Operational metrics focus on quality and safety:

- eligible-to-contact rate;
- positive-interest rate;
- handoff rate;
- duplicate-prevention events;
- unsupported-claim blocks;
- platform-warning pauses;
- uncertain-send quarantines;
- host overrides and classification corrections.

## 17. Minimum Credible Product

The first usable version supports:

- one Workaway host account;
- one active campaign at a time;
- a local browser extension or desktop-agent integration;
- configurable hard filters;
- automatic profile discovery;
- automatic profile assessment and ranking;
- evidence-backed, explainable match scores;
- autonomous selection above an approved threshold;
- one genuinely personalised message per selected candidate;
- approved fact and commitment boundaries;
- daily and weekly send limits;
- deduplication and contact history;
- reply monitoring;
- conservative reply classification;
- immediate handoff for Positive, Potentially positive, and Unclear replies;
- dashboard and candidate dossiers;
- pause on session, platform, compatibility, or certainty problems;
- auditable decisions and sends;
- candidate-data export and deletion;
- no automatic message after the first human reply;
- no autonomous stay confirmation.

## 18. Acceptance Criteria

The Minimum Credible Product is accepted only when all of the following are demonstrated:

1. Only candidates satisfying every hard campaign condition can be contacted.
2. Every contacted candidate has an evidence-backed, inspectable match reason.
3. Every message contains meaningful candidate-specific content grounded in the visible profile.
4. No message contains invented host facts, unsupported profile claims, or unauthorised commitments.
5. The same candidate cannot be contacted twice for the same campaign through retries, restarts, or repeated discovery.
6. Daily, weekly, campaign, and capacity limits cannot be exceeded.
7. A platform warning, CAPTCHA, expired session, or incompatible interface automatically stops sending.
8. Positive and Potentially positive replies are handed to the host without an automated follow-up.
9. Unclear human replies are also handed off rather than answered automatically.
10. Negative and Unavailable replies receive no automated response.
11. The host can stop all automation immediately.
12. The system does not bypass Workaway access controls or platform limits.
13. Candidate, message, decision, and audit data can be viewed, exported, retained according to policy, and deleted.
14. An uncertain send result cannot create an automatic duplicate retry.
15. The dashboard accurately distinguishes sent, pending, uncertain, paused, handed-off, and failed states.

## 19. Testing Strategy

Testing includes:

- unit tests for hard filters, limits, deduplication, state transitions, and handoff locks;
- deterministic fixture tests for ranking rubrics and evidence extraction;
- factual-grounding tests that reject unsupported claims;
- adversarial profile-content tests to prevent profile text from overriding system rules;
- message-similarity and personalisation tests;
- reply-classification tests across languages and ambiguous phrasing;
- adapter contract tests against stored, permission-compliant interface fixtures;
- end-to-end tests in dedicated authorised test accounts where permitted;
- expired-session, CAPTCHA, warning, rate-limit, and page-change simulations;
- uncertain-send and duplicate-prevention tests;
- privacy, retention, export, deletion, and log-redaction tests;
- recovery tests after crash, restart, and network interruption;
- security review of local session access and component communication.

No live person should receive a test message without prior consent.

## 20. Delivery Phases

1. Define the versioned campaign, eligibility, candidate, and decision models.
2. Build campaign approval, fact management, and audit foundations.
3. Implement the local Workaway adapter in read-only discovery mode.
4. Add hard filtering, evidence extraction, ranking, and explanation.
5. Add grounded message generation and pre-send validation.
6. Add controlled sending, idempotency, capacity, and rate limits.
7. Add reply monitoring, conservative classification, and hard handoff locks.
8. Build the host dashboard and candidate dossiers.
9. Complete privacy, deletion, recovery, and security controls.
10. Run the full acceptance suite before enabling production sends.

## 21. Definition of Done

A release is complete only when:

- all acceptance criteria pass on the supported Workaway interface version;
- campaign rules and message permissions are unambiguous;
- every autonomous decision is inspectable;
- no automatic path continues after a human reply;
- unsupported claims are reliably blocked;
- duplicate and uncertain-send handling is proven;
- all stop and pause conditions are tested;
- host data controls work end to end;
- the dashboard never overstates delivery or platform health;
- limitations and platform dependencies are documented.

## Platform Responsibility

Workaway currently documents that hosts may search for and contact eligible Workawayers. Workaway also publicly discourages generic, copied, and AI-written first-contact messages in its member guidance. Workaway Reachout must therefore prioritise individually grounded communication, conservative volume, recipient relevance, and compliance with the rules applicable to the host account.

Relevant public references:

- Workaway FAQ: https://www.workaway.info/en/info/faq
- Workaway Terms and Conditions: https://www.workaway.info/en/info/terms-conditions
- Workaway First Contact Advice: https://www.workaway.info/en/info/workawayer/first-contact-advice

These references can change. Before enabling production outreach, the current terms, account permissions, technical integration method, and any required approval from Workaway must be reviewed. If Workaway prohibits the intended automation, production sending must remain disabled unless explicit permission is obtained.

## Legal and Ethical Use

The software may be operated only by an authorised host on an account they are permitted to use. Hosts remain responsible for the truthfulness of their listing, lawful selection practices, appropriate safeguarding, privacy compliance, platform compliance, and all final hosting decisions.

## License

No licence has been selected. Until a licence file is added, no permission is granted to copy, modify, or distribute the source code.