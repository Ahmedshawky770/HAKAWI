# Principle #17: Warning Against Automating Massive Linting

**Statement:**
Running an automated lint-fix script across more than 100 files is not a fix — it is a potential corruption of the entire project. Automated linting tools, when applied at scale, often break code rather than repair it, introducing subtle regressions that are difficult to detect. Such operations demand careful manual review or, in many cases, a fundamental refactoring of the codebase instead of blind reliance on automation. Automation is a tool, not a substitute for understanding.

**Rationale:**
- Automated lint-fix can break code
- Subtle regressions are hard to detect
- Understanding is better than automation
- Refactoring is better than patching

**Enforcement:**
- No `lint --fix` on >50 files without manual review
- Prefer incremental fixes
- Refactor to prevent accumulation
- Code review for all bulk changes

**Better Approach:**
- Fix issues as they arise
- Refactor to prevent recurrence
- Use type-safe patterns
- Code review for all changes
