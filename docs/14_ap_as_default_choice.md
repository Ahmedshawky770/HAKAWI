# Principle #14: AP as the Default Choice

**Statement:**
In distributed systems, I default to Availability and Partition Tolerance. I compensate for the absence of strong consistency by optimizing response speed (Low Latency), ensuring users perceive the system as fast and responsive. Strong Consistency (CP) is reserved exclusively for 'critical islands' — payments, inventory, and authentication — where inconsistency means financial loss or security breaches. For everything else, availability wins.

**Rationale:**
- Users prefer fast over consistent
- Network partitions are inevitable
- Strong consistency is expensive
- Critical data needs consistency, not everything

**Enforcement:**
- Repository pattern for data access
- Eventual consistency for non-critical data
- Strong consistency for payments, auth, inventory
- Optimistic locking for conflicts

**Consistency Matrix:**
| Data Type | Consistency | Reason |
|-----------|-------------|--------|
| Payments | Strong | Financial accuracy |
| Auth | Strong | Security |
| Inventory | Strong | Stock accuracy |
| Stories | Eventual | User-generated content |
| Notifications | Eventual | Non-critical |
| Analytics | Eventual | Derived data |
