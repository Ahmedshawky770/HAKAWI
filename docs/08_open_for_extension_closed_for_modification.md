# Principle #8: Open for Extension, Closed for Modification

**Statement:**
I design my systems so that new features can be added without modifying existing, working code. This is not an abstract OOP principle — it is a survival strategy. Every time you modify working code, you risk breaking something you did not intend to. Extension through interfaces, strategies, and plugins is always safer than modification of core logic.

**Rationale:**
- Modifying working code introduces risk
- Regression bugs are expensive
- Features should be additive, not invasive
- System stability is paramount

**Enforcement:**
- New features via new modules/classes
- Extension points via interfaces
- Strategy pattern for variable behavior
- Plugin architecture for optional features

**Patterns:**
- Strategy pattern
- Decorator pattern
- Observer pattern (events)
- Plugin architecture
