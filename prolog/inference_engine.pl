% =============================================================================
% MediCheck Inference Engine — Forward Chaining
% Medical Diagnosis Expert System — University AI Project
% =============================================================================
%
% FORWARD CHAINING ALGORITHM:
%   1. Start with the FACTS: the reported symptom atoms in WorkingMemory
%   2. Scan ALL diagnostic rules in the knowledge base
%   3. For each rule, check if ALL required symptoms are present in WorkingMemory
%   4. If yes → the rule FIRES: assert the derived fact (diagnosis) and record
%      the rule in the inference chain
%   5. Apply exclusion rules to filter out impossible diagnoses
%   6. Continue until no new facts can be derived (fixed-point / closure)
%   7. Select the best result from all fired diagnoses (highest confidence)
%   8. If nothing fired → return the fallback message
%
% This is a DATA-DRIVEN (forward) approach: we start from symptoms (data)
% and chain forward through rules until we reach a conclusion.
% =============================================================================

:- module(inference_engine, [
    diagnose/3,
    run_forward_chaining/4,
    best_possible/4
]).

:- use_module(knowledge_base).

% ---------------------------------------------------------------------------
% diagnose(+Symptoms, +SymptomDuration, -Result)
%
% Main entry point.
%   Symptoms        : list of symptom atoms reported by the patient
%   SymptomDuration : atom — 'less_than_2_weeks' | 'more_than_2_weeks' | 'unknown'
%   Result          : dict-like structure (see DiagnosisResult type)
% ---------------------------------------------------------------------------
diagnose(Symptoms, SymptomDuration, Result) :-
    % --- PHASE 1: Initialise working memory with reported symptom facts ---
    list_to_set(Symptoms, SymptomSet),

    % --- PHASE 2: Apply exclusion rules to determine candidate diseases ---
    findall(Disease,
        (disease(Disease),
         \+ excluded(Disease, SymptomSet, SymptomDuration)),
        CandidateDiseases),

    % --- PHASE 3: Forward chaining — fire all matching rules ---
    run_forward_chaining(SymptomSet, CandidateDiseases, FiredRules, DerivedFacts),

    % --- PHASE 4: Select best diagnosis from derived facts ---
    (   DerivedFacts \= []
    ->  select_best_diagnosis(DerivedFacts, FiredRules, SymptomSet, Result)
    ;   % No rules fired — fallback
        Result = result{
            diagnosis:  'Unable to determine diagnosis',
            confidence: none,
            rules_fired: [],
            matched_symptoms: [],
            reasoning: 'No diagnostic rules could be matched to the reported symptoms. Please consult a medical professional for a proper evaluation.',
            advice: 'Unable to make a diagnosis based on the provided symptoms. Please consult a qualified medical professional.'
        }
    ).


% ---------------------------------------------------------------------------
% excluded(+Disease, +SymptomSet, +SymptomDuration)
%
% Succeeds if Disease should be excluded given the symptom set.
% ---------------------------------------------------------------------------
excluded(Disease, SymptomSet, _SymptomDuration) :-
    % Symptom-based exclusion: required key symptom is absent
    exclusion_rule(Disease, RequiredSymptom),
    \+ memberchk(RequiredSymptom, SymptomSet).

excluded('HIV/AIDS', _SymptomSet, less_than_2_weeks).


% ---------------------------------------------------------------------------
% run_forward_chaining(+SymptomSet, +CandidateDiseases, -FiredRules, -DerivedFacts)
%
% Iterates over all rules and fires those whose conditions are satisfied.
% A rule fires if:
%   (a) Its disease is in CandidateDiseases (not excluded)
%   (b) ALL required symptoms are present in SymptomSet
%
% FiredRules  : list of rule_fired(RuleId, Disease, Confidence, MatchedSymptoms)
% DerivedFacts: list of derived(Disease, Confidence, RuleId)
% ---------------------------------------------------------------------------
run_forward_chaining(SymptomSet, CandidateDiseases, FiredRules, DerivedFacts) :-
    findall(
        rule_fired(RuleId, Disease, Confidence, Required),
        (
            rule(RuleId, Disease, Confidence, Required),
            memberchk(Disease, CandidateDiseases),
            all_present(Required, SymptomSet)
        ),
        FiredRules
    ),
    findall(
        derived(Disease, Confidence, RuleId),
        member(rule_fired(RuleId, Disease, Confidence, _), FiredRules),
        DerivedFacts
    ).


% ---------------------------------------------------------------------------
% all_present(+Required, +SymptomSet)
%
% Succeeds iff every symptom in Required is a member of SymptomSet.
% This is the core "condition check" of each forward-chaining rule application.
% ---------------------------------------------------------------------------
all_present([], _).
all_present([H|T], SymptomSet) :-
    memberchk(H, SymptomSet),
    all_present(T, SymptomSet).


