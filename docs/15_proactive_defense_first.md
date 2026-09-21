# Principle #15: Proactive Defense First

**Statement:**
I use Rate Limiting as the first line of defense against system overload — before resorting to reactive mechanisms like Circuit Breakers, Retry patterns, or Fallback strategies. The best way to handle a system failure is to prevent it from happening in the first place. Reacting to overload is a backup plan; preventing overload is the primary strategy. Defense in depth starts with prevention.

**Rationale:**
- Prevention is cheaper than cure
- Rate limiting is cheap to implement
- Circuit breakers are reactive, not preventive
- Overload damages system reputation

**Enforcement:**
- Rate limiting on all public APIs
- WAF for malicious traffic
- Input validation at all boundaries
- Resource quotas per user/tenant

**Layers:**
1. Rate limiting (first line)
2. WAF (second line)
3. Input validation (third line)
4. Circuit breakers (last resort)
