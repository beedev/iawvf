# IAW Source Requirements (extracted from DTS Scoping Document)

## Technical Requirements sheet (FR → TR mapping)


### I1-F1
- **FR:** The system shall surface online orders persisted through the NeoLINK-backed intake pathway in the IAW worklist without requiring duplicate order-entry mediation.
- _scope:_ 0

### I1-F2
- **FR:** The system shall persist order updates generated in IAW (field corrections, add-on changes, and derivative specimen additions) in NeoLINK-consumable structures so downstream reporting and existing NeoLINK-dependent processes remain synchronized.
- _scope:_ 0

### I1-F3
- **FR:** The system shall maintain synchronization status and error visibility for inbound and outbound NeoLINK exchanges affecting order lifecycle data.
- _scope:_ 0

### I2-F1
- **FR:** The system shall surface interfaced orders arriving through the current NeoLINK intake pathway in the unified IAW worklist with source attribution preserved.
- _scope:_ 0

### I2-F2
- **FR:** The system shall persist interface-origin identifiers and source metadata so hybrid-ordering workflows such as auto-submission, merge, and downstream routing can be executed without losing interface traceability.
- _scope:_ 0

### I3-F1
- **FR:** The system shall accept structured OCR/ICR extraction payloads from the selected document-processing service and map extracted values into the IAW order model.
- _scope:_ 0

### I3-F2
- **FR:** The system shall create a draft or launch-ready order state based on extracted-field completeness and confidence thresholds defined for OCR/ICR processing.
- _scope:_ 0

### I3-F3
- **FR:** The system shall retain extraction provenance, confidence, and exception indicators so users can review unresolved OCR/ICR outputs without re-keying all data.
- _scope:_ 0

### I4-F1
- **FR:** The system shall publish problem-hold events from IAW to Salesforce with sufficient context to create or update the corresponding work item.
- _scope:_ 0

### I4-F2
- **FR:** The system shall subscribe to add-on events from Salesforce to IAW with sufficient contect to create or update the corresponding order.
- _scope:_ 0

### I4-F3
- **FR:** The system shall consume resolution updates, comments, and add-on initiation events from Salesforce and apply them to the linked IAW incident or order context.
- _scope:_ 0

### I4-F4
- **FR:** The system shall maintain cross-platform correlation identifiers and synchronization status for Salesforce-linked incidents and add-on actions.
- _scope:_ 0

### I5-F1
- **FR:** The system shall preserve compatibility with existing NeoLINK-to-NeoLIMS operational pathways while incorporating inbound NeoLIMS events needed for accessioning visibility.
- _scope:_ 0

### I5-F2
- **FR:** The system shall subscribe to specimen and custody-related events from NeoLIMS or its supported event pathway and update the corresponding specimen state in IAW.
- _scope:_ 0

### I6-F1
- **FR:** The system shall consume and cache active Test Compendium metadata and approved policy definitions required to drive accessioning automation.
- _scope:_ 0

### I6-F2
- **FR:** The system shall translate inbound order/test identifiers into the compendium code set required by the rules engine before evaluating automation logic.
- _scope:_ 0

### I6-F3
- **FR:** The system shall evaluate order context against the active compendium and policy cache at creation or update time and persist the resulting rule outcomes or decision properties for downstream consumption.
- _scope:_ 0

### I7-F1
- **FR:** The system shall resolve patient identity against the designated patient-master source before creating a new patient-linked order record.
- _scope:_ 0

### I7-F2
- **FR:** The system shall retrieve longitudinal patient history needed for accessioning decisions from the active patient-master pathway and present the relevant history in IAW features that depend on it.
- _scope:_ 0

### I7-F3
- **FR:** The system shall persist patient-linkage updates, including resolved duplicates or merges, in a manner that keeps IAW and the active patient-master source aligned.
- _scope:_ 0

### I9-F1
- **FR:** TBD.
- _scope:_ 0

### OW1-F1
- **FR:** The system shall provide a dedicated Order Worklist view for authorized users.
- _scope:_ 0

### OW1-F2
- **FR:** The system shall display all orders in a defined actionable/pending status.
- _scope:_ 0

### OW1-F3
- **FR:** The system shall enforce role-based access based on user role, site, queue, and assignment rules.
- _scope:_ 0

### OW1-F4
- **FR:** The system shall display standardized summary information for each worklist item (Priority, Order Identifier, Patient, Client, Testing, Order Soruce, Received Date/Timestamp, Current Status (workflow step), next Action).
- _scope:_ 0

### OW1-F5
- **FR:** The system shall allow filtering of worklist items based on defined attributes.
- _scope:_ 0

### OW1-F6
- **FR:** The system shall allow sorting of worklist items by configurable columns.
- _scope:_ 0

### OW1-F7
- **FR:** The system shall display real-time worklist data.
- _scope:_ 0

### OW2-F1
- **FR:** The system shall route all supported order types into the Order Worklist upon entry into an actionable state.
- _scope:_ 0

### OW2-F2
- **FR:** The system shall apply consistent routing rules across all intake channels.
- _scope:_ 0

