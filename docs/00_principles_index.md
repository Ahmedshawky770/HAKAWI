# Architecture Principles Index
## حكاوي (Hakawi) - Core Principles

---

## Principles

| # | File | Principle |
|---|------|-----------|
| 1 | `01_zero_any_policy.md` | Zero `any` / `as any` Policy |
| 2 | `02_logger_over_console.md` | Logger Over `console` |
| 3 | `03_ids_as_strings.md` | IDs as Strings |
| 4 | `04_document_problems_and_solutions.md` | Document Problems and Solutions |
| 5 | `05_architecture_before_code.md` | Architecture Before Code |
| 6 | `06_minimize_database_migrations.md` | Minimize Database Migrations |
| 7 | `07_loose_coupling_between_modules.md` | Loose Coupling Between Modules |
| 8 | `08_open_for_extension_closed_for_modification.md` | Open for Extension, Closed for Modification |
| 9 | `09_single_source_of_truth.md` | Single Source of Truth (SSOT) |
| 10 | `10_unified_typing_files.md` | Unified Typing Files |
| 11 | `11_valkey_as_cache_layer.md` | Valkey (Docker) as Cache Layer |
| 12 | `12_reduce_synchronization_unify_source.md` | Reduce Synchronization, Unify Source, Prevent Cascade Failures |
| 13 | `13_automate_massive_modifications.md` | Automate Massive Modifications (With Awareness) |
| 14 | `14_ap_as_default_choice.md` | AP as the Default Choice |
| 15 | `15_proactive_defense_first.md` | Proactive Defense First |
| 16 | `16_smart_hybrid_consistency.md` | Smart Hybrid Consistency |
| 17 | `17_warning_against_massive_linting.md` | Warning Against Automating Massive Linting |

---

## Categories

### Code Quality
- #1: Zero `any` / `as any` Policy
- #2: Logger Over `console`
- #3: IDs as Strings
- #10: Unified Typing Files

### Architecture & Design
- #5: Architecture Before Code
- #6: Minimize Database Migrations
- #7: Loose Coupling Between Modules
- #8: Open for Extension, Closed for Modification
- #9: Single Source of Truth (SSOT)

### Documentation & Process
- #4: Document Problems and Solutions
- #13: Automate Massive Modifications (With Awareness)
- #17: Warning Against Automating Massive Linting

### Infrastructure & Reliability
- #11: Valkey (Docker) as Cache Layer
- #12: Reduce Synchronization, Unify Source, Prevent Cascade Failures

### Distributed Systems & Consistency
- #14: AP as the Default Choice
- #15: Proactive Defense First
- #16: Smart Hybrid Consistency

---

## Reading Order

**For New Team Members:**
1. Start with #1, #2, #3 (Code Quality)
2. Then #5, #6, #7, #8, #9 (Architecture)
3. Then #10, #11, #12 (Infrastructure)
4. Then #13, #14, #15, #16, #17 (Advanced)

**For Architects:**
1. Start with #5 (Architecture Before Code)
2. Then #9 (SSOT)
3. Then #7, #8 (Design Principles)
4. Then #14, #16 (Consistency)

**For Developers:**
1. Start with #1, #2, #3 (Code Quality)
2. Then #10 (Typing)
3. Then #7, #8 (Design)
4. Then #11, #12 (Infrastructure)

---

## Enforcement

All principles are enforced through:
- **ESLint rules** (where applicable)
- **CI/CD checks** (TypeScript compilation, linting)
- **Code review** (peer review checklist)
- **Architecture review** (design review process)

---

*These 17 principles form the foundation of the Hakawi architecture. They are not suggestions — they are rules.*
