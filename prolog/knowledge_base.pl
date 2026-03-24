% =============================================================================
% MediCheck Knowledge Base
% Medical Diagnosis Expert System — University AI Project
% =============================================================================
% This file defines:
%   - disease/1          : known diseases
%   - symptom/2          : symptoms associated with each disease
%   - rule/4             : IF-THEN diagnostic rules (Id, Disease, Confidence, RequiredSymptoms)
%   - exclusion_rule/2   : conditions that definitively rule out a disease
%   - advice/2           : follow-up advice per disease/confidence
% =============================================================================

:- module(knowledge_base, [
    disease/1,
    symptom/2,
    symptom_display/2,
    rule/4,
    exclusion_rule/2,
    advice/2
]).

% ---------------------------------------------------------------------------
% DISEASES
% ---------------------------------------------------------------------------
disease(malaria).
disease(diarrhoea).
disease('HIV/AIDS').

% ---------------------------------------------------------------------------
% SYMPTOMS — symptom(Disease, SymptomAtom)
% ---------------------------------------------------------------------------

% Malaria symptoms
symptom(malaria, fever).
symptom(malaria, chills).
symptom(malaria, headache).
symptom(malaria, sweating).
symptom(malaria, muscle_pain).
symptom(malaria, nausea).
symptom(malaria, vomiting).

% Diarrhoea symptoms
symptom(diarrhoea, loose_stools).
symptom(diarrhoea, stomach_cramps).
symptom(diarrhoea, abdominal_pain).
symptom(diarrhoea, nausea).
symptom(diarrhoea, dehydration).
symptom(diarrhoea, mild_fever).
symptom(diarrhoea, loss_of_appetite).
symptom(diarrhoea, bloating).

% HIV/AIDS symptoms
symptom('HIV/AIDS', weight_loss).
symptom('HIV/AIDS', persistent_fatigue).
symptom('HIV/AIDS', night_sweats).
symptom('HIV/AIDS', swollen_lymph_nodes).
symptom('HIV/AIDS', recurring_fever).
symptom('HIV/AIDS', oral_thrush).
symptom('HIV/AIDS', shortness_of_breath).
symptom('HIV/AIDS', frequent_infections).

% ---------------------------------------------------------------------------
% SYMPTOM DISPLAY NAMES — symptom_display(Atom, DisplayName)
% ---------------------------------------------------------------------------
symptom_display(fever,              'Fever').
symptom_display(chills,             'Chills').
symptom_display(headache,           'Headache').
symptom_display(sweating,           'Sweating').
symptom_display(muscle_pain,        'Muscle Pain').
symptom_display(nausea,             'Nausea').
symptom_display(vomiting,           'Vomiting').
symptom_display(loose_stools,       'Loose Stools').
symptom_display(stomach_cramps,     'Stomach Cramps').
symptom_display(abdominal_pain,     'Abdominal Pain').
symptom_display(dehydration,        'Dehydration').
symptom_display(mild_fever,         'Mild Fever').
symptom_display(loss_of_appetite,   'Loss of Appetite').
symptom_display(bloating,           'Bloating').
symptom_display(weight_loss,        'Weight Loss').
symptom_display(persistent_fatigue, 'Persistent Fatigue').
symptom_display(night_sweats,       'Night Sweats').
symptom_display(swollen_lymph_nodes,'Swollen Lymph Nodes').
symptom_display(recurring_fever,    'Recurring Fever').
symptom_display(oral_thrush,        'Oral Thrush').
symptom_display(shortness_of_breath,'Shortness of Breath').
symptom_display(frequent_infections,'Frequent Infections').

% ---------------------------------------------------------------------------
% DIAGNOSTIC RULES
% rule(RuleId, Disease, Confidence, RequiredSymptoms)
%
% Confidence levels: high | medium | possible
% RequiredSymptoms: list of symptom atoms — ALL must be present for rule to fire
% ---------------------------------------------------------------------------

% --- MALARIA RULES ---
rule(malaria_high,
     malaria,
     high,
     [fever, chills, headache, sweating, muscle_pain]).