### OW2-F3
- **FR:** The system shall classify each order using a defined set of order types.
- _scope:_ 0

### OW2-F4
- **FR:** The system shall capture and display the source/origin of each order.
- _scope:_ 0

### OW2-F5
- **FR:** The system shall support configuration of new order types.
- _scope:_ 0

### OW2-F6
- **FR:** The system shall log intake metadata including source, timestamp, and routing outcome.
- _scope:_ 0

### OW3-F1
- **FR:** The system shall support configurable display of worklist fields.
- _scope:_ 0

### OW3-F2
- **FR:** The system shall support drill-down navigation to related records.
- _scope:_ 0

### OW3-F3
- **FR:** The system shall provide search across key identifiers (order, patient, specimen, accession).
- _scope:_ 0

### OW3-F4
- **FR:** The system shall allow users to initiate actions directly from the worklist.
- _scope:_ 0

### OW3-F5
- **FR:** The system shall retain user filters and context during navigation.
- _scope:_ 0

### OW3-F6
- **FR:** The system shall maintain audit logs of actions taken from the worklist.
- _scope:_ 0

### OW4-F1
- **FR:** The system shall assign priority based on defined business rules.
- _scope:_ 0

### OW4-F2
- **FR:** The system shall display priority for each item.
- _scope:_ 0

### OW4-F3
- **FR:** The system shall sort items by priority by default.
- _scope:_ 0

### OW-F4
- **FR:** The system shall support the defined priority hierarchy (STAT > RUSH > Pediatric > Routine).

### OW4-F5
- **FR:** The system shall update priority dynamically when order data changes.
- _scope:_ 0

### OW4-F6
- **FR:** The system shall apply consistent tie-breaker logic for equal priority.
- _scope:_ 0

### OW5-F1
- **FR:** The system shall track elapsed time between order creation and receipt.
- _scope:_ 0

### OW5-F2
- **FR:** The system shall identify orders exceeding a defined aging threshold.
- _scope:_ 0

### OW5-F3
- **FR:** The system shall generate notifications for aged orders.
- _scope:_ 0

### OW5-F4
- **FR:** The system shall route notifications to configured users or queues.
- _scope:_ 0

### OW5-F5
- **FR:** Notifications shall include relevant order context.
- _scope:_ 0

### OW5-F6
- **FR:** The system shall support configurable aging thresholds.
- _scope:_ 0

### OW5-F7
- **FR:** The system shall allow users to disposition aged orders.
- _scope:_ 0

### OW5-F8
- **FR:** The system shall audit disposition actions.
- _scope:_ 0

### OA1-F1
- **FR:** The system shall record all user actions and system-generated events across the order and specimen lifecycle.
- _scope:_ 0

### OA1-F2
- **FR:** The system shall capture timestamp, user session, event type, and before/after values where applicable.
- _scope:_ 0

### OA1-F3
- **FR:** The system shall provide a searchable and filterable audit log.
- _scope:_ 0

### OA2-F1
- **FR:** The system shall support multiple tests per order.
- _scope:_ 0

### OA3-F1
- **FR:** The system shall support multiple specimens per order.
- _scope:_ 0

### OA4-F1
- **FR:** The system shall apply a default lab context based on user configuration and/or session location.
- _scope:_ 0

### OA5-F1
- **FR:** The system shall enforce location-based access control for restricted workflows such as proficiency testing.
- _scope:_ 0

### OA6-F1
- **FR:** The system shall validate NPI values against the NPI Database that is already in use.
- _scope:_ 0

### OA6-F2
- **FR:** The system shall support physician identity resolution across multiple identifiers.
- _scope:_ 0

### OA7-F1
- **FR:** The system shall allow updates to existing orders.
- _scope:_ 0

### OA7-F2
- **FR:** The system shall maintain full audit history for all updates.
- _scope:_ 0

### OA8-F1
- **FR:** The system shall allow order creation in a draft state when required fields are missing.
- _scope:_ 0

### OA8-F2
- **FR:** The system shall not inform downstream systems of orders in draft state until they are 'activated' (via launch button). Testing would move into it's appropriate next workflow step.
- _scope:_ 0

### OA9-F1
- **FR:** The system shall allow cancellation of testing at any stage.
- _scope:_ 0

### OA9-F2
- **FR:** The system shall require and store a cancellation reason.
- _scope:_ 0

### OA9-F3
- **FR:** The system shall provide a picklist of reasons for cancellation, while allowing a selection of Other + Free Text reasoning.
- _scope:_ 0

### OA10-F1
- **FR:** The system shall support association of multiple specimens to a single test.
- _scope:_ 0

### OA11-F1
- **FR:** The system shall capture and store the originating source system for each order.
- _scope:_ 0

### OA12-F1
- **FR:** The system shall support parent-child relationships between tests when applicable.
- _scope:_ 0

### OA13-F1
- **FR:** The system shall propagate interface identifiers when additional testing is added, both for add-ons and reflexes.
- _scope:_ 0

