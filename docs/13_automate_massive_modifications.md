# Principle #13: Automate Massive Modifications (With Awareness)

**Statement:**
When I need to make a repetitive change across 40 or more files, I do not do it manually. I write a script, execute it in the terminal, and then review every change carefully. However, I treat this as a rescue protocol, not a standard workflow. Reaching this point means the abstraction was insufficient — and I commit to improving the architecture afterward to prevent the repetition from ever happening again.

**Rationale:**
- Manual changes are error-prone
- Repetition indicates poor abstraction
- Automation prevents human error
- But reaching this point is a code smell

**Enforcement:**
- Write scripts for bulk operations
- Review all changes after automation
- Refactor to prevent future repetition
- Document the script and its purpose

**Tools:**
- `jscodeshift` for code transformations
- `sed`/`awk` for simple replacements
- Custom Node.js scripts for complex changes