% ---------------------------------------------------------------------------
% select_best_diagnosis(+DerivedFacts, +FiredRules, +SymptomSet, -Result)
%
% From all derived facts, picks the highest-confidence diagnosis.
% Priority: high > medium > possible
% If multiple diseases at same confidence, all are reported (multi-diagnosis).
% ---------------------------------------------------------------------------
select_best_diagnosis(DerivedFacts, FiredRules, SymptomSet, Result) :-
    % Try high confidence first
    (   member(derived(Disease, high, _), DerivedFacts)
    ->  Confidence = high,
        filter_facts_for(Disease, DerivedFacts, DiseaseFacts),
        collect_fired_for_disease(Disease, FiredRules, DiseaseFiredRules)
    ;   % Then medium
        member(derived(Disease, medium, _), DerivedFacts)
    ->  Confidence = medium,
        filter_facts_for(Disease, DerivedFacts, DiseaseFacts),
        collect_fired_for_disease(Disease, FiredRules, DiseaseFiredRules)
    ;   % Then possible — rank by number of matched symptoms so the most
        % relevant disease wins when symptoms from multiple categories are selected
        best_possible(DerivedFacts, FiredRules, SymptomSet, Disease),
        Confidence = possible,
        filter_facts_for(Disease, DerivedFacts, DiseaseFacts),
        collect_fired_for_disease(Disease, FiredRules, DiseaseFiredRules)
    ),
    % Collect all rules that fired for this disease (for the reasoning chain)
    maplist(extract_rule_id, DiseaseFiredRules, RuleIdList),
    collect_matched_symptoms(DiseaseFiredRules, SymptomSet, MatchedSymptoms),
    build_reasoning(Disease, Confidence, DiseaseFiredRules, SymptomSet, Reasoning),
    advice(Disease-Confidence, Advice),
    atom_string(Disease, DiseaseStr),
    atom_string(Confidence, ConfStr),
    maplist(rule_id_to_string, RuleIdList, RuleIdStrings),
    Result = result{
        diagnosis:        DiseaseStr,
        confidence:       ConfStr,
        rules_fired:      RuleIdStrings,
        matched_symptoms: MatchedSymptoms,
        reasoning:        Reasoning,
        advice:           Advice
    }.


% ---------------------------------------------------------------------------
% filter_facts_for(+Disease, +AllFacts, -DiseaseFacts)
% ---------------------------------------------------------------------------
filter_facts_for(Disease, AllFacts, DiseaseFacts) :-
    include([F]>>(F = derived(Disease, _, _)), AllFacts, DiseaseFacts).


% ---------------------------------------------------------------------------
% collect_fired_for_disease(+Disease, +AllFiredRules, -DiseaseFiredRules)
% ---------------------------------------------------------------------------
collect_fired_for_disease(Disease, AllFiredRules, DiseaseFiredRules) :-
    include([R]>>(R = rule_fired(_, Disease, _, _)), AllFiredRules, DiseaseFiredRules).


% ---------------------------------------------------------------------------
% extract_rule_id(+FiredRule, -RuleId)
% ---------------------------------------------------------------------------
extract_rule_id(rule_fired(RuleId, _, _, _), RuleId).


% ---------------------------------------------------------------------------
% rule_id_to_string(+RuleId, -String)
% ---------------------------------------------------------------------------
rule_id_to_string(RuleId, String) :- atom_string(RuleId, String).


% ---------------------------------------------------------------------------
% collect_matched_symptoms(+FiredRules, +SymptomSet, -MatchedSymptoms)
%
% Gathers all symptoms from all fired rules that were present in SymptomSet.
% Deduplicates the result.
% ---------------------------------------------------------------------------
collect_matched_symptoms(FiredRules, SymptomSet, MatchedSymptoms) :-
    findall(S,
        (member(rule_fired(_, _, _, Required), FiredRules),
         member(S, Required),
         memberchk(S, SymptomSet)),
        AllMatched),
    list_to_set(AllMatched, MatchedSet),
    maplist(atom_string, MatchedSet, MatchedSymptoms).


% ---------------------------------------------------------------------------
% build_reasoning(+Disease, +Confidence, +FiredRules, +SymptomSet, -Reasoning)
%
% Constructs a human-readable reasoning chain string showing which rules
% fired, which symptoms triggered them, and what conclusion was reached.
% ---------------------------------------------------------------------------
build_reasoning(Disease, Confidence, FiredRules, SymptomSet, Reasoning) :-
    atom_string(Disease, DiseaseStr),
    confidence_label(Confidence, ConfLabel),
    length(SymptomSet, SymCount),
    maplist(format_rule_step(SymptomSet), FiredRules, StepStrings),
    atomic_list_concat(StepStrings, ' ', StepsAtom),
    atom_string(StepsAtom, StepsStr),
    format(string(Reasoning),
        "Forward chaining inference initiated with ~w reported symptom(s). ~w Conclusion: ~w diagnosed with ~w confidence.",
        [SymCount, StepsStr, DiseaseStr, ConfLabel]).


format_rule_step(SymptomSet, rule_fired(RuleId, Disease, Confidence, Required), Step) :-
    include([S]>>(memberchk(S, SymptomSet)), Required, Present),
    maplist(atom_string, Present, PresentStrs),
    atomic_list_concat(PresentStrs, ', ', PresentAtom),
    atom_string(RuleId, RuleIdStr),
    atom_string(Disease, DiseaseStr),
    confidence_label(Confidence, ConfLabel),
    format(string(Step),
        "[Rule ~w fired: (~w) → ~w (~w).]",
        [RuleIdStr, PresentAtom, DiseaseStr, ConfLabel]).


confidence_label(high,     'HIGH').
confidence_label(medium,   'MEDIUM').
confidence_label(possible, 'POSSIBLE').
confidence_label(none,     'NONE').


% ---------------------------------------------------------------------------
% best_possible(+DerivedFacts, +FiredRules, +SymptomSet, -BestDisease)
%
% Among all POSSIBLE-confidence derived facts, picks the disease whose fired
% rules cover the most unique matched symptoms.  This ensures that when a
% user selects symptoms from multiple categories, the disease with the
% strongest symptom overlap wins rather than whichever appears first.
% ---------------------------------------------------------------------------
best_possible(DerivedFacts, FiredRules, SymptomSet, BestDisease) :-
    findall(Count-Disease,
        (   member(derived(Disease, possible, _), DerivedFacts),
            collect_fired_for_disease(Disease, FiredRules, DRules),
            collect_matched_symptoms(DRules, SymptomSet, Matched),
            length(Matched, Count)
        ),
        Scored),
    sort(0, @>=, Scored, [_-BestDisease|_]).