### OA14-F1
- **FR:** The system shall allow modification of orders prior to submission.
- _scope:_ 0

### OA14-F2
- **FR:** The system shall not allow external users to modify orders once submitted.
- _scope:_ 0

### OA15-F1
- **FR:** The system shall define standardized workflow steps with entry and exit criteria.
- _scope:_ 0

### OA16-F1
- **FR:** The system shall capture status transitions with timestamps and user attribution.
- _scope:_ 0

### OA17-F1
- **FR:** The system shall associate each order to a client record.
- _scope:_ 0

### OA17-F2
- **FR:** The system shall associate each NPI to a client record.
- _scope:_ 0

### OA17-F3
- **FR:** The system shall associate each patient to a client record.
- _scope:_ 0

### OA19-F1
- **FR:** The system shall provide consolidated visibility into tests and specimens for a patient across orders.
- _scope:_ 0

### SR1-F1
- **FR:** The system shall capture and display the client-provided specimen identifier for comparison during specimen receipt.
- _scope:_ 0

### SR1-F2
- **FR:** The system shall allow the accessioner to document verification of the physical specimen identifier against the client-provided specimen identifier.
- _scope:_ 0

### SR2-F1
- **FR:** The system shall capture and display the client-provided specimen type for comparison during specimen receipt.
- _scope:_ 0

### SR2-F2
- **FR:** The system shall allow the accessioner to validate the observed specimen type against the client-provided specimen type.

### SR3-F1
- **FR:** The system shall capture and display the client-provided material type for comparison during specimen receipt.
- _scope:_ 0

### SR3-F2
- **FR:** The system shall allow the accessioner to validate the observed material type against the client-provided material type.
- _scope:_ 0

### SR4-F1
- **FR:** The system shall capture and display the client-provided transport information for comparison during specimen receipt.
- _scope:_ 0

### SR4-F2
- **FR:** The system shall allow the accessioner to validate the observed transport condition against the client-provided transport information.
- _scope:_ 0

### SR5-F1
- **FR:** The system shall allow the accessioner to record specimen quantity (FFPE) and/or volume (HEME) at receipt.
- _scope:_ 0

### SR6-F1
- **FR:** The system shall support validation of correct specimen for a patient based on specimen-to-requisition alignment.
- _scope:_ 0

### SR6-F2
- **FR:** The system shall allow the accessioner to record labeling exceptions, including unlabeled specimens, mislabeled specimens, and specimens lacking sufficient identifiers.
- _scope:_ 0

### SR7-F1
- **FR:** The system shall allow the accessioner to record specimen condition at receipt using a defined set of condition values.
- _scope:_ 0

### SR7-F2
- **FR:** The system shall store specimen condition as part of the specimen receipt record for downstream processing, review, and audit.
- _scope:_ 0

### SR8-F1
- **FR:** TBD.
- _scope:_ 0

### OE1-F1
- **FR:** The system shall support manual transcription of paper requisitions as a fallback intake method when digital intake methods are unavailable or unsuccessful.
- _scope:_ 0

### OE1-F2
- **FR:** The system shall capture the order source for manually transcribed orders.
- _scope:_ 0

### OE2-F1
- **FR:** The system shall allow authorized users to begin accessioning, which will automatically release online orders.
- _scope:_ 0

### OE2-F2
- **FR:** The system shall allow release of selected tests or all tests within an order when applicable.
- _scope:_ 0

### OE3-F1
- **FR:** The system shall allow authorized users to begin accessioning and release interfaced orders from the worklist using the same core release workflow as online orders.
- _scope:_ 0

### OE4-F1
- **FR:** The system shall support automated submission of interfaced orders when configured business and technical conditions are met.
- _scope:_ 0

### OE5-F1
- **FR:** The system shall identify potentially related orders using defined reconciliation criteria.
- _scope:_ 0

### OE5-F2
- **FR:** The system shall support consolidation of reconciled orders into a single order record while preserving the correct identifiers and source traceability.
- _scope:_ 0

### OE7-F1
- **FR:** The system shall allow application of client-level statuses based on defined SOPs and business rules.
- _scope:_ 0

### OE8-F1
- **FR:** The system shall allow application of order-level statuses based on defined SOPs and business rules.
- _scope:_ 0

### OE9-F1
- **FR:** The system shall allow application of test-level statuses based on defined SOPs and business rules.
- _scope:_ 0

### OE10-F1
- **FR:** The system shall provide Order Entry access to all approved data fields available across supported intake channels.
- _scope:_ 0

### OE11-F1
- **FR:** TBD.
- _scope:_ 0

### OE12-F1
- **FR:** TBD.
- _scope:_ 0

### OE14-F1
- **FR:** The system shall require or allow capture of contact information when STAT handling rules apply.
- _scope:_ 0

### OE15-F1
- **FR:** The system shall automatically apply the Material Request Status for eligible digital orders when Specimen Retrieval is selected.
- _scope:_ 0

### OE16-F1
- **FR:** The OCR/ICR system shall have logic that states:  "If Specimen Retrieval section of manual requisition detects content, with Hospital Name name indicated, then flag as 3rd Party CMR."
- _scope:_ 0

