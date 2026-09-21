# Principle #5: Architecture Before Code

**Statement:**
I never write a single line of code before drawing the architecture. Every project begins with diagrams: system components, data flow, module boundaries, dependency directions, and integration points. Coding without architecture is building a house without a blueprint — it might stand for a while, but it will collapse the moment you need to extend it. Architecture is not overhead; it is insurance.

**Rationale:**
- Prevents costly refactoring later
- Aligns team on shared vision
- Identifies risks early
- Enables parallel development

**Enforcement:**
- No feature implementation without architecture review
- C4 diagrams for every module
- ADRs for every significant decision
- Architecture review checklist

**Deliverables:**
- System context diagram
- Container diagram
- Component diagram
- Data flow diagram
- Module dependency graph