rule(malaria_medium,
     malaria,
     medium,
     [fever, chills, nausea, vomiting]).

rule(malaria_possible,
     malaria,
     possible,
     [fever, chills, sweating, headache]).

% Weak rule: minimum malaria indicators (gatekeeper + one symptom)
rule(malaria_weak,
     malaria,
     possible,
     [fever, chills]).

% --- DIARRHOEA RULES ---
rule(diarrhoea_high,
     diarrhoea,
     high,
     [loose_stools, stomach_cramps, dehydration]).

rule(diarrhoea_medium,
     diarrhoea,
     medium,
     [loose_stools, abdominal_pain, nausea]).

rule(diarrhoea_possible,
     diarrhoea,
     possible,
     [loose_stools, loss_of_appetite, bloating]).

% Weak rules: minimum diarrhoea indicators
rule(diarrhoea_weak,
     diarrhoea,
     possible,
     [loose_stools, stomach_cramps]).

rule(diarrhoea_weak2,
     diarrhoea,
     possible,
     [loose_stools, mild_fever]).

% --- HIV/AIDS RULES ---
rule(hiv_high,
     'HIV/AIDS',
     high,
     [weight_loss, persistent_fatigue, night_sweats, swollen_lymph_nodes]).

rule(hiv_medium,
     'HIV/AIDS',
     medium,
     [recurring_fever, persistent_fatigue, swollen_lymph_nodes, weight_loss]).

rule(hiv_possible,
     'HIV/AIDS',
     possible,
     [oral_thrush, weight_loss, night_sweats]).

% Weak rules: minimum HIV/AIDS indicators (duration exclusion still applies)
rule(hiv_weak,
     'HIV/AIDS',
     possible,
     [persistent_fatigue, weight_loss]).

rule(hiv_weak2,
     'HIV/AIDS',
     possible,
     [night_sweats, persistent_fatigue]).

% ---------------------------------------------------------------------------
% EXCLUSION RULES — exclusion_rule(Disease, RequiredAbsentSymptom)
% If the listed symptom is absent from the reported symptoms, the disease
% is excluded from consideration entirely.
% ---------------------------------------------------------------------------
exclusion_rule(malaria,    chills).
exclusion_rule(diarrhoea,  loose_stools).
% HIV/AIDS exclusion is handled via symptom_duration in the inference engine

% ---------------------------------------------------------------------------
% ADVICE — advice(Disease-Confidence, AdviceText)
% ---------------------------------------------------------------------------
advice(malaria-high,
    'Seek immediate medical attention. A blood smear or RDT test is required to confirm Malaria. Do not self-medicate with antimalarials without laboratory confirmation.').

advice(malaria-medium,
    'Consult a doctor promptly. Your symptoms are consistent with Malaria. A rapid diagnostic test (RDT) is recommended.').

advice(malaria-possible,
    'Monitor symptoms closely. Possible Malaria — confirm with a blood test. Seek medical care if symptoms worsen or persist beyond 24 hours.').

advice(diarrhoea-high,
    'Stay hydrated with oral rehydration salts (ORS). Seek medical attention if dehydration is severe, symptoms persist beyond 48 hours, or blood appears in stools.').

advice(diarrhoea-medium,
    'Rest and increase fluid intake. Eat bland foods. Consult a doctor if symptoms worsen or do not improve within 48 hours.').

advice(diarrhoea-possible,
    'Possible Diarrhoea — monitor hydration carefully. Avoid dairy and fatty foods. Seek medical advice if symptoms escalate.').

advice('HIV/AIDS'-high,
    'URGENT: Please refer for HIV testing immediately. These symptoms are strongly associated with HIV/AIDS. Early diagnosis is critical for effective treatment and care.').

advice('HIV/AIDS'-medium,
    'These symptoms may indicate HIV/AIDS. An HIV test is strongly recommended. Consult a healthcare provider as soon as possible.').

advice('HIV/AIDS'-possible,
    'Possible HIV/AIDS indicators detected. An HIV test is recommended. Speak confidentially with a healthcare provider.').