### OE16-F2
- **FR:** The system shall allow capture or derivation of third-party specimen indicators and related source information.
- _scope:_ 0

### OE17-F1
- **FR:** The system shall require capture of the minimum patient demographic fields defined for intake.
- _scope:_ 0

### OE17-F2
- **FR:** The system shall support reconciliation of patient demographic information between the TRF and supporting documentation.
- _scope:_ 0

### OE18-F1
- **FR:** The system shall identify and present potential patient matches during order entry using defined matching criteria.
- _scope:_ 0

### OE19-F1
- **FR:** The system shall reconcile submitted patient information against existing patient records using defined matching logic to reduce duplicate patient creation.
- _scope:_ 0

### OE20-F1
- **FR:** The system shall provide access to all in-scope tests from the Test Compendium for order selection.
- _scope:_ 0

### OE22-F1
- **FR:** The system shall automatically associate specimen(s) to test(s) using defined business rules, compendium data, and available order documentation.
- _scope:_ 0

### OE23-F1
- **FR:** The system shall detect whether fixation time is present when required for applicable testing.
- _scope:_ 0

### OE24-F1
- **FR:** The system shall select the appropriate performing laboratory using Test Compendium rules and approved operational routing criteria.
- _scope:_ 0

### OE25-F1
- **FR:** The system shall support product-specific required fields for specialty products.
- _scope:_ 0

### OE25-F2
- **FR:** The system shall support copy-forward or copy-down of approved product-specific values where applicable.
- _scope:_ 0

### OE26-F1
- **FR:** The system shall present client special instructions or comments to the accessioner and require acknowledgement before proceeding when defined rules apply.
- _scope:_ 0

### OE27-F1
- **FR:** The system shall support scanning or attaching client-provided documentation to the order record.
- _scope:_ 0

### OE28-F1
- **FR:** The system shall alert the user when required documentation has not been successfully stored or linked to the order record.
- _scope:_ 0

### OE29-F1
- **FR:** The system shall group or containerize specimens using validated rules based on approved specimen attributes.
- _scope:_ 0

### OE30-F1
- **FR:** TBD.
- _scope:_ 0

### OE32-F1
- **FR:** The system shall evaluate relevant patient testing history when defined business rules require history-aware ordering decisions.
- _scope:_ 0

### OE33-F1
- **FR:** The system shall identify discontinued ordered tests and support alternative test workflows based on defined replacement rules.
- _scope:_ 0

### OE33-F2
- **FR:** The system shall create the appropriate notification or hold workflow based on whether one or multiple alternative tests are available and whether concurrent testing exists on the order.
- _scope:_ 0

### OE34-F1
- **FR:** The system shall automatically capture the receipt date within the 3rd Party SFI for third-party orders when received into the lab.
- _scope:_ 0

### OE35-F1
- **FR:** The system shall support creation of a HLD test when required testing information is not provided at intake.
- _scope:_ 0

### OE36-F1
- **FR:** The system shall detect potential duplicate testing within the order or across defined historical timeframes using approved matching logic.
- _scope:_ 0

### OE36-F2
- **FR:** The system shall notify the accessioner when potential duplicate testing is identified before processing proceeds.
- _scope:_ 0

### OE37-F1
- **FR:** The system shall allow placement of a test into Pending Material status when required specimen material is not yet available.
- _scope:_ 0

### OE38-F1
- **FR:** The system shall support processing of non-validated NY testing when required NYS approval documentation or status is present.
- _scope:_ 0

### OE39-F1
- **FR:** The system shall allow capture of tracking identifiers for external reference lab shipments where applicable.
- _scope:_ 0

### PM1-F1
- **FR:** The system shall instantiate an order-level incident record, assign the configured hold classification, and transition the order workflow steps for all testing to Hold when an order-scoped blocking condition is raised.
- _scope:_ 0

### PM2-F1
- **FR:** The system shall instantiate a test-level incident record, assign the configured hold classification, and transition the affected test workflow step to Hold when a test-scoped blocking condition is raised.

### PM3-F1
- **FR:** The system shall evaluate ordered tests against configurable readiness rules (required metadata, product-specific fields, supporting inputs, and setup prerequisites) and automatically create the mapped incident, hold type, and affected status when a rule fails.
- _scope:_ 0

### PM4-F1
- **FR:** The system shall attempt configured client resolution logic, persist the fallback or unresolved state, and create a partial problem hold when client identity remains unresolved after rule execution.
- _scope:_ 0

### PM5-F1
- **FR:** The system shall execute provider resolution logic for ordering and treating physician data and create a partial problem hold when required provider identity cannot be resolved to an acceptable state.
- _scope:_ 0

### PM6-F1
- **FR:** The system shall evaluate Bill-To presence against billing rules, apply the configured fallback where permitted, and create a partial problem hold when unresolved billing ownership requires follow-up.
- _scope:_ 0

### PM7-F1
- **FR:** The system shall evaluate requisition signature status and create a partial problem hold when signature is required and no valid signature indicator is present.
- _scope:_ 0

