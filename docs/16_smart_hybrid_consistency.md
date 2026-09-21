# Principle #16: Smart Hybrid Consistency

**Statement:**
No large system is purely consistent or purely available — every real-world system is inherently Hybrid. I classify data into three categories and apply the appropriate consistency model to each: Strong Consistency for critical data (payments, direct chat messages, inventory counts), Eventual Consistency for non-critical data (feeds, notifications, analytics), and Causal Consistency for causally related data (comments and their replies, threaded discussions). Choosing the right consistency model for the right data is what separates a system that works from a system that works at scale.

**Rationale:**
- One size does not fit all
- Strong consistency is expensive
- Eventual consistency is fast
- Causal consistency maintains order

**Enforcement:**
- Data classification matrix
- Consistency model per data type
- Monitoring for consistency violations
- Compensation mechanisms for inconsistencies

**Consistency Types:**
| Type | Use Case | Example |
|------|----------|---------|
| Strong | Critical data | Payments, auth |
| Eventual | Non-critical | Feeds, notifications |
| Causal | Related data | Comments, threads |
