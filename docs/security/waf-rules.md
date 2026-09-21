# WAF Rules
## Hakawi Security Architecture

This document defines the Web Application Firewall (WAF) rules for the Hakawi platform.

---

## WAF Overview

The WAF protects the Hakawi platform from common web attacks including:
- SQL Injection
- Cross-Site Scripting (XSS)
- Cross-Site Request Forgery (CSRF)
- Path Traversal
- Command Injection
- Server-Side Request Forgery (SSRF)

---

## Rule Categories

### 1. SQL Injection Prevention

#### Rule 1.1: Detect SQL Keywords
```
Pattern: (UNION|SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)
Action: Block
Severity: Critical
```

#### Rule 1.2: Detect SQL Comments
```
Pattern: (--|#|/\*|\*/)
Action: Block
Severity: High
```

#### Rule 1.3: Detect SQL Functions
```
Pattern: (SLEEP|BENCHMARK|WAITFOR|DELAY)
Action: Block
Severity: High
```

#### Rule 1.4: Detect SQL Operators
```
Pattern: (OR\s+1=1|AND\s+1=1|OR\s+'a'='a')
Action: Block
Severity: Critical
```

### 2. XSS Prevention

#### Rule 2.1: Detect Script Tags
```
Pattern: <script[^>]*>.*?</script>
Action: Block
Severity: Critical
```

#### Rule 2.2: Detect Event Handlers
```
Pattern: (onload|onerror|onclick|onmouseover|onfocus|onblur)\s*=
Action: Block
Severity: High
```

#### Rule 2.3: Detect JavaScript Protocol
```
Pattern: javascript:
Action: Block
Severity: High
```

#### Rule 2.4: Detect Data URLs
```
Pattern: data:text/html
Action: Block
Severity: Medium
```

### 3. CSRF Prevention

#### Rule 3.1: Validate CSRF Token
```
Check: X-CSRF-Token header present for state-changing requests
Action: Block if missing
Severity: High
```

#### Rule 3.2: Validate Origin
```
Check: Origin header matches expected domain
Action: Block if mismatch
Severity: High
```

### 4. Path Traversal Prevention

#### Rule 4.1: Detect Directory Traversal
```
Pattern: (\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/)
Action: Block
Severity: Critical
```

#### Rule 4.2: Validate File Paths
```
Check: File path within allowed directory
Action: Block if outside
Severity: High
```

### 5. Command Injection Prevention

#### Rule 5.1: Detect Command Chaining
```
Pattern: (;|\||&&|\|\|)
Action: Block in specific contexts
Severity: High
```

#### Rule 5.2: Detect Command Substitution
```
Pattern: (`.*?`|\$\(.*?\))
Action: Block
Severity: High
```

### 6. SSRF Prevention

#### Rule 6.1: Detect Internal IPs
```
Pattern: (127\.0\.0\.1|localhost|0\.0\.0\.0|10\.|172\.16\.|192\.168\.)
Action: Block
Severity: High
```

#### Rule 6.2: Validate URLs
```
Check: URL scheme is http or https
Action: Block otherwise
Severity: Medium
```

---

## Rate Limiting

### Global Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication | 5 requests | 1 minute |
| API (authenticated) | 100 requests | 1 minute |
| API (public) | 50 requests | 1 minute |
| File upload | 10 requests | 1 minute |
| Search | 30 requests | 1 minute |

### IP-based Rate Limiting

| IP Type | Limit | Window |
|---------|-------|--------|
| Trusted IP | 200 requests | 1 minute |
| Normal IP | 100 requests | 1 minute |
| Suspicious IP | 50 requests | 1 minute |
| Blocked IP | 0 requests | Permanent |

### User-based Rate Limiting

| User Type | Limit | Window |
|-----------|-------|--------|
| Admin | 500 requests | 1 minute |
| Premium | 200 requests | 1 minute |
| Regular | 100 requests | 1 minute |
| New User | 50 requests | 1 minute |

---

## IP Blocking

### Automatic Blocking Criteria