### PM8-F1
- **FR:** The system shall evaluate diagnosis or referral-code requirements by test and billing context, and create the configured problem hold type when no valid ICD10 or Reason for Referral value is available.
- _scope:_ 0

### PM9-F1
- **FR:** The system shall compare physical and client-provided specimen identifiers using configured SPID matching rules and create a complete problem hold when the identifiers fail reconciliation.
- _scope:_ 0

### PM11-F1
- **FR:** TBD.
- _scope:_ 0

### PM12-F1
- **FR:** The system shall compare received specimen quantity to client-stated quantity and create a partial problem hold when the received count is lower than expected.
- _scope:_ 0

### PM13-F1
- **FR:** The system shall validate specimen-type compatibility against ordered testing, search for an acceptable alternate specimen on the order, and create a complete problem hold when no viable substitute specimen exists.
- _scope:_ 0

### PM14-F1
- **FR:** The system shall evaluate specimen sufficiency against test-specific quantity or volume thresholds, check for alternate suitable material, and create a complete problem hold when sufficiency criteria cannot be met.
- _scope:_ 0

### PM15-F1
- **FR:** The system shall evaluate specimen viability against configured acceptability rules, identify alternate suitable material when available, and create a complete problem hold when no viable specimen path remains.
- _scope:_ 0

### PM16-F1
- **FR:** The system shall monitor specimen stability against configured expiration thresholds, notify designated medical staff when review is required, and record the approve/reject disposition that governs continued processing.
- _scope:_ 0

### PM17-F1
- **FR:** The system shall validate presence of Circled H&E documentation for applicable Technical FISH on FFPE orders and create a complete problem hold when the requirement is unmet.
- _scope:_ 0

### PM18-F1
- **FR:** The system shall evaluate STAT-specific contact requirements and create a partial problem hold when required escalation contact information is absent.
- _scope:_ 0

### PM19-F1
- **FR:** The system shall validate client specimen ID presence for FFPE specimens and create a complete problem hold when no acceptable identifier is present.
- _scope:_ 0

### PM20-F1
- **FR:** TBD.
- _scope:_ 0

### PM21-F1
- **FR:** TBD.
- _scope:_ 0

### PM22-F1
- **FR:** TBD.
- _scope:_ 0

### PM23-F1
- **FR:** The system shall create a partial problem hold when patient gender is missing and has been populated through configured fallback handling rather than source data.
- _scope:_ 0

### PM24-F1
- **FR:** The system shall evaluate performing-lab eligibility for selected testing and create a complete problem hold when no validated internal or permitted routing option satisfies the rule set.
- _scope:_ 0

### PM25-F1
- **FR:** The system shall enforce selection of the required FFPE execution strategy for applicable orders and create a complete problem hold when the required execution decision is absent.
- _scope:_ 0

### PM26-F1
- **FR:** The system shall create a complete problem hold when sequential-testing rules place a follow-up timepoint in HOLD because the prior timepoint has not yet completed or reported.
- _scope:_ 0

### PM27-F1
- **FR:** The system shall validate required CBC documentation for applicable testing and create a partial problem hold when the required CBC artifact is not present.
- _scope:_ 0

### PM28-F1
- **FR:** The system shall validate required pathology report documentation for applicable testing and create a partial problem hold when the report is not present.
- _scope:_ 0

### PM29-F1
- **FR:** The system shall distinguish between unanswered CAP questions and CAP questions answered as Unknown, and create a partial problem hold only when required CAP responses are omitted.
- _scope:_ 0

### PM30-F1
- **FR:** The system shall ingest or capture resolution updates from Client Services, apply the update to the linked incident, and record the resolution user, source, timestamp, and affected data changes.
- _scope:_ 0

### PM31-F1
- **FR:** The system shall generate a queue of open incidents requiring accessioning action and expose their current age, severity, and required next step.
- _scope:_ 0

### PM32-F1
- **FR:** The system shall provide an interactive incident workspace that consolidates incident, order, test, and specimen context; supports filtering, drill-down, inline actioning, and preserves role-based access and auditability.
- _scope:_ 0

### PM33-F1
- **FR:** The system shall permit release from hold only after all mapped resolution criteria have been satisfied and the incident has reached a resolvable state.
- _scope:_ 0

### PM34-F1
- **FR:** The system shall determine the correct post-resolution workflow destination and automatically advance the affected item once the incident is resolved and no remaining blocking conditions exist.
- _scope:_ 0

### PM35-F1
- **FR:** The system shall calculate incident age from creation and last-touch timestamps and generate follow-up prompts or escalations when configured threshold intervals are reached.
- _scope:_ 0

### PM36-F1
- **FR:** The system shall automatically create a complete problem hold artifact whenever testing is instantiated in a HOLD status and no existing linked incident satisfies the required outreach workflow.
- _scope:_ 0

### PM37-F1
- **FR:** The system shall create a client-follow-up incident when a RaDaR order generates an Unknown-FFPE specimen placeholder under configured first-timepoint rules.
- _scope:_ 0

