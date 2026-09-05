-- Optional Drivable data-integrity hardening (2024-09-02).
--
-- Adds referential integrity and lookup indexes on top of the core schema
-- (0002). EVERY constraint is CREATE ... NOT VALID so existing data is never
-- re-scanned and nothing is dropped; constraints still enforce on all new
-- writes going forward.
--
-- SAFETY NOTES FOR THE OWNER
--   * This file is NOT applied by this worktree or its CI.
--   * FKs on diagnoses/consultations/follow_up_requests assume the runtime
--     always supplies a real registered users.id. That is true today:
--     server/routes.ts only persists public cases through
--     insertPublicDiagnosisCaseToDb(...) with
--     authenticatedCaseOwnerId(req.drivableCustomer?.id), which throws when
--     no authenticated customer is present. NULL user_id values are allowed
--     by MATCH SIMPLE semantics and never checked.
--   * The seed follow-up FK requires symptom categories to import before
--     follow-up questions. The seed manifest already orders them this way
--     (symptom_categories is priority 1), and every one of the 72 seed
--     questions references an existing category (verified).
--   * If a future code path inserts users into either side (consultation,
--     mechanic) outside the current flows, re-verify before applying.

begin;

-- ---------------------------------------------------------------------------
-- Referential integrity (enforced on new writes only)
-- ---------------------------------------------------------------------------

alter table diagnoses
  add constraint diagnoses_user_id_fkey
  foreign key (user_id) references users(id) not valid;

alter table fix_history_log
  add constraint fix_history_log_user_id_fkey
  foreign key (user_id) references users(id) not valid;

alter table consultations
  add constraint consultations_user_id_fkey
  foreign key (user_id) references users(id) not valid;

alter table consultations
  add constraint consultations_mechanic_id_fkey
  foreign key (mechanic_id) references mechanics(id) not valid;

alter table consultations
  add constraint consultations_diagnosis_id_fkey
  foreign key (diagnosis_id) references diagnoses(id) not valid;

alter table follow_up_requests
  add constraint follow_up_requests_user_id_fkey
  foreign key (user_id) references users(id) not valid;

alter table follow_up_requests
  add constraint follow_up_requests_diagnosis_id_fkey
  foreign key (original_diagnosis_id) references diagnoses(id) not valid;

alter table drivable_seed_follow_up_questions
  add constraint seed_follow_up_symptom_category_fkey
  foreign key (symptom_category_id)
  references drivable_seed_symptom_categories(symptom_category_id) not valid;

-- ---------------------------------------------------------------------------
-- Lookup index for the Buyer Check vehicle-knowledge query
-- (server/routes.ts uses lower(vehicle_make) / lower(vehicle_model), which do
--  not use the plain (vehicle_year, vehicle_make, vehicle_model) index)
-- ---------------------------------------------------------------------------

create index if not exists knowledge_packs_vehicle_lower_idx
  on drivable_vehicle_knowledge_packs
  (vehicle_year, lower(vehicle_make), lower(vehicle_model));

-- Timeline/identity support: user_id + created_at for diagnoses and
-- follow-up requests (drives identity endpoints in server/routes.ts).

create index if not exists diagnoses_user_created_at_idx
  on diagnoses (user_id, created_at desc);

create index if not exists follow_up_user_created_at_idx
  on follow_up_requests (user_id, created_at desc);

commit;