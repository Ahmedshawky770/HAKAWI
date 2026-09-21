# Compliance Notes
## Hakawi Security Architecture

This document defines compliance requirements, data retention policies, privacy controls, and audit requirements for the Hakawi platform.

---

## Regulatory Compliance

### GDPR (General Data Protection Regulation)
**Applicability:** EU users

#### Requirements
1. **Lawful Basis for Processing**
   - Consent for marketing communications
   - Contract performance for service delivery
   - Legal obligation for tax records

2. **Data Subject Rights**
   - Right to access (export user data)
   - Right to rectification (update profile)
   - Right to erasure (delete account)
   - Right to restrict processing
   - Right to data portability
   - Right to object

3. **Implementation**
   ```typescript
   // Data export
   GET /users/:id/data-export
   
   // Account deletion
   DELETE /users/:id
   
   // Consent management
   POST /users/:id/consent
   ```

### CCPA (California Consumer Privacy Act)
**Applicability:** California residents

#### Requirements
1. **Right to Know** - What data is collected
2. **Right to Delete** - Request data deletion
3. **Right to Opt-Out** - Opt-out of data sale
4. **Non-Discrimination** - Same service regardless of privacy choices

### Data Protection Laws (Other Jurisdictions)
- **Brazil (LGPD)** - Similar to GDPR
- **Canada (PIPEDA)** - Consent-based
- **UAE (PDPL)** - Local data residency requirements

---

## Data Retention

### Retention Periods

| Data Type | Retention Period | Reason |
|-----------|------------------|--------|
| User accounts | 7 years after deletion | Legal requirement |
| Transaction records | 7 years | Tax and legal requirements |
| Audit logs | 1 year | Security and compliance |
| Access logs | 90 days | Security monitoring |
| Soft-deleted content | 30 days | Recovery window |
| Support tickets | 3 years | Customer service |
| Marketing data | Until consent withdrawn | Marketing |

### Retention Policies

#### Automatic Deletion
```typescript
// Daily job to purge expired data
async function purgeExpiredData() {
  // Delete soft-deleted users older than 30 days
  await userRepository.purgeSoftDeleted(30);
  
  // Delete expired sessions
  await sessionRepository.purgeExpired();
  
  // Delete old access logs
  await logRepository.purgeOld(90);
}
```

#### Archival
- Archive old transactions to cold storage
- Compress logs older than 1 year
- Move inactive user data to archive

---

## Privacy Controls

### Data Minimization
- Collect only necessary data
- Don't store sensitive data unnecessarily
- Regular data audits

### Data Masking
```typescript
// Email masking in logs
maskEmail('john.doe@example.com') => 'j***.d***@example.com'

// Phone masking
maskPhone('+966501234567') => '+966*******67'

// ID masking
maskId('usr_123456789') => 'usr_***'
```

### Encryption

#### At Rest
- **Database:** AES-256 encryption
- **Sensitive fields:** Encrypted columns (email, phone)
- **Backups:** Encrypted backups

#### In Transit
- **TLS 1.3** for all connections
- **Certificate pinning** for mobile apps
- **HSTS** headers

### Access Controls
- Role-based access to user data
- Audit trail for data access
- Principle of least privilege
- Regular access reviews

---

## Audit Requirements

### What to Audit
1. **Authentication Events**
   - Login attempts (success/failure)
   - Logout events
   - Password changes
   - MFA enrollment/changes

2. **Authorization Events**
   - Permission checks
   - Access grants/denials
   - Admin actions
   - Role changes

3. **Data Access**
   - User data exports
   - Bulk data access
   - Sensitive data access

4. **Data Modifications**
   - User profile changes
   - Content modifications
   - Financial transactions

5. **System Events**
   - Configuration changes
   - Deployment events
   - Security incidents

### Audit Log Format
```json
{
  "timestamp": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "eventType": "user.login",
  "userId": "usr_123",
  "action": "login",
  "resource": "auth",
  "result": "success",
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "correlationId": "abc123",
  "metadata": {
    "method": "oauth",
    "provider": "google"
  }
}
```

### Audit Log Storage
- **Primary:** Structured logs (Winston)
- **Secondary:** Database table for critical events
- **Retention:** 1 year
- **Immutable:** Append-only, no modifications

---

## Privacy by Design

### Principles
1. **Data Minimization** - Collect only what's needed
2. **Purpose Limitation** - Use data only for stated purpose
3. **Storage Limitation** - Keep data only as long as needed
4. **Accuracy** - Keep data accurate and up-to-date
5. **Security** - Protect data appropriately
6. **Transparency** - Clear privacy policies
7. **Accountability** - Document compliance

### Implementation
- Privacy policy clearly stated
- Cookie consent banners
- Data processing agreements
- Regular privacy audits
- DPIA (Data Protection Impact Assessment) for new features

---

## Incident Response

### Data Breach
1. **Detection** - Monitor for unauthorized access
2. **Containment** - Isolate affected systems
3. **Assessment** - Determine scope and impact
4. **Notification** - Notify affected users within 72 hours
5. **Remediation** - Fix vulnerabilities
6. **Recovery** - Restore systems
7. **Lessons Learned** - Document and improve

### Notification Requirements
- **Users:** Notify if personal data compromised
- **Regulators:** Notify DPA within 72 hours
- **Media:** Notify if high risk to rights and freedoms

---

## Compliance Checklist

### Technical Measures
- [ ] Encryption at rest (AES-256)
- [ ] Encryption in transit (TLS 1.3)
- [ ] Access controls (RBAC)
- [ ] Audit logging
- [ ] Data retention policies
- [ ] Backup encryption
- [ ] Secure deletion

### Organizational Measures
- [ ] Privacy policy
- [ ] Terms of service
- [ ] Data processing agreements
- [ ] Staff training
- [ ] Incident response plan
- [ ] Regular audits
- [ ] DPO (Data Protection Officer) appointed

### User Rights
- [ ] Data export functionality
- [ ] Account deletion functionality
- [ ] Consent management
- [ ] Privacy settings
- [ ] Right to object

---

*This document defines compliance requirements for Hakawi.*