### PM38-F1
- **FR:** The system shall create a client-follow-up incident when a RaDaR order generates an Unknown-PB specimen placeholder under configured first-timepoint rules.
- _scope:_ 0

### PM39-F1
- **FR:** The system shall create a complete problem hold when a specimen is received or created with Unknown identification values in scenarios designated as non-processable until clarified.
- _scope:_ 0

### PM40-F1
- **FR:** The system shall classify unlabeled and mislabeled specimens as non-processable events and automatically create a complete problem hold.
- _scope:_ 0

### PM41-F1
- **FR:** The system shall evaluate specimen identification against configured minimum-identifier rules and create a partial problem hold when the specimen is under-identified but not fully non-processable.
- _scope:_ 0

### PM42-F1
- **FR:** The system shall create a complete problem hold when recorded specimen damage meets the configured non-processable damage threshold.
- _scope:_ 0

### PM43-F1
- **FR:** The system shall create a partial problem hold when recorded specimen damage is informational or reviewable but does not fully prevent testing.
- _scope:_ 0

### PM44-F1
- **FR:** The system shall create a complete problem hold when duplicate-testing detection rules identify patient-level testing redundancy that requires client confirmation before processing can continue.
- _scope:_ 0

### PM45-F1
- **FR:** The system shall surface open cancellation requests with their current workflow state, target order/test, and time-to-impact information so action can occur before irreversible processing steps are reached.
- _scope:_ 0

### PM46-F1
- **FR:** The system shall rank cancellation requests using configurable urgency logic based on current testing progression, laboratory status, and time sensitivity.
- _scope:_ 0

### PM47-F1
- **FR:** The system shall evaluate discharge-date dependency when specimen origin is Hospital Inpatient and create a partial problem hold when the required encounter date is absent.
- _scope:_ 0

### PM48-F1
- **FR:** The system shall evaluate archive-retrieval-date dependency when specimen age exceeds the configured threshold and create a partial problem hold when the required date is absent.
- _scope:_ 0

### PM49-F1
- **FR:** The system shall compare fixation time against the configured acceptable window for applicable CAP-governed testing.
- _scope:_ 0

### PM49-F2
- **FR:** The system shall route out-of-range fixation time cases to the designated Medical review workflow before testing proceeds.
- _scope:_ 0

### PM49-F3
- **FR:** The system shall record the Medical review decision and resulting disposition in the audit trail.
- _scope:_ 0

### BL1-F1
- **FR:** The system shall derive STAT priority from configured test, indication, and request-context rules and stamp the resulting priority on the test record.
- _scope:_ 0

### BL2-F1
- **FR:** The system shall derive Rush priority from configured acute clinical indicators and/or acute clinincal testing and apply the resulting priority classification without manual intervention.
- _scope:_ 0

### BL3-F1
- **FR:** The system shall calculate patient age from date of birth and assign Pediatric priority when the configured age threshold is me (<19yo).
- _scope:_ 0

### BL4-F1
- **FR:** The system shall populate the configured Unknown Client value when client fails to provide and no valid client or sponsor can be determined from source data.
- _scope:_ 0

### BL5-F1
- **FR:** The system shall populate the configured No NPI provided value when client fails to provide and no valid client or sponsor can be determined from source data.
- _scope:_ 0

### BL6-F1
- **FR:** The system shall populate the configured No NPI provided value when client provided information is unclear and cannot be determined.
- _scope:_ 0

### BL7-F1
- **FR:** The system shall evaluate client-specific test restrictions and present a blocking or review alert when HST is ordered for a SCOPE client outside configured exception rules.
- _scope:_ 0

### BL8-F1
- **FR:** The system shall validate selected performing laboratory against NY validation attributes and generate a compliance alert when the chosen Neo TCP is not approved for the NY scenario.
- _scope:_ 0

### BL9-F1
- **FR:** The system shall determine when no Neo TCP satisfies the NY-validity rule and route the decision path to approved external sendout or hold handling.
- _scope:_ 0

### BL10-F1
- **FR:** The system shall place an automatic HOLD when NY testing has no valid internal or external execution path.
- _scope:_ 0

### BL11-F1
- **FR:** The system shall automatically assign the configured Reflex Status flag when ordered testing matches reflex-enabled compendium definitions.
- _scope:_ 0

### BL12-F1
- **FR:** The system shall populate the configured Unknown Bill To value when no Bill To source value is supplied and fallback is permitted by billing rules.
- _scope:_ 0

### BL13-F1
- **FR:** The system shall derive Order Origination Date from the configured source hierarchy by intake channel and persist the derived value for downstream use.
- _scope:_ 0

### BL14-F1
- **FR:** The system shall enforce CYG-specific diagnosis/referral requirements and raise the configured rule outcome when no valid ICD10 or Reason for Referral is present.
- _scope:_ 0

### BL15-F1
- **FR:** The system shall enforce FLG-specific diagnosis/referral requirements and raise the configured rule outcome when no valid ICD10 or Reason for Referral is present.
- _scope:_ 0

