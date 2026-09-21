# WAF Documentation
## Hakawi Security Architecture

This document defines the Web Application Firewall (WAF) implementation for Hakawi, including rules, request inspection, rate limiting, IP blocking, logging, and operational controls.

---

## WAF Architecture

### Overview
The WAF operates as a multi-layer security gateway that inspects all incoming HTTP requests before they reach the application. It provides protection against common web attacks, implements rate limiting, and manages IP blocking.

### Layers
1. **Rate Limiting Layer** - Prevents abuse and DoS attacks
2. **Threat Detection Layer** - Identifies malicious patterns
3. **IP Blocking Layer** - Blocks known bad actors
4. **Logging Layer** - Records security events

---

## Rate Limiting

### Configuration
```typescript
{
  enabled: true,
  windowMs: 60_000, // 1 minute
  maxRequests: 100, // per window
  keyGenerator: 'ip', // or 'user'
  skipSuccessfulRequests: false,
  skipFailedRequests: false
}
```

### Implementation
- **Algorithm:** Token bucket with sliding window
- **Storage:** Valkey (with in-memory fallback)
- **Granularity:** Per-IP and per-user
- **Fail Mode:** Fail-open (allow request if storage unavailable)

### Rate Limit Rules
| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Auth endpoints | 10 requests | 1 minute |
| API endpoints | 100 requests | 1 minute |
| Upload endpoints | 5 requests | 1 minute |
| Search endpoints | 50 requests | 1 minute |

### Headers
- `X-RateLimit-Limit` - Maximum requests
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Reset timestamp
- `Retry-After` - Seconds until retry (when limited)

---

## Threat Detection

### SQL Injection
**Patterns Detected:**
- `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`
- `UNION SELECT`
- `OR 1=1`, `AND 1=1`
- `--`, `#`, `/* */` comments
- `EXEC`, `EXECUTE`, `EVAL`
- `INTO OUTFILE`, `INTO DUMPFILE`
- `SLEEP()`, `BENCHMARK()`
- `LOAD_FILE()`, `LOAD DATA INFILE`

**Action:** Block request, log violation, increment counter

### XSS (Cross-Site Scripting)
**Patterns Detected:**
- `<script>` tags
- `javascript:` protocol
- Event handlers: `onload`, `onerror`, `onclick`
- `<iframe>`, `<object>`, `<embed>`
- `eval()`, `alert()`, `confirm()`, `prompt()`
- `<svg onload>`
- `data:text/html`

**Action:** Block request, sanitize input, log violation

### Path Traversal
**Patterns Detected:**
- `../`, `..\`
- `/etc/passwd`, `/etc/shadow`
- `%2e%2e%2f`
- `UNC` paths
- `web.config`, `.htaccess`

**Action:** Block request, log violation

### Command Injection
**Patterns Detected:**
- `|`, `;`, `&`, `` ` ``, `$()`
- `rm -rf`, `del /`
- `curl |`, `wget |`
- `nc -e`, `netcat -e`
- `bash -i`

**Action:** Block request, log violation

### Bot Detection
**Patterns Detected:**
- Known scanner user agents: sqlmap, nikto, nmap, metasploit, burp
- Bot signatures: python-requests, curl, wget, httpclient, scrapy

**Action:** Block request, log violation

---

## IP Blocking

### Temporary Blocks
- **Duration:** Configurable (default: 1 hour)
- **Trigger:** WAF violation or rate limit exceeded
- **Auto-unblock:** Yes, after duration expires
- **Storage:** Valkey with TTL

### Permanent Blocks
- **Duration:** Permanent until manually unblocked
- **Trigger:** Severe violations, repeated offenses
- **Auto-unblock:** No
- **Storage:** Valkey (no TTL)

### Block Management
```typescript
// Block IP
await ipBlocker.block(ip, durationSeconds, reason);

// Unblock IP
await ipBlocker.unblock(ip);

// Check if blocked
const isBlocked = await ipBlocker.isBlocked(ip);

// Get all blocked IPs
const blockedIPs = await ipBlocker.getBlockedIPs();
```

---

## Request Inspection

### Inspected Elements
- **Headers:** User-Agent, Referer, Content-Type, X-Forwarded-For
- **Query Parameters:** All query string values
- **Request Body:** POST/PUT/PATCH body content
- **URL Path:** Request path
- **HTTP Method:** Allowed methods only

### Inspection Order
1. IP blocking check
2. Rate limiting check
3. Method validation
4. Content-Type validation
5. Size limit check
6. Threat pattern matching
7. SQL injection detection
8. XSS detection
9. Path traversal detection
10. Command injection detection

---

## Logging

### Log Levels
- **INFO:** Normal requests
- **WARN:** Suspicious activity, rate limits
- **ERROR:** Blocked requests, violations

### Log Format
```json
{
  "timestamp": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "level": "warn",
  "message": "WAF violation detected",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "path": "/api/users",
  "method": "POST",
  "violationType": "SQL_INJECTION",
  "details": "Detected SQL injection pattern",
  "action": "blocked",
  "correlationId": "abc123"
}
```

### Correlation IDs
- Generated per request
- Passed through all layers
- Used for tracing and debugging

---

## Security Headers

### Applied Headers
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

## Configuration

### Environment Variables
```bash
WAF_ENABLED=true
WAF_LOG_VIOLATIONS=true
WAF_BLOCK_ON_VIOLATION=true
WAF_RATE_LIMIT_ENABLED=true
WAF_RATE_LIMIT_REQUESTS=100
WAF_RATE_LIMIT_WINDOW=60
WAF_ADMIN_EMAIL=admin@hakawi.com
WAF_STRICT_REFERRER=false
WAF_FINGERPRINT_PROTECTION=false
WAF_BLOCKED_COUNTRIES=US,CN,RU
WAF_ALLOWED_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD
WAF_MAX_REQUEST_SIZE=10485760
```

---

## Monitoring

### Metrics
- Total requests
- Blocked requests
- Rate limited requests
- Violations by type
- Blocked IPs count
- Active blocks count

### Alerts
- High block rate (>10% of requests)
- Rate limit spikes
- New threat patterns
- WAF errors

### Dashboards
- Real-time request rate
- Violation trends
- Top blocked IPs
- Threat type distribution

---

## Operations

### Viewing Blocks
```bash
# List blocked IPs
GET /admin/waf/blocked-ips

# Unblock IP
POST /admin/waf/unblock-ip
{
  "ip": "192.168.1.1"
}
```

### Clearing Counters
```bash
# Clear rate limit counters
POST /admin/waf/clear-counters

# Clear all blocks
POST /admin/waf/clear-blocks
```

---

*This document defines the WAF implementation for Hakawi.*
