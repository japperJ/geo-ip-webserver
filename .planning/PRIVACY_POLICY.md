# Privacy Policy

**Last Updated:** February 14, 2026

## 1. Data Collection

We collect the following data for access control and audit purposes:

### Personal Data Collected
- **IP Address** (anonymized - last octet removed)
- **GPS Coordinates** (latitude, longitude, accuracy)
- **User Agent** (browser and device information)
- **Cookies** (authentication refresh tokens only)

### Purpose of Collection
- Access control and verification
- Audit logs and security monitoring
- Geographic geofencing enforcement

## 2. Legal Basis (GDPR Article 6)

We process your data based on:
- **Explicit Consent** (GPS coordinates) - GDPR Article 6(1)(a)
- **Legitimate Interest** (IP-based access control) - GDPR Article 6(1)(f)

## 3. Data Retention

- **Access Logs:** 90 days, then automatically deleted
- **Refresh Tokens:** 7 days or until revoked
- **User Accounts:** Until user requests deletion
- **Screenshots:** 90 days (for blocked access attempts)

## 4. Your Rights Under GDPR

You have the right to:

### Right to Access (Article 15)
- Request a copy of all your personal data
- Endpoint: `GET /api/user/data-export`

### Right to Erasure (Article 17)
- Request deletion of your account and all associated data
- Endpoint: `DELETE /api/user/data`

### Right to Withdraw Consent (Article 7)
- Withdraw GPS consent at any time
- Note: Site may become inaccessible if GPS is required

### Right to Data Portability (Article 20)
- Export your data in JSON format
- Available via data export endpoint

## 5. Third-Party Data Processors

We use the following processors:

### MaxMind GeoIP
- **Purpose:** IP geolocation
- **Data Shared:** IP addresses (processed in-memory, not stored)
- **Privacy Policy:** https://www.maxmind.com/en/privacy-policy

### AWS S3 (or MinIO)
- **Purpose:** Screenshot storage
- **Data Shared:** Screenshots of blocked access attempts
- **Location:** US East (or on-premises)
- **Safeguards:** Standard Contractual Clauses (SCCs) for EU-US transfers

## 6. Data Security

We implement:
- HTTPS/TLS encryption for data in transit
- Parameterized SQL queries (SQL injection prevention)
- IP anonymization before storage
- Access control based on roles (RBAC)

## 7. Cookies

We use **strictly necessary cookies** only:
- Refresh token (HttpOnly, Secure, SameSite=Strict)
- Session ID for consent tracking

No third-party analytics or advertising cookies are used.

## 8. GPS Consent Flow

Before collecting GPS coordinates:
1. We display a consent modal explaining data collection
2. You must explicitly check a consent box
3. Consent is recorded with timestamp and IP address
4. You can withdraw consent at any time

## 9. Data Breach Notification

In case of a data breach:
- We will notify affected users within 72 hours
- We will notify relevant supervisory authorities (GDPR Article 33)

## 10. Contact Information

**Data Controller:** [Your Organization Name]  
**Email:** privacy@example.com  
**Address:** [Your Address]

**Data Protection Officer (DPO):** [Name]  
**Email:** dpo@example.com

## 11. Supervisory Authority

You have the right to lodge a complaint with your local data protection authority:
- EU: https://edpb.europa.eu/about-edpb/board/members_en
- UK: ICO (Information Commissioner's Office)

## 12. Changes to This Policy

We will notify users of material changes via email or site banner.

---

**GDPR Compliance Version:** 1.0  
**Effective Date:** February 14, 2026