### BL16-F1
- **FR:** The system shall execute SPID comparison rules against physical and client-provided identifiers and mark the specimen-ID attribute as failed when the rule set does not reconcile.
- _scope:_ 0

### BL17-F1
- **FR:** TBD.
- _scope:_ 0

### BL18-F1
- **FR:** The system shall evaluate FFPE specimen records for missing body-site context and raise the configured rule outcome when no allowed default applies.
- _scope:_ 0

### BL19-F1
- **FR:** The system shall evaluate Fresh Tissue specimen records for missing body-site context and raise the configured rule outcome when no allowed default applies.
- _scope:_ 0

### BL20-F1
- **FR:** The system shall assign Bone Marrow as body site when specimen type equals Bone Marrow and body site is absent.
- _scope:_ 0

### BL21-F1
- **FR:** The system shall assign Peripheral Blood as body site when specimen type equals Peripheral Blood and body site is absent.
- _scope:_ 0

### BL22-F1
- **FR:** The system shall evaluate Technical FISH on FFPE orders for documented Circled H&E presence and raise the configured rule outcome when the artifact is absent.
- _scope:_ 0

### BL23-F1
- **FR:** The system shall evaluate FFPE specimens for presence of client specimen ID and raise the configured rule outcome when the identifier is absent.
- _scope:_ 0

### BL24-F1
- **FR:** TBD.
- _scope:_ 0

### BL25-F1
- **FR:** TBD.
- _scope:_ 0

### BL26-F1
- **FR:** TBD.
- _scope:_ 0

### BL27-F1
- **FR:** The system shall populate the configured fallback gender when patient gender is absent and fallback is permitted.
- _scope:_ 0

### BL28-F1
- **FR:** The system shall evaluate document inventory for CBC presence when FLG or MRP testing is ordered and emit the configured rule outcome when CBC is not found.
- _scope:_ 0

### BL29-F1
- **FR:** The system shall evaluate document inventory for required pathology-report presence when Global FFPE or PanTracer Pro testing is ordered and emit the configured rule outcome when the report is absent.
- _scope:_ 0

### BL30-F1
- **FR:** The system shall determine when FFPE execution-strategy selection is required and present only the configured strategy options applicable to the current order context.
- _scope:_ 0

### BL31-F1
- **FR:** The system shall derive performing laboratory from the user's active location when no preferred TCP is defined for the selected testing.
- _scope:_ 0

### BL32-F1
- **FR:** The system shall evaluate preferred performing laboratory selection against insurance-based routing constraints before final TCP assignment.
- _scope:_ 0

### BL33-F1
- **FR:** The system shall evaluate prior-timepoint completion state during follow-up order setup and move the follow-up test to HOLD when the sequencing prerequisite is unmet.
- _scope:_ 0

### BL34-F1
- **FR:** The system shall materialize the required parent-test specimen expectations for RaDaR ST First Timepoint according to configured specimen-dependency rules.
- _scope:_ 0

### BL35-F1
- **FR:** The system shall materialize the required child-test Peripheral Blood specimen expectation when RaDaR ST First Timepoint is ordered.
- _scope:_ 0

### BL36-F1
- **FR:** The system shall create the configured placeholder Peripheral Blood specimen record when RaDaR first-timepoint setup detects Paraffin Tissue receipt without the required blood specimen.
- _scope:_ 0

### BL37-F1
- **FR:** The system shall create the configured placeholder Paraffin Tissue specimen record when RaDaR first-timepoint setup detects blood receipt without the required tissue specimen.
- _scope:_ 0

### BL38-F1
- **FR:** The system shall create the configured placeholder tissue and blood specimen records when RaDaR first-timepoint setup detects that no required specimens are yet present.
- _scope:_ 0

### BL39-F1
- **FR:** The system shall transition the RaDaR ST First Timepoint child test to HOLD when the required Peripheral Blood specimen dependency is unsatisfied.
- _scope:_ 0

### BL40-F1
- **FR:** The system shall transition the RaDaR ST First Timepoint parent test to HOLD when the required Paraffin Tissue specimen dependency is unsatisfied.
- _scope:_ 0

### BL41-F1
- **FR:** The system shall transition both RaDaR ST First Timepoint parent and child tests to HOLD when both required specimen dependencies are unsatisfied.
- _scope:_ 0

### BL42-F1
- **FR:** The system shall enforce diagnosis/referral requirements for non-client-bill orders and emit the configured rule outcome when the required value set is absent.
- _scope:_ 0

### BL43-F1
- **FR:** The system shall populate CAP responses with the configured Unknown value when CAP questions are required and no explicit response is provided.
- _scope:_ 0

### BL44-F1
- **FR:** The system shall instantiate the configured testing cadence schedule when an eligible initial timepoint order is placed.
- _scope:_ 0

### BL45-F1
- **FR:** The system shall generate a cadence recommendation from configured order-type and clinical-context parameters.
- _scope:_ 0

### BL46-F1
- **FR:** The system shall validate existence of a qualifying initial order for the same patient before allowing follow-up order selection or submission.
- _scope:_ 0