| Violation | Block Duration |
|-----------|----------------|
| SQL Injection attempt | 24 hours |
| XSS attempt | 24 hours |
| Path traversal attempt | 24 hours |
| Rate limit exceeded (3 times) | 1 hour |
| Multiple violations | Permanent |

### Whitelist

| IP Range | Reason |
|----------|--------|
| Internal office IPs | Development team |
| CDN IPs | Cloudflare/AWS |
| Monitoring IPs | Uptime monitoring |

---

## Request Validation

### Required Headers

| Header | Required For | Validation |
|--------|--------------|------------|
| Content-Type | POST/PUT/PATCH | application/json |
| Authorization | Protected routes | Bearer token |
| X-CSRF-Token | State-changing | Valid token |
| Origin | CORS | Matches domain |

### Request Size Limits

| Content Type | Max Size |
|--------------|----------|
| JSON | 1 MB |
| Form Data | 10 MB |
| File Upload | 50 MB |

---

## Response Headers

### Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| X-Frame-Options | DENY | Prevent clickjacking |
| X-XSS-Protection | 1; mode=block | XSS filter |
| Strict-Transport-Security | max-age=31536000 | Force HTTPS |
| Content-Security-Policy | (see below) | Prevent XSS |
| Referrer-Policy | strict-origin-when-cross-origin | Control referrer |
| Permissions-Policy | (see below) | Control browser features |

### Content Security Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' https:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

### Permissions Policy

```
geolocation=(), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()
```

---

## Logging

### Logged Events

| Event | Log Level | Details |
|-------|-----------|---------|
| WAF block | WARN | IP, rule, request path |
| Rate limit exceeded | WARN | IP, endpoint |
| IP blocked | ERROR | IP, reason, duration |
| Authentication failure | WARN | IP, username |
| SQL injection attempt | CRITICAL | IP, payload |
| XSS attempt | CRITICAL | IP, payload |

### Log Format

```json
{
  "timestamp": "YYYY-MM-DDTHH:mm:ssZ",
  "level": "WARN",
  "event": "waf_block",
  "ip": "192.168.1.1",
  "rule": "SQL_INJECTION_1",
  "path": "/api/v1/users",
  "method": "POST",
  "userAgent": "Mozilla/5.0...",
  "payload": "..."
}
```

---

## Monitoring

### Metrics to Track

| Metric | Alert Threshold |
|--------|-----------------|
| WAF blocks per minute | > 10 |
| Rate limit hits per minute | > 50 |
| IP blocks per hour | > 5 |
| Authentication failures per minute | > 20 |
| SQL injection attempts per hour | > 1 |
| XSS attempts per hour | > 1 |

### Dashboards

1. **WAF Overview**: Blocks, rate limits, IP blocks
2. **Threat Map**: Geographic distribution of attacks
3. **Top Attackers**: IPs with most violations
4. **Rule Effectiveness**: Blocks per rule

---

## Incident Response

### Response Levels

| Level | Criteria | Action |
|-------|----------|--------|
| Low | Single WAF block | Log and monitor |
| Medium | Multiple blocks from same IP | Temporary block |
| High | Attack pattern detected | Permanent block, notify team |
| Critical | Active exploitation | Block IP, disable endpoint, notify team |

### Response Procedure

1. **Detect**: WAF logs show attack
2. **Analyze**: Determine attack type and severity
3. **Block**: Apply IP block or rule update
4. **Notify**: Alert security team
5. **Investigate**: Review logs, find source
6. **Remediate**: Fix vulnerability if applicable
7. **Document**: Record incident and response

---

## Testing

### WAF Testing Checklist

- [ ] SQL injection attempts blocked
- [ ] XSS attempts blocked
- [ ] CSRF tokens validated
- [ ] Path traversal blocked
- [ ] Rate limits enforced
- [ ] IP blocking works
- [ ] Security headers present
- [ ] CORS configured correctly

### Penetration Testing

- Regular penetration tests
- Automated vulnerability scanning
- Manual testing of critical paths
- Review of WAF logs

---

*This document defines WAF rules for the Hakawi platform.*