### BL47-F1
- **FR:** The system shall evaluate configured order-attribute and specimen-status combinations and auto-generate the mapped incident record when a triggering combination is present.
- _scope:_ 0

### BL48-F1
- **FR:** The system shall compare selected testing cadence to covered-indication rules and emit the configured review alert when the cadence falls outside supported criteria.
- _scope:_ 0

### BL49-F1
- **FR:** The system shall display the derived priority value for each test using the configured prioritization model.
- _scope:_ 0

### BL50-F1
- **FR:** The system shall move potentially redundant testing into HOLD when duplicate-testing rules are met and maintain that state until client-directed resolution is recorded.
- _scope:_ 0

### BL51-F1
- **FR:** The system shall enforce discharge-date entry as a required dependency when specimen origin equals Hospital Inpatient.
- _scope:_ 0

### BL52-F1
- **FR:** The system shall enforce archive-retrieval-date entry when specimen age exceeds the configured threshold.
- _scope:_ 0

### A1-F1
- **FR:** The system shall support ingestion of client-initiated add-on requests.
- _scope:_ 0

### A2-F1
- **FR:** The system shall support ingestion of internal pathologist-initiated add-on requests.
- _scope:_ 0

### A3-F1
- **FR:** The system shall generate a worklist of pending add-on requests requiring action.
- _scope:_ 0

### A3-F2
- **FR:** The system shall evaluate the specimen location and present as either 'in-lab' if already received at a Neo facility, or 'Incoming' if not yet received/in-transit.
- _scope:_ 0

### A3-F3
- **FR:** The system shall display key add-on request attributes (order, patient, test, type (in-lab vs incoming), requestor, specimen availability, age, status).
- _scope:_ 0

### A4-F1
- **FR:** The system shall auto-route add-on requests to the appropriate add-on worklist based on the location of available specimen.
- _scope:_ 0

### A5-F1
- **FR:** The system shall create requested add-on testing on the associated order in an Add-On Pending status that supports review prior to activation.
- _scope:_ 0

### A6-F1
- **FR:** The system shall display the last known physical location of specimens associated to an order, including derivative specimens where applicable.
- _scope:_ 0

### A7-F1
- **FR:** The system shall evaluate add-on feasibility using quantity/volume, stability, condition, location, and modality rules.
- _scope:_ 0

### A7-F2
- **FR:** The system shall return feasibility outcomes (Eligible, Not Eligible, Requires Review).
- _scope:_ 0

### A8-F1
- **FR:** The system shall create reflex test shells in 'Reflex Pending' status based on the translated TC Order Code.
- _scope:_ 0

### A9-F1
- **FR:** The system shall activate reflex tests automatically when trigger conditions are met.
- _scope:_ 0

### A9-F2
- **FR:** The system shall close out the reflex shell testing if the reflex conditions are not met.
- _scope:_ 0

### A10-F1
- **FR:** The system shall allow activation of add-on tests only when specimen availability and validation criteria are satisfied.
- _scope:_ 0

### A11-F1
- **FR:** The system shall prevent add-on requests when all testing on an order is complete.
- _scope:_ 0

### A11-F2
- **FR:** The system shall provide an automated response to an add-on request that cannot accepted due to all testing on the order being complete.
- _scope:_ 0

### A12-F1
- **FR:** The system shall prevent activation of add-on tests only when specimen availability and validation criteria are satisfied.
- _scope:_ 0

### LD1-F1
- **FR:** The system shall maintain a record of operational exceptions and their resolutions for reporting and trend analysis.
- _scope:_ 0

### LD2-F1
- **FR:** The system shall provide automated dashboards with trend analysis across defined operational measures.
- _scope:_ 0

### LD2-F2
- **FR:** The system shall support anomaly detection or alerting for defined operational metrics.
- _scope:_ 0

### LD3-F1
- **FR:** The system shall provide visibility into workflow bottlenecks using status, aging, throughput, and queue-based measures.
- _scope:_ 0

### LD4-F1
- **FR:** The system shall aggregate problem hold counts by type, category, status, and aging bucket.
- _scope:_ 0

### LD4-F2
- **FR:** The system shall calculate resolution time for each hold from hold creation to hold closure or release.
- _scope:_ 0

### LD4-F3
- **FR:** The system shall allow leaders to filter hold metrics by date range, site, workflow step, hold category, and responsible team or queue.
- _scope:_ 0

### SA1-F1
- **FR:** The system shall support single sign-on for authenticated user access.
- _scope:_ 0

### SA2-F1
- **FR:** The system shall enforce granular role-based permissions for data access and available system functions.
- _scope:_ 0

### SA3-F1
- **FR:** The system shall meet defined page load and search response SLA targets under expected operating conditions.
- _scope:_ 0

### SA4-F1
- **FR:** The system shall meet defined uptime and availability SLA targets.
- _scope:_ 0

### SA5-F1
- **FR:** The system shall support expected concurrent user volumes without unacceptable performance degradation.
- _scope:_ 0
