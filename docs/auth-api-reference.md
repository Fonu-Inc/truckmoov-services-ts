# Auth Service — API Reference

- OpenAPI: `3.0.0` · Version: `0.1.0`
- Source: `https://dev-api.truckmoov.com/docs/fleet-json`
- Total endpoints: **166**

## Index

- **Auth** (166)
  - `GET /auth/health` — 
  - `GET /auth/system/health` — Get system-wide service health status
  - `GET /auth/test-sentry` — Trigger a test Sentry error
  - `POST /auth/media/upload` — Upload media
  - `POST /auth/login` — 
  - `POST /auth/onboarding/applications` — Start an onboarding application
  - `GET /auth/onboarding/applications/{applicationId}` — Get an application
  - `PATCH /auth/onboarding/applications/{applicationId}` — Update application details
  - `POST /auth/onboarding/applications/{applicationId}/documents` — Upload a supporting document
  - `DELETE /auth/onboarding/applications/{applicationId}/documents/{documentId}` — Remove a supporting document
  - `POST /auth/onboarding/applications/{applicationId}/verify/email/send` — Send the email verification code
  - `POST /auth/onboarding/applications/{applicationId}/verify/email` — Verify the email code
  - `POST /auth/onboarding/applications/{applicationId}/verify/phone/send` — Send the phone verification code
  - `POST /auth/onboarding/applications/{applicationId}/verify/phone` — Verify the phone code
  - `POST /auth/onboarding/applications/{applicationId}/submit` — Submit the application for review
  - `GET /auth/onboarding/applications/{applicationId}/status` — Get application progress
  - `GET /auth/system/onboarding/applications` — List onboarding applications
  - `GET /auth/system/onboarding/applications/{applicationId}` — Get an application for review
  - `PATCH /auth/system/onboarding/applications/{applicationId}/documents/{documentId}/approve` — Approve one document
  - `PATCH /auth/system/onboarding/applications/{applicationId}/documents/{documentId}/reject` — Reject one document
  - `POST /auth/system/onboarding/applications/{applicationId}/approve` — Approve an application
  - `POST /auth/system/onboarding/applications/{applicationId}/reject` — Reject an application
  - `POST /auth/system/onboarding/applications/{applicationId}/request-changes` — Send an application back for correction
  - `POST /auth/system/onboarding/applications/{applicationId}/setup-link/resend` — Resend the account setup link
  - `POST /auth/system/login` — 
  - `POST /auth/refresh` — 
  - `PATCH /auth/system/change-password` — Change system account password
  - `GET /auth/system/settings` — Get system settings
  - `PATCH /auth/system/settings` — Update system settings
  - `GET /auth/me` — 
  - `POST /auth/invite` — 
  - `GET /auth/system/admins` — List system admins
  - `POST /auth/system/admins` — Create system admin
  - `GET /auth/system/tenants` — List system tenants
  - `POST /auth/system/tenants` — Create tenant onboarding
  - `GET /auth/system/devices/summary` — Get system device summary
  - `GET /auth/system/devices` — List system device inventory
  - `GET /auth/system/devices/export` — Export system device inventory
  - `GET /auth/system/devices/catalog` — List system device catalog
  - `POST /auth/system/devices/catalog` — Create system device catalog model
  - `GET /auth/system/devices/catalog/export` — Export device catalog as CSV
  - `PATCH /auth/system/devices/catalog/{deviceModelId}` — Update system device catalog model
  - `DELETE /auth/system/devices/catalog/{deviceModelId}` — Delete system device catalog model
  - `GET /auth/system/devices/{deviceId}` — Get system device detail
  - `GET /auth/system/reference-data/device-catalog` — Get system device catalog reference data
  - `PATCH /auth/system/admins/{userId}/status` — Update system admin account status
  - `DELETE /auth/system/admins/{userId}` — Delete system admin
  - `GET /auth/system/admin-invites` — List system admin invites
  - `POST /auth/system/admin-invites` — Create system admin invite
  - `POST /auth/system/admin-invites/{inviteId}/resend` — Resend system admin invite
  - `DELETE /auth/system/admin-invites/{inviteId}` — Cancel system admin invite
  - `POST /auth/organization/invites/resend` — Resend pending invite
  - `GET /auth/invite/validate` — 
  - `POST /auth/register/invited` — 
  - `POST /auth/forgot-password` — 
  - `POST /auth/verify-reset` — 
  - `POST /auth/verify-email` — 
  - `POST /auth/complete-profile` — 
  - `POST /auth/reset-password` — 
  - `POST /auth/change-role` — 
  - `POST /auth/logout` — 
  - `GET /auth/profile` — Get current user profile
  - `PATCH /auth/profile` — Update current user profile
  - `GET /auth/preferences/notifications` — Get notification preferences
  - `PATCH /auth/preferences/notifications` — Update notification preferences
  - `GET /auth/preferences/dispatch` — Get dispatcher schedule and timezone preferences
  - `PATCH /auth/preferences/dispatch` — Update dispatcher schedule and timezone preferences
  - `GET /auth/organization/users` — List organization users
  - `PATCH /auth/organization/users/{userId}` — Update organization user profile
  - `DELETE /auth/organization/users/{userId}` — Remove organization user
  - `PATCH /auth/organization/users/{userId}/status` — Update organization user account status
  - `GET /auth/organization/settings` — Get organization settings
  - `PATCH /auth/organization/settings` — Update organization settings
  - `GET /auth/activity-log` — Get tenant activity log
  - `GET /auth/system/activity-log` — Get system activity log
  - `GET /auth/system/dashboard` — Get system dashboard
  - `GET /auth/system/subscription-plans` — Get system subscription plans
  - `GET /auth/system/feature-flags` — List system feature flags
  - `PATCH /auth/system/feature-flags/{featureKey}` — Update system feature flag
  - `GET /auth/system/tenants/summary` — Get system tenants summary
  - `GET /auth/system/tenants/export` — Export system tenants
  - `GET /auth/system/reference-data/tenant-onboarding` — Get tenant onboarding reference data
  - `GET /auth/system/tenants/{tenantId}` — Get system tenant detail
  - `PATCH /auth/system/tenants/{tenantId}` — Update system tenant
  - `DELETE /auth/system/tenants/{tenantId}` — Delete system tenant
  - `POST /auth/system/tenants/{tenantId}/invite/resend` — Resend tenant onboarding invite
  - `PATCH /auth/system/tenants/{tenantId}/status` — Update system tenant status
  - `GET /auth/system/sims/summary` — Get system SIM summary
  - `GET /auth/system/sims` — List system SIM inventory
  - `GET /auth/system/sims/export` — Export system SIM inventory
  - `GET /auth/system/sims/requests` — List SIM provisioning requests
  - `GET /auth/system/sims/requests/summary` — SIM approval queue summary
  - `GET /auth/system/sims/requests/export` — Export SIM provisioning requests
  - `POST /auth/system/sims/requests/{requestId}/approve` — Approve SIM provisioning request
  - `POST /auth/system/sims/requests/{requestId}/reject` — Reject SIM provisioning request
  - `GET /auth/system/sims/batches` — List SIM activation batches
  - `GET /auth/system/sims/batches/summary` — SIM activation batches summary
  - `GET /auth/system/sims/batches/export` — Export SIM activation batches
  - `GET /auth/system/sims/batches/{batchId}` — Get SIM activation batch detail
  - `POST /auth/system/sims/batches/{batchId}/retry` — Retry SIM activation batch
  - `GET /auth/system/sims/{simId}` — Get SIM detail
  - `PATCH /auth/system/sims/{simId}` — Update SIM
  - `PATCH /auth/system/sims/{simId}/reassign` — Reassign SIM
  - `PATCH /auth/system/sims/{simId}/suspend` — Suspend or reactivate SIM
  - `GET /auth/system/support/dashboard` — Support dashboard stats
  - `GET /auth/system/support/escalated` — List escalated tickets grouped by escalation party
  - `GET /auth/system/support/device-setup` — List device setup requests
  - `GET /auth/system/support/device-setup/export` — Export device setup requests as CSV
  - `GET /auth/system/support/device-setup/{requestId}` — Get device setup request detail
  - `PATCH /auth/system/support/device-setup/{requestId}/assign` — Assign device setup request to current actor
  - `PATCH /auth/system/support/device-setup/{requestId}/reject` — Reject device setup request with a reason
  - `GET /auth/system/support/tickets/summary` — Get support ticket counts summary
  - `GET /auth/system/support/tickets/export` — Export support tickets as CSV
  - `GET /auth/system/support/tickets` — List all support tickets
  - `GET /auth/system/support/tickets/{ticketId}` — Get support ticket detail
  - `PATCH /auth/system/support/tickets/{ticketId}/status` — Update ticket status
  - `PATCH /auth/system/support/tickets/{ticketId}/escalate` — Escalate support ticket
  - `GET /auth/system/support/tickets/{ticketId}/messages` — List ticket messages (includes internal notes)
  - `POST /auth/system/support/tickets/{ticketId}/messages` — Send message or internal note on ticket
  - `GET /auth/onboarding/plans` — List subscription plans
  - `GET /auth/onboarding/exchange-rate` — Current NGN/USD exchange rate
  - `POST /auth/onboarding/payment/intent` — Create payment intent
  - `GET /auth/onboarding/payment/events` — Subscribe to payment confirmation events (SSE)
  - `POST /auth/onboarding/payment/webhook` — Paystack payment webhook (no auth)
  - `POST /auth/onboarding/enterprise/enquiry` — Submit enterprise plan enquiry
  - `GET /auth/onboarding/subscription/caps` — Get device & SIM caps for active plan
  - `GET /auth/onboarding/status` — Get onboarding status
  - `GET /auth/onboarding/business-info` — Get business info
  - `PUT /auth/onboarding/business-info` — Save/update business info
  - `GET /auth/onboarding/kyc/documents` — List KYC documents
  - `POST /auth/onboarding/kyc/documents` — Upload KYC document
  - `DELETE /auth/onboarding/kyc/documents/{docId}` — Delete KYC document
  - `POST /auth/onboarding/devices/provision` — Submit device provisioning request
  - `POST /auth/onboarding/sims/register` — Register individual SIMs
  - `POST /auth/onboarding/sims/import` — Bulk CSV SIM import
  - `POST /auth/onboarding/sims/provision` — Submit SIM provisioning request
  - `PUT /auth/onboarding/features` — Save feature toggle preferences
  - `POST /auth/onboarding/complete` — Mark onboarding as complete
  - `GET /auth/sims` — List tenant SIMs
  - `POST /auth/sims` — Register a SIM
  - `GET /auth/sims/export` — Export tenant SIMs
  - `GET /auth/sims/import/template` — Download SIM import CSV template
  - `POST /auth/sims/import` — Import SIMs from CSV
  - `GET /auth/sims/carriers` — List active carriers for tenants
  - `GET /auth/sims/data-bundles` — List bundle plans for tenants
  - `GET /auth/sims/requests` — List tenant SIM requests
  - `POST /auth/sims/requests` — Submit SIM provisioning request
  - `GET /auth/sims/requests/device-mapping/template` — Download device mapping CSV template
  - `POST /auth/sims/requests/device-mapping` — Upload device mapping CSV
  - `GET /auth/sims/requests/{id}` — Get tenant SIM request detail
  - `GET /auth/sims/{id}` — Get SIM detail
  - `PATCH /auth/sims/{id}` — Update SIM
  - `DELETE /auth/sims/{id}` — Delete SIM
  - `POST /auth/sims/{id}/suspend` — Suspend SIM
  - `POST /auth/sims/{id}/reactivate` — Reactivate SIM
  - `DELETE /auth/sims/{id}/device` — Unassign device from SIM
  - `POST /auth/system/carriers` — Create carrier (system admin)
  - `PATCH /auth/system/carriers/{id}` — Update carrier (system admin)
  - `POST /auth/system/bundle-catalog` — Create bundle plan (system admin)
  - `PATCH /auth/system/bundle-catalog/{id}` — Update bundle plan (system admin)
  - `DELETE /auth/system/bundle-catalog/{id}` — Delete bundle plan (system admin)
  - `GET /auth/data-bundles/summary` — Get data bundle dashboard summary
  - `GET /auth/data-bundles/wallet/balance` — Get wallet balance
  - `POST /auth/data-bundles/wallet/topup` — Top up wallet via mobile money (stub)
  - `GET /auth/data-bundles/spending-limit` — Get spending limit settings
  - `POST /auth/data-bundles/spending-limit` — Save spending limit settings
  - `DELETE /auth/data-bundles/spending-limit` — Disable spending limit
  - `GET /auth/data-bundles/auto-topup` — Get auto top-up settings
  - `POST /auth/data-bundles/auto-topup` — Save auto top-up settings
  - `DELETE /auth/data-bundles/auto-topup` — Disable auto top-up
  - `GET /auth/data-bundles/allocations` — List bundle allocations
  - `POST /auth/data-bundles/allocations` — Allocate bundle to SIMs
  - `GET /auth/data-bundles/allocations/export` — Export bundle allocations
  - `GET /auth/data-bundles/allocations/sims` — List SIMs available for bundle allocation
  - `GET /auth/data-bundles/allocations/{id}` — Get bundle allocation detail
  - `GET /auth/data-bundles/transactions` — List bundle transactions
  - `GET /auth/data-bundles/transactions/export` — Export bundle transactions
  - `GET /auth/data-bundles/analytics/spend-trend` — Get spend trend analytics
  - `GET /auth/data-bundles/analytics/spend-breakdown` — Get spend breakdown analytics
  - `GET /auth/data-bundles/analytics/carrier-distribution` — Get carrier distribution analytics
  - `GET /auth/data-bundles/analytics/subscription-usage` — Get subscription usage analytics
  - `GET /auth/data-bundles/rates` — List bundle rates
  - `GET /auth/data-bundles/rates/export` — Export bundle rates
  - `GET /auth/data-bundles/carriers` — List carriers for data bundles

## Auth

### `GET /auth/health`

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      service?: string
      persistenceBackend?: string
      database?: string enum("up" | "n/a")
    }
}
```

---

### `GET /auth/system/health`

**Get system-wide service health status**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      overall: string enum("healthy" | "degraded" | "down")
      services:
        [
          {
            name: string
            status: string enum("healthy" | "degraded" | "down")
            latencyMs: number | null
            uptime: number | null
          }
        ]
      generatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Not a system actor

---

### `GET /auth/test-sentry`

**Trigger a test Sentry error**

Throws an unhandled error so Sentry capture can be verified.

**Request body:** _none_

**Responses:**

- `200` — _(no body)_

---

### `POST /auth/media/upload`

**Upload media**

Uploads a media file to object storage and returns a link to it.

**Request body** (required):

```
{
  file: string <binary>
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      key: string
      url: string
      filename: string
      contentType: string
      size: number
    }
}
```
- `400` — Missing upload file

---

### `POST /auth/login`

Authenticate with email and password

**Request body** (required):

```
{
  email: string
  password: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      accessToken: string
      refreshToken: string
    }
}
```
- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      accessToken: string
      refreshToken: string
    }
}
```

---

### `POST /auth/system/login`

Authenticate a system account with email and password

**Request body** (required):

```
{
  email: string
  password: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      accessToken: string
      refreshToken: string
    }
}
```
- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      accessToken: string
      refreshToken: string
    }
}
```

---

### `POST /auth/refresh`

Exchange a refresh token for a new token pair

**Request body** (required):

```
{
  refreshToken: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      accessToken: string
      refreshToken: string
    }
}
```
- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      accessToken: string
      refreshToken: string
    }
}
```

---

### `PATCH /auth/system/change-password`

**Change system account password**

Allows a logged-in super admin or system admin to rotate their own password.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  currentPassword: string
  newPassword: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      accessToken: string
      refreshToken: string
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not a system account

---

### `GET /auth/system/settings`

**Get system settings**

Returns global platform settings for the system admin surface.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      platformName: string
      supportEmail: string
      defaults:
        {
          timezone: string
          language: string
        }
      features:
        {
          allowNewTenantRegistration: boolean
          maintenanceMode: boolean
          enableBetaFeatures: boolean
        }
      retention:
        {
          gpsDataRetentionDays: number
          logRetentionDays: number
          backupFrequency: string enum("hourly" | "daily" | "weekly")
        }
      updatedAt: string <date-time>
      updatedByUserId: string | null
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view system settings

---

### `PATCH /auth/system/settings`

**Update system settings**

Updates the global platform settings used by the system admin surface.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  platformName?: string
  supportEmail?: string
  defaults?:
    {
      timezone?: string
      language?: string
    }
  features?:
    {
      allowNewTenantRegistration?: boolean
      maintenanceMode?: boolean
      enableBetaFeatures?: boolean
    }
  retention?:
    {
      gpsDataRetentionDays?: number
      logRetentionDays?: number
      backupFrequency?: string enum("hourly" | "daily" | "weekly")
    }
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      platformName: string
      supportEmail: string
      defaults:
        {
          timezone: string
          language: string
        }
      features:
        {
          allowNewTenantRegistration: boolean
          maintenanceMode: boolean
          enableBetaFeatures: boolean
        }
      retention:
        {
          gpsDataRetentionDays: number
          logRetentionDays: number
          backupFrequency: string enum("hourly" | "daily" | "weekly")
        }
      updatedAt: string <date-time>
      updatedByUserId: string | null
    }
}
```
- `400` — Invalid system settings payload
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to update system settings

---

### `GET /auth/me`

Decode the bearer token and return the authenticated user's claims

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    object {}
}
```

---

### `POST /auth/invite`

Enterprise admin invites a user via email

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  email: string
  role: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
      email: string
      role: string
    }
}
```

---

### `GET /auth/system/admins`

**List system admins**

Returns all system admin accounts through the shared system admin endpoint surface.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      tenantId: string
      users:
        [
          {
            userId: string | null
            email: string
            tenantId: string
            role: string
            accountStatus: string enum("enabled" | "disabled") | null
            status: string enum("active" | "inactive" | "invited")
            lastActiveAt: string <date-time> | null
            profile:
              {
                fullName: string | null
                phoneNumber: string | null
                address: string | null
                profilePictureUrl: string | null
              }
            inviteStatus: string enum("accepted" | "invited")
            invitedAt?: string <date-time> | null
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view admin accounts

---

### `POST /auth/system/admins`

**Create system admin**

Allows the single super admin to create additional system admin accounts using the shared system admin endpoint surface.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  fullName: string
  email: string
  password: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
      user:
        {
          userId: string | null
          email: string
          tenantId: string
          role: string
          accountStatus: string enum("enabled" | "disabled") | null
          status: string enum("active" | "inactive" | "invited")
          lastActiveAt: string <date-time> | null
          profile:
            {
              fullName: string | null
              phoneNumber: string | null
              address: string | null
              profilePictureUrl: string | null
            }
          inviteStatus: string enum("accepted" | "invited")
          invitedAt?: string <date-time> | null
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to create admin accounts
- `409` — An account with this email already exists

---

### `GET /auth/system/tenants`

**List system tenants**

Returns tenant management rows for the super admin and system admin surface.

**Query params:**
  - `search` (string, optional)
  - `status` (string enum("active" | "pending" | "suspended" | "inactive"), optional)
  - `plan` (string enum("starter" | "professional" | "enterprise"), optional)
  - `organizationType` (string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator"), optional)
  - `kycStatus` (string enum("not_submitted" | "pending" | "under_review" | "verified" | "rejected"), optional)
  - `revenueFrom` (number, optional)
  - `revenueTo` (number, optional)
  - `lastActiveFrom` (string, optional)
  - `lastActiveTo` (string, optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      tenants:
        [
          {
            id: string
            name: string
            slug: string
            email: string
            phone: string | null
            address: string | null
            billingEmail: string | null
            plan: string enum("starter" | "professional" | "enterprise")
            planCode: string | null
            status: string enum("active" | "pending" | "suspended" | "inactive")
            organizationType: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator") | null
            organizationTypes: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator")[]
            vehicleCount: number
            driverCount: number
            deviceCount: number
            simCount: number
            monthlyRevenueNgn: number
            createdAt: string <date-time>
            lastActiveAt: string <date-time> | null
            features:
              {
                liveTracking: boolean
                messaging: boolean
                geofencing: boolean
                routeOptimization: boolean
                advancedAnalytics: boolean
                apiAccess: boolean
              }
            invitationStatus:
              {
                hasPendingInvitation: boolean
                invitationAccepted: boolean
              }
            businessInfo:
              {
                companyName: string
                registrationNumber: string | null
                taxId: string | null
                businessType: string | null
                industry: string | null
                addressLine1: string | null
                addressLine2: string | null
                city: string | null
                state: string | null
                postalCode: string | null
                country: string | null
                verificationStatus: string enum("not_submitted" | "pending" | "under_review" | "verified" | "rejected")
                verifiedAt: string <date-time> | null
                yearEstablished: number | null
              }
          }
        ]
      generatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view system tenants

---

### `POST /auth/system/tenants`

**Create tenant onboarding**

Allows a super admin or system admin to create a tenant onboarding record and send the bootstrap admin invite.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  company:
    {
      companyName: string
      contactName: string
      email: string
      phoneNumber?: string | null
      billingEmail?: string | null
      businessAddress?: string | null
      organizationType: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator")
    }
  subscription:
    {
      planCode: string
      billingCycle: string enum("monthly" | "yearly")
    }
  deviceProvisioning?:
    {
      provisionNow: boolean
      numberOfDevices?: number | null
      deviceManufacturer?: string | null
      deviceModel?: string | null
    }
  simAssignment?:
    {
      provisionNow: boolean
      numberOfSims?: number | null
      carrier?: string enum("MTN" | "Airtel" | "Glo" | "9mobile") | null
      dataPackage?: string enum("250MB/month" | "500MB/month" | "1GB/month" | "2GB/month") | null
    }
  features?:
    {
      liveTracking?: boolean
      messaging?: boolean
      geofencing?: boolean
      routeOptimization?: boolean
      advancedAnalytics?: boolean
      apiAccess?: boolean
    }
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      onboardingId: string
      tenantId: string
      status: string enum("pending_activation" | "managed")
      bootstrapRole: string
      company:
        {
          companyName: string
          email: string
          phoneNumber: string | null
          billingEmail: string | null
          businessAddress: string | null
          organizationType: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator")
        }
      subscription:
        {
          planCode: string
          billingCycle: string enum("monthly" | "yearly")
        }
      deviceProvisioning:
        {
          provisionNow: boolean
          numberOfDevices: number | null
          deviceManufacturer: string | null
          deviceModel: string | null
        }
      simAssignment:
        {
          provisionNow: boolean
          numberOfSims: number | null
          carrier: string enum("MTN" | "Airtel" | "Glo" | "9mobile") | null
          dataPackage: string enum("250MB/month" | "500MB/month" | "1GB/month" | "2GB/month") | null
        }
      features:
        {
          liveTracking: boolean
          messaging: boolean
          geofencing: boolean
          routeOptimization: boolean
          advancedAnalytics: boolean
          apiAccess: boolean
        }
      adminInviteEmail: string
      createdAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to create tenants
- `409` — A pending invite or account already exists for this email

---

### `GET /auth/system/devices/summary`

**Get system device summary**

Returns platform-wide device inventory and device catalog summary metrics for system admins.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      totalDevices: number
      registeredDevices: number
      configuredDevices: number
      verifiedActiveDevices: number
      pendingConfigDevices: number
      onlineNowDevices: number
      assignableDevices: number
      assignedDevices: number
      activeDevices: number
      faultyDevices: number
      totalCatalogModels: number
      supportedCatalogModels: number
      deprecatedCatalogModels: number
      blockedCatalogModels: number
      generatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view device summary data

---

### `GET /auth/system/devices`

**List system device inventory**

Returns the platform-wide read-only device inventory for system admins.

**Query params:**
  - `search` (string, optional)
  - `manufacturer` (string, optional)
  - `status` (string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned"), optional)
  - `lifecycleStatus` (string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned"), optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      devices:
        [
          {
            id: string
            imei: string
            manufacturer: string
            model: string
            tenantId: string
            tenantName: string
            lifecycleStatus: string
            operationalStatus: string
            signalStrength: number | null
            lastSeen: string <date-time> | null
            vehicleId: string | null
            assignedAt: string <date-time> | null
            createdAt: string <date-time>
            updatedAt: string <date-time>
          }
        ]
      generatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view device inventory

---

### `GET /auth/system/devices/export`

**Export system device inventory**

Exports the platform-wide read-only device inventory as a CSV file.

**Query params:**
  - `lifecycleStatus` (string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned"), optional)
  - `status` (string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned"), optional)
  - `manufacturer` (string, optional)
  - `search` (string, optional)

**Request body:** _none_

**Responses:**

- `200` — CSV export of the system device inventory
```
string <binary>
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to export device inventory

---

### `GET /auth/system/devices/catalog`

**List system device catalog**

Returns the global device manufacturer/model catalog used by system admins and tenant onboarding.

**Query params:**
  - `search` (string, optional)
  - `status` (string enum("supported" | "deprecated" | "blocked"), optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      models:
        [
          {
            id: string
            manufacturer: string
            model: string
            protocolType: string enum("TCP" | "HTTP" | "MQTT" | "UDP")
            defaultPort: number | null
            supportedFeatures: string enum("obd2" | "fuel" | "sos")[]
            status: string enum("supported" | "deprecated" | "blocked")
            configurationInstructions: string | null
            createdAt: string <date-time>
            updatedAt: string <date-time>
          }
        ]
      generatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view the device catalog

---

### `POST /auth/system/devices/catalog`

**Create system device catalog model**

Creates a manufacturer/model entry in the global device catalog used by system admins and tenant onboarding.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  manufacturer: string
  model: string
  protocolType: string enum("TCP" | "HTTP" | "MQTT" | "UDP")
  defaultPort?: number | null
  supportedFeatures: string enum("obd2" | "fuel" | "sos")[]
  status: string enum("supported" | "deprecated" | "blocked")
  configurationInstructions?: string | null
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      manufacturer: string
      model: string
      protocolType: string enum("TCP" | "HTTP" | "MQTT" | "UDP")
      defaultPort: number | null
      supportedFeatures: string enum("obd2" | "fuel" | "sos")[]
      status: string enum("supported" | "deprecated" | "blocked")
      configurationInstructions: string | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```
- `400` — Invalid request payload
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to create device catalog models
- `409` — A device model with the same manufacturer and model already exists

---

### `GET /auth/system/devices/catalog/export`

**Export device catalog as CSV**

**Query params:**
  - `status` (string enum("supported" | "deprecated" | "blocked"), optional)
  - `search` (string, optional)

**Request body:** _none_

**Responses:**

- `200` — CSV export
```
string <binary>
```
- `401` — Missing or invalid bearer token
- `403` — Not a system actor

---

### `PATCH /auth/system/devices/catalog/{deviceModelId}`

**Update system device catalog model**

Updates a manufacturer/model entry in the global device catalog.

**Path params:**
  - `deviceModelId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  manufacturer?: string
  model?: string
  protocolType?: string enum("TCP" | "HTTP" | "MQTT" | "UDP")
  defaultPort?: number | null
  supportedFeatures?: string enum("obd2" | "fuel" | "sos")[]
  status?: string enum("supported" | "deprecated" | "blocked")
  configurationInstructions?: string | null
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      manufacturer: string
      model: string
      protocolType: string enum("TCP" | "HTTP" | "MQTT" | "UDP")
      defaultPort: number | null
      supportedFeatures: string enum("obd2" | "fuel" | "sos")[]
      status: string enum("supported" | "deprecated" | "blocked")
      configurationInstructions: string | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```
- `400` — Invalid request payload
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to update device catalog models
- `404` — Device model not found
- `409` — A device model with the same manufacturer and model already exists

---

### `DELETE /auth/system/devices/catalog/{deviceModelId}`

**Delete system device catalog model**

Deletes a manufacturer/model entry from the global device catalog.

**Path params:**
  - `deviceModelId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      deleted: boolean
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to delete device catalog models
- `404` — Device model not found

---

### `GET /auth/system/devices/{deviceId}`

**Get system device detail**

Returns the full detail record for a single device, including battery, firmware, and protocol.

**Path params:**
  - `deviceId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      imei: string
      manufacturer: string
      model: string
      firmwareVersion: string | null
      tenantId: string
      tenantName: string
      lifecycleStatus: string
      operationalStatus: string
      protocol: string | null
      signalStrength: number | null
      batteryLevel: number | null
      lastSeen: string <date-time> | null
      vehicleId: string | null
      assignedAt: string <date-time> | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view device inventory
- `404` — Device not found

---

### `GET /auth/system/reference-data/device-catalog`

**Get system device catalog reference data**

Returns protocol types, catalog statuses, and supported feature options for the device catalog admin flow.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      protocolTypes: string enum("TCP" | "HTTP" | "MQTT" | "UDP")[]
      statuses: string enum("supported" | "deprecated" | "blocked")[]
      featureOptions:
        [
          {
            key: string
            label: string
            description: string
          }
        ]
      generatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view device catalog reference data

---

### `PATCH /auth/system/admins/{userId}/status`

**Update system admin account status**

Allows the super admin to suspend or reactivate another system admin account through the shared system admin endpoint surface.

**Path params:**
  - `userId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  accountStatus: string enum("enabled" | "disabled")
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
      user:
        {
          userId: string | null
          email: string
          tenantId: string
          role: string
          accountStatus: string enum("enabled" | "disabled") | null
          status: string enum("active" | "inactive" | "invited")
          lastActiveAt: string <date-time> | null
          profile:
            {
              fullName: string | null
              phoneNumber: string | null
              address: string | null
              profilePictureUrl: string | null
            }
          inviteStatus: string enum("accepted" | "invited")
          invitedAt?: string <date-time> | null
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to change admin account status
- `404` — Admin account not found

---

### `DELETE /auth/system/admins/{userId}`

**Delete system admin**

Allows the super admin to permanently delete another system admin account through the shared system admin endpoint surface.

**Path params:**
  - `userId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
      userId: string
      email: string
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to delete admin accounts
- `404` — Admin account not found

---

### `GET /auth/system/admin-invites`

**List system admin invites**

Returns active pending system admin invites for the super admin surface.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      invites:
        [
          {
            id: string
            email: string
            role: string
            tenantId: string
            invitedBy: string
            expiresAt: string <date-time>
            createdAt: string <date-time>
          }
        ]
      generatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view system admin invites

---

### `POST /auth/system/admin-invites`

**Create system admin invite**

Creates and sends a pending invite for a new system admin account.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  email: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      email: string
      role: string
      tenantId: string
      invitedBy: string
      expiresAt: string <date-time>
      createdAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to invite system admins
- `409` — An account or pending invite with this email already exists

---

### `POST /auth/system/admin-invites/{inviteId}/resend`

**Resend system admin invite**

Resends a pending system admin invite and rotates the invite token.

**Path params:**
  - `inviteId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      email: string
      role: string
      tenantId: string
      invitedBy: string
      expiresAt: string <date-time>
      createdAt: string <date-time>
    }
}
```
- `201` — _(no body)_
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to resend system admin invites
- `404` — System admin invite not found

---

### `DELETE /auth/system/admin-invites/{inviteId}`

**Cancel system admin invite**

Cancels a pending system admin invite so the recipient can no longer join using that link.

**Path params:**
  - `inviteId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      email: string
      cancelled: boolean
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to cancel system admin invites
- `404` — System admin invite not found

---

### `POST /auth/organization/invites/resend`

**Resend pending invite**

Enterprise admin action: reissue an invite email for a still-pending tenant invite.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  email: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
      email: string
      role: string
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to resend invites
- `404` — Pending invite not found

---

### `GET /auth/invite/validate`

Validate an invite token (called when user clicks the invite link)

**Query params:**
  - `token` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      email: string
      role: string
      tenantId: string
    }
}
```

---


## Onboarding applications (public)

Landing-page onboarding. No account exists during these calls: `POST
/auth/onboarding/applications` returns an `applicationToken` once, and every
later call must carry it as the `X-Application-Token` header. A wrong or missing
token is answered `404`, so application ids cannot be walked. All endpoints are
rate limited per client IP (`ONBOARDING_RATE_LIMIT_RPS`,
`ONBOARDING_RATE_LIMIT_BURST`).

Validation is enforced in the use cases, not by DTO decorators. Phone numbers
must be Nigerian mobile numbers and are normalised to E.164; a letter anywhere
in the value is refused rather than stripped. `state` must be one of the 36
states or FCT.

### `POST /auth/onboarding/applications`

Start an onboarding application.

**Request body** (required):

```
{
  applicantType: "fleet_provider" | "owner_operator"
  organizationName: string
  businessEmail: string
  organizationPhone: string
  contactFullName: string
  contactRole: string
  streetAddress: string
  city: string
  state: string
}
```

**Responses:**

- `201` — the application plus its one-time `applicationToken`
- `400` — a field is invalid; the body carries `field`
- `409` — an account or live application already exists for this email

---

### `GET /auth/onboarding/applications/{applicationId}`

Get an application, its documents and `missingDocuments`.

**Headers:** `X-Application-Token` (required)

**Responses:**

- `200` — application returned
- `401` — missing application token
- `404` — application not found, or the token does not match

---

### `PATCH /auth/onboarding/applications/{applicationId}`

Update application details. Same body as the create call. Changing a verified
email or phone clears that verification and invalidates outstanding codes.

**Responses:**

- `200` — application updated
- `400` — a field is invalid
- `409` — the application is submitted and can no longer be changed

---

### `POST /auth/onboarding/applications/{applicationId}/documents`

Upload one supporting document (`multipart/form-data`: `document_type`, `file`).
All ten document types are required before submission. Format is decided by the
file contents, not the declared mime type or extension: PDF, JPG and PNG only,
10MB maximum. `customer_request_letter` must be a PDF. Re-uploading a type
replaces the previous file.

**Responses:**

- `201` — document stored
- `400` — missing file, unsupported format, or invalid `document_type`
- `409` — the application can no longer be changed

---

### `DELETE /auth/onboarding/applications/{applicationId}/documents/{documentId}`

Remove one uploaded document and its stored file.

**Responses:** `200`, `404`, `409`

---

### `POST /auth/onboarding/applications/{applicationId}/verify/email/send`
### `POST /auth/onboarding/applications/{applicationId}/verify/phone/send`

Send a 6 digit code to the business email or, by SMS, to the organization phone.
Sending a new code invalidates the previous one. Codes expire in 10 minutes, and
a resend is refused inside a 60 second cooldown or past 5 sends per hour.
Onboarding SMS is billed to the platform, never to the applicant.

**Responses:**

- `201` — code sent; the body carries the masked destination and expiry
- `429` — cooldown or hourly limit
- `503` — the code could not be dispatched

---

### `POST /auth/onboarding/applications/{applicationId}/verify/email`
### `POST /auth/onboarding/applications/{applicationId}/verify/phone`

Confirm the code. Body: `{ code: string }` — exactly 6 digits. Codes are stored
hashed and compared in constant time; 5 wrong attempts invalidate the code.

**Responses:** `201` — verified; `400` — wrong or expired code

---

### `POST /auth/onboarding/applications/{applicationId}/submit`

Submit for review. Requires both contacts verified and all ten documents present.

**Responses:**

- `201` — submitted
- `400` — outstanding items; the body carries `emailVerified`, `phoneVerified`
  and `missingDocuments`
- `409` — already submitted

---

### `GET /auth/onboarding/applications/{applicationId}/status`

Review progress: `applicationStatus`, `decisionReason`, per-document status and
the four-step timeline shown on the submitted screen.

**Responses:** `200`, `404`

---

## Onboarding applications (platform admin)

Bearer token required, platform admin only. Documents are stored under the
platform's own prefix for life; ownership is recorded on the document row and
stamped with the new `tenantId` at approval.

### `GET /auth/system/onboarding/applications`

Review queue, oldest first. Query: `status`, `applicantType`, `search`, `page`,
`limit`.

### `GET /auth/system/onboarding/applications/{applicationId}`

One application with its documents and short-lived presigned download links.

### `PATCH /auth/system/onboarding/applications/{applicationId}/documents/{documentId}/approve`
### `PATCH /auth/system/onboarding/applications/{applicationId}/documents/{documentId}/reject`

Per-document decision. Rejection requires `{ reason: string }`. The first
decision moves the application to `under_review`.

### `POST /auth/system/onboarding/applications/{applicationId}/approve`

Creates the tenant and its organization settings, stamps document ownership,
issues a 72 hour setup-link invite and emails it to the verified business
address. Refused while any document is missing or rejected.

**Responses:** `201`, `400` (documents unsettled), `409` (not reviewable, or the
email is now taken)

### `POST /auth/system/onboarding/applications/{applicationId}/reject`

Terminal. Body: `{ reason: string }`. No tenant is created; the applicant is
emailed the reason and can read it back from the status endpoint.

### `POST /auth/system/onboarding/applications/{applicationId}/request-changes`

Not terminal. Body: `{ reason: string }`. Returns the application to the
applicant with a freshly minted resume token; the applicant's previous token
stops working.

### `POST /auth/system/onboarding/applications/{applicationId}/setup-link/resend`

Issues a new setup link for an approved application and invalidates the previous
one. Refused once the account has been set up — use password reset instead.

---

### `POST /auth/register/invited`

Register from an invitation link

**Request body** (required):

```
{
  inviteToken: string
  fullName: string
  email?: string
  password: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      accessToken: string
      refreshToken: string
    }
}
```

---

### `POST /auth/forgot-password`

Request a password reset via email or SMS

**Request body** (required):

```
{
  identifier: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
    }
}
```
- `201` — _(no body)_

---

### `POST /auth/verify-reset`

Verify a password reset token

**Request body** (required):

```
{
  token: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
    }
}
```
- `201` — _(no body)_

---

### `POST /auth/verify-email`

Verify new-user email token

**Request body** (required):

```
{
  token: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
    }
}
```
- `201` — _(no body)_

---

### `POST /auth/complete-profile`

Complete invited-user profile (fullName + password)

**Request body** (required):

```
{
  token: string
  fullName: string
  password: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
    }
}
```
- `201` — _(no body)_

---

### `POST /auth/reset-password`

Reset password using a verified token

**Request body** (required):

```
{
  token: string
  newPassword: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
    }
}
```
- `201` — _(no body)_

---

### `POST /auth/change-role`

Change a user's role (enterprise admin only)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  targetUserId: string
  newRole: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
      userId: string
      newRole: string
    }
}
```
- `201` — _(no body)_

---

### `POST /auth/logout`

Logout – invalidate the refresh token (and access token if possible)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  refreshToken: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
    }
}
```
- `201` — _(no body)_

---

### `GET /auth/profile`

**Get current user profile**

Epic B (US-B01): view authenticated user name/contact details.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      userId: string
      email: string
      tenantId: string
      role: string
      accountStatus: string enum("enabled" | "disabled")
      profile:
        {
          fullName: string | null
          phoneNumber: string | null
          address: string | null
          profilePictureUrl: string | null
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted
- `404` — User not found

---

### `PATCH /auth/profile`

**Update current user profile**

Epic B (US-B01): edit authenticated user name/contact details.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  fullName?: string
  phoneNumber?: string
  address?: string
  profilePictureUrl?: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      userId: string
      email: string
      tenantId: string
      role: string
      accountStatus: string enum("enabled" | "disabled")
      profile:
        {
          fullName: string | null
          phoneNumber: string | null
          address: string | null
          profilePictureUrl: string | null
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted
- `404` — User not found

---

### `GET /auth/preferences/notifications`

**Get notification preferences**

Epic B (US-B02): retrieve current notification preference settings.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      userId: string
      notificationPreferences:
        {
          smsAlerts: boolean
          pushAlerts: boolean
          incidentAlerts: boolean
          jobAssignment: boolean
          jobCompletion: boolean
          maintenanceReminders: boolean
          fuelAlerts: boolean
          geofenceAlerts: boolean
          emailDigest: boolean
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted
- `404` — User not found

---

### `PATCH /auth/preferences/notifications`

**Update notification preferences**

Epic B (US-B02): update alert channel preferences.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  smsAlerts?: boolean
  pushAlerts?: boolean
  incidentAlerts?: boolean
  jobAssignment?: boolean
  jobCompletion?: boolean
  maintenanceReminders?: boolean
  fuelAlerts?: boolean
  geofenceAlerts?: boolean
  emailDigest?: boolean
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      userId: string
      notificationPreferences:
        {
          smsAlerts: boolean
          pushAlerts: boolean
          incidentAlerts: boolean
          jobAssignment: boolean
          jobCompletion: boolean
          maintenanceReminders: boolean
          fuelAlerts: boolean
          geofenceAlerts: boolean
          emailDigest: boolean
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted
- `404` — User not found

---

### `GET /auth/preferences/dispatch`

**Get dispatcher schedule and timezone preferences**

Epic B (US-B03): retrieve dispatcher working-hours/timezone settings.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      userId: string
      dispatcherPreferences:
        {
          timezone: string
          shiftStart: string
          shiftEnd: string
          workDays: number[]
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not a dispatcher
- `404` — User not found

---

### `PATCH /auth/preferences/dispatch`

**Update dispatcher schedule and timezone preferences**

Epic B (US-B03): update dispatcher working-hours/timezone settings.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  timezone?: string
  shiftStart?: string
  shiftEnd?: string
  workDays?: number[]
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      userId: string
      dispatcherPreferences:
        {
          timezone: string
          shiftStart: string
          shiftEnd: string
          workDays: number[]
        }
    }
}
```
- `400` — Invalid timezone/workday/shift format
- `401` — Missing or invalid bearer token
- `403` — Caller is not a dispatcher
- `404` — User not found

---

### `GET /auth/organization/users`

**List organization users**

Admin user management: fetch users and pending invitations for the caller's tenant.

**Query params:**
  - `search` (string, optional)
  - `role` (string, optional)
  - `status` (string, optional) — active | inactive | invited

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      tenantId: string
      users:
        [
          {
            userId: string | null
            email: string
            tenantId: string
            role: string
            accountStatus: string enum("enabled" | "disabled") | null
            status: string enum("active" | "inactive" | "invited")
            lastActiveAt: string <date-time> | null
            profile:
              {
                fullName: string | null
                phoneNumber: string | null
                address: string | null
                profilePictureUrl: string | null
              }
            inviteStatus: string enum("accepted" | "invited")
            invitedAt?: string <date-time> | null
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to read users

---

### `PATCH /auth/organization/users/{userId}`

**Update organization user profile**

Admin user management: update another user's profile/contact details within the current tenant.

**Path params:**
  - `userId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  fullName?: string
  phoneNumber?: string
  address?: string
  profilePictureUrl?: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
      user:
        {
          userId: string | null
          email: string
          tenantId: string
          role: string
          accountStatus: string enum("enabled" | "disabled") | null
          status: string enum("active" | "inactive" | "invited")
          lastActiveAt: string <date-time> | null
          profile:
            {
              fullName: string | null
              phoneNumber: string | null
              address: string | null
              profilePictureUrl: string | null
            }
          inviteStatus: string enum("accepted" | "invited")
          invitedAt?: string <date-time> | null
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to update users
- `404` — User not found

---

### `DELETE /auth/organization/users/{userId}`

**Remove organization user**

Admin user management: remove a user from the current tenant and revoke their sessions.

**Path params:**
  - `userId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
      userId: string
      email: string
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to remove users
- `404` — User not found

---

### `PATCH /auth/organization/users/{userId}/status`

**Update organization user account status**

Enterprise admin action: enable or disable a user account within the current tenant. Disabling revokes active sessions immediately.

**Path params:**
  - `userId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  accountStatus: string enum("enabled" | "disabled")
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
      user:
        {
          userId: string | null
          email: string
          tenantId: string
          role: string
          accountStatus: string enum("enabled" | "disabled") | null
          status: string enum("active" | "inactive" | "invited")
          lastActiveAt: string <date-time> | null
          profile:
            {
              fullName: string | null
              phoneNumber: string | null
              address: string | null
              profilePictureUrl: string | null
            }
          inviteStatus: string enum("accepted" | "invited")
          invitedAt?: string <date-time> | null
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to change account status
- `404` — User not found

---

### `GET /auth/organization/settings`

**Get organization settings**

Epic B (US-B04): retrieve tenant-level branding/default settings for the current tenant.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      tenantId: string
      branding:
        {
          organizationName: string
          contactEmail: string | null
          phoneNumber: string | null
          address: string | null
          logoUrl: string | null
          profilePictureUrl: string | null
          primaryColor: string | null
          secondaryColor: string | null
          accentColor: string | null
          successColor: string | null
          warningColor: string | null
          destructiveColor: string | null
          sidebarBackground: string | null
          sidebarText: string | null
          sidebarAccent: string | null
        }
      defaults:
        {
          timezone: string
          language: string
          currency: string
          dateFormat: string enum("DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD")
          weekStartsOn: string enum("monday" | "sunday")
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `404` — User not found

---

### `PATCH /auth/organization/settings`

**Update organization settings**

Epic B (US-B04): update tenant-level branding/default settings.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  branding?:
    {
      organizationName?: string
      contactEmail?: string | null
      billingEmail?: string | null
      phoneNumber?: string | null
      address?: string | null
      logoUrl?: string | null
      profilePictureUrl?: string | null
      primaryColor?: string | null
      secondaryColor?: string | null
      accentColor?: string | null
      successColor?: string | null
      warningColor?: string | null
      destructiveColor?: string | null
      sidebarBackground?: string | null
      sidebarText?: string | null
      sidebarAccent?: string | null
    }
  defaults?:
    {
      timezone?: string
      language?: string
      currency?: string
      dateFormat?: string enum("DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD")
      weekStartsOn?: string enum("monday" | "sunday")
    }
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      tenantId: string
      branding:
        {
          organizationName: string
          contactEmail: string | null
          phoneNumber: string | null
          address: string | null
          logoUrl: string | null
          profilePictureUrl: string | null
          primaryColor: string | null
          secondaryColor: string | null
          accentColor: string | null
          successColor: string | null
          warningColor: string | null
          destructiveColor: string | null
          sidebarBackground: string | null
          sidebarText: string | null
          sidebarAccent: string | null
        }
      defaults:
        {
          timezone: string
          language: string
          currency: string
          dateFormat: string enum("DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD")
          weekStartsOn: string enum("monday" | "sunday")
        }
    }
}
```
- `400` — Invalid settings payload
- `401` — Missing or invalid bearer token
- `403` — Caller is not an enterprise admin
- `404` — User not found

---

### `GET /auth/activity-log`

**Get tenant activity log**

Returns the persisted cross-service activity log for the caller's tenant.

**Query params:**
  - `service` (string, optional)
  - `entityType` (string, optional)
  - `entityId` (string, optional)
  - `action` (string, optional)
  - `actorId` (string, optional)
  - `limit` (number, optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    [
      {
        id: string
        tenantId: string
        service: string
        action: string
        entityType: string
        entityId: string
        summary: string
        actorId: string | null
        actorRole: string | null
        metadata:
          object {}
        occurredAt: string <date-time>
        recordedAt: string <date-time>
      }
    ]
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view activity logs

---

### `GET /auth/system/activity-log`

**Get system activity log**

Returns the persisted activity log for the system admin surface only.

**Query params:**
  - `service` (string, optional)
  - `entityType` (string, optional)
  - `entityId` (string, optional)
  - `action` (string, optional)
  - `actorId` (string, optional)
  - `limit` (number, optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    [
      {
        id: string
        tenantId: string
        service: string
        action: string
        entityType: string
        entityId: string
        summary: string
        actorId: string | null
        actorRole: string | null
        metadata:
          object {}
        occurredAt: string <date-time>
        recordedAt: string <date-time>
      }
    ]
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view system activity logs

---

### `GET /auth/system/dashboard`

**Get system dashboard**

Returns system-wide dashboard metrics for super admin and system admin users.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      totalTenants: number
      totalVehicles: number
      totalDrivers: number
      totalSensors: number
      totalSimCards: number | null
      dataUsageTodayMb: number | null
      sensorGpsMessagesPerHour: number | null
      unavailableMetrics: string[]
      generatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view the system dashboard

---

### `GET /auth/system/subscription-plans`

**Get system subscription plans**

Returns the hardcoded subscription plan catalog used by the system admin and super admin tenant onboarding flow.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      plans:
        [
          {
            code: string
            tier: string enum("starter" | "professional" | "enterprise")
            name: string
            description: string
            monthlyPriceNgn: number | null
            yearlyMonthlyEquivalentNgn: number | null
            yearlyDiscountPercent: number | null
            maxActiveVehicles: number | null
            maxUsers: number | null
            customPricing: boolean
            trialDays: number | null
            badge: string | null
            ctaLabel: string
            features: string[]
          }
        ]
      generatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view subscription plans

---

### `GET /auth/system/feature-flags`

**List system feature flags**

Returns platform-scoped feature flags for the system admin surface.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      flags:
        [
          {
            id: string
            scope: string enum("platform")
            tenantId: string | null
            featureKey: string
            featureName: string
            featureDescription: string | null
            isEnabled: boolean
            rolloutPercentage: number
            category: string enum("architecture" | "maintenance" | "fuel" | "optimization")
            phase: string enum("phase_3") | null
            createdAt: string <date-time>
            updatedAt: string <date-time>
          }
        ]
      generatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view system feature flags

---

### `PATCH /auth/system/feature-flags/{featureKey}`

**Update system feature flag**

Updates a platform-scoped feature flag for the system admin surface.

**Path params:**
  - `featureKey` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  isEnabled?: boolean
  rolloutPercentage?: number
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      scope: string enum("platform")
      tenantId: string | null
      featureKey: string
      featureName: string
      featureDescription: string | null
      isEnabled: boolean
      rolloutPercentage: number
      category: string enum("architecture" | "maintenance" | "fuel" | "optimization")
      phase: string enum("phase_3") | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to update system feature flags
- `404` — Feature flag not found

---

### `GET /auth/system/tenants/summary`

**Get system tenants summary**

Returns tenant management summary metrics for the super admin and system admin surface.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      totalTenants: number
      activeTenants: number
      suspendedTenants: number
      monthlyRevenueNgn: number
      totalVehicles: number
      totalSims: number
      overdueInvoices: number | null
      generatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view system tenants

---

### `GET /auth/system/tenants/export`

**Export system tenants**

Exports tenant management rows as a CSV file using the same filters as the tenant list endpoint.

**Query params:**
  - `lastActiveTo` (string, optional)
  - `lastActiveFrom` (string, optional)
  - `revenueTo` (number, optional)
  - `revenueFrom` (number, optional)
  - `kycStatus` (string enum("not_submitted" | "pending" | "under_review" | "verified" | "rejected"), optional)
  - `organizationType` (string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator"), optional)
  - `plan` (string enum("starter" | "professional" | "enterprise"), optional)
  - `status` (string enum("active" | "pending" | "suspended" | "inactive"), optional)
  - `search` (string, optional)

**Request body:** _none_

**Responses:**

- `200` — CSV export of system tenants
```
string <binary>
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to export system tenants

---

### `GET /auth/system/reference-data/tenant-onboarding`

**Get tenant onboarding reference data**

Returns hardcoded onboarding reference data for the system admin and super admin flows.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      organizationTypes: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator")[]
      billingCycles: string enum("monthly" | "yearly")[]
      deviceManufacturers: string[]
      deviceCatalog:
        [
          {
            manufacturer: string
            models:
              [
                {
                  id: string
                  model: string
                  protocolType: string enum("TCP" | "HTTP" | "MQTT" | "UDP")
                  defaultPort: number | null
                  supportedFeatures: string enum("obd2" | "fuel" | "sos")[]
                }
              ]
          }
        ]
      simCarriers: string enum("MTN" | "Airtel" | "Glo" | "9mobile")[]
      simDataPackages: string enum("250MB/month" | "500MB/month" | "1GB/month" | "2GB/month")[]
      tenantStatuses: string enum("active" | "pending" | "suspended" | "inactive")[]
      tenantPlans: string enum("starter" | "professional" | "enterprise")[]
      featureDefaults:
        {
          liveTracking: boolean
          messaging: boolean
          geofencing: boolean
          routeOptimization: boolean
          advancedAnalytics: boolean
          apiAccess: boolean
        }
      featureOptions:
        [
          {
            key: string
            label: string
            description: string
            defaultEnabled: boolean
          }
        ]
      generatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view tenant onboarding reference data

---

### `GET /auth/system/tenants/{tenantId}`

**Get system tenant detail**

Returns the detailed tenant management payload for a single tenant.

**Path params:**
  - `tenantId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      tenant:
        {
          id: string
          name: string
          slug: string
          email: string
          phone: string | null
          address: string | null
          billingEmail: string | null
          plan: string enum("starter" | "professional" | "enterprise")
          planCode: string | null
          status: string enum("active" | "pending" | "suspended" | "inactive")
          organizationType: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator") | null
          organizationTypes: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator")[]
          vehicleCount: number
          driverCount: number
          deviceCount: number
          simCount: number
          monthlyRevenueNgn: number
          createdAt: string <date-time>
          lastActiveAt: string <date-time> | null
          features:
            {
              liveTracking: boolean
              messaging: boolean
              geofencing: boolean
              routeOptimization: boolean
              advancedAnalytics: boolean
              apiAccess: boolean
            }
          invitationStatus:
            {
              hasPendingInvitation: boolean
              invitationAccepted: boolean
            }
          businessInfo:
            {
              companyName: string
              registrationNumber: string | null
              taxId: string | null
              businessType: string | null
              industry: string | null
              addressLine1: string | null
              addressLine2: string | null
              city: string | null
              state: string | null
              postalCode: string | null
              country: string | null
              verificationStatus: string enum("not_submitted" | "pending" | "under_review" | "verified" | "rejected")
              verifiedAt: string <date-time> | null
              yearEstablished: number | null
            }
        }
      onboarding:
        {
          onboardingId: string
          tenantId: string
          status: string enum("pending_activation" | "managed")
          bootstrapRole: string
          company:
            {
              companyName: string
              email: string
              phoneNumber: string | null
              billingEmail: string | null
              businessAddress: string | null
              organizationType: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator")
            }
          subscription:
            {
              planCode: string
              billingCycle: string enum("monthly" | "yearly")
            }
          deviceProvisioning:
            {
              provisionNow: boolean
              numberOfDevices: number | null
              deviceManufacturer: string | null
              deviceModel: string | null
            }
          simAssignment:
            {
              provisionNow: boolean
              numberOfSims: number | null
              carrier: string enum("MTN" | "Airtel" | "Glo" | "9mobile") | null
              dataPackage: string enum("250MB/month" | "500MB/month" | "1GB/month" | "2GB/month") | null
            }
          features:
            {
              liveTracking: boolean
              messaging: boolean
              geofencing: boolean
              routeOptimization: boolean
              advancedAnalytics: boolean
              apiAccess: boolean
            }
          adminInviteEmail: string
          createdAt: string <date-time>
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view system tenants
- `404` — Tenant not found

---

### `PATCH /auth/system/tenants/{tenantId}`

**Update system tenant**

Allows a super admin or system admin to update tenant onboarding metadata and branding. For activated tenants, login identity fields remain immutable.

**Path params:**
  - `tenantId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  company?:
    {
      companyName?: string
      contactName?: string
      email?: string
      phoneNumber?: string | null
      billingEmail?: string | null
      businessAddress?: string | null
      organizationType?: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator")
    }
  subscription?:
    {
      planCode?: string
      billingCycle?: string enum("monthly" | "yearly")
    }
  deviceProvisioning?:
    {
      provisionNow?: boolean
      numberOfDevices?: number | null
      deviceManufacturer?: string | null
      deviceModel?: string | null
    }
  simAssignment?:
    {
      provisionNow?: boolean
      numberOfSims?: number | null
      carrier?: string enum("MTN" | "Airtel" | "Glo" | "9mobile") | null
      dataPackage?: string enum("250MB/month" | "500MB/month" | "1GB/month" | "2GB/month") | null
    }
  features?:
    {
      liveTracking?: boolean
      messaging?: boolean
      geofencing?: boolean
      routeOptimization?: boolean
      advancedAnalytics?: boolean
      apiAccess?: boolean
    }
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      tenant:
        {
          id: string
          name: string
          slug: string
          email: string
          phone: string | null
          address: string | null
          billingEmail: string | null
          plan: string enum("starter" | "professional" | "enterprise")
          planCode: string | null
          status: string enum("active" | "pending" | "suspended" | "inactive")
          organizationType: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator") | null
          organizationTypes: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator")[]
          vehicleCount: number
          driverCount: number
          deviceCount: number
          simCount: number
          monthlyRevenueNgn: number
          createdAt: string <date-time>
          lastActiveAt: string <date-time> | null
          features:
            {
              liveTracking: boolean
              messaging: boolean
              geofencing: boolean
              routeOptimization: boolean
              advancedAnalytics: boolean
              apiAccess: boolean
            }
          invitationStatus:
            {
              hasPendingInvitation: boolean
              invitationAccepted: boolean
            }
          businessInfo:
            {
              companyName: string
              registrationNumber: string | null
              taxId: string | null
              businessType: string | null
              industry: string | null
              addressLine1: string | null
              addressLine2: string | null
              city: string | null
              state: string | null
              postalCode: string | null
              country: string | null
              verificationStatus: string enum("not_submitted" | "pending" | "under_review" | "verified" | "rejected")
              verifiedAt: string <date-time> | null
              yearEstablished: number | null
            }
        }
      onboarding:
        {
          onboardingId: string
          tenantId: string
          status: string enum("pending_activation" | "managed")
          bootstrapRole: string
          company:
            {
              companyName: string
              email: string
              phoneNumber: string | null
              billingEmail: string | null
              businessAddress: string | null
              organizationType: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator")
            }
          subscription:
            {
              planCode: string
              billingCycle: string enum("monthly" | "yearly")
            }
          deviceProvisioning:
            {
              provisionNow: boolean
              numberOfDevices: number | null
              deviceManufacturer: string | null
              deviceModel: string | null
            }
          simAssignment:
            {
              provisionNow: boolean
              numberOfSims: number | null
              carrier: string enum("MTN" | "Airtel" | "Glo" | "9mobile") | null
              dataPackage: string enum("250MB/month" | "500MB/month" | "1GB/month" | "2GB/month") | null
            }
          features:
            {
              liveTracking: boolean
              messaging: boolean
              geofencing: boolean
              routeOptimization: boolean
              advancedAnalytics: boolean
              apiAccess: boolean
            }
          adminInviteEmail: string
          createdAt: string <date-time>
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to update tenants
- `404` — Tenant not found
- `409` — Requested changes are incompatible with the tenant current activation state

---

### `DELETE /auth/system/tenants/{tenantId}`

**Delete system tenant**

Deletes a tenant shell only when no tenant user accounts or operational fleet records exist.

**Path params:**
  - `tenantId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      tenantId: string
      deleted: boolean
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to delete tenants
- `404` — Tenant not found
- `409` — Tenant cannot be deleted while it still owns platform data

---

### `POST /auth/system/tenants/{tenantId}/invite/resend`

**Resend tenant onboarding invite**

Reissues the bootstrap invite for a tenant that is still pending activation.

**Path params:**
  - `tenantId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      tenantId: string
      email: string
      role: string
      expiresAt: string <date-time>
      createdAt: string <date-time>
    }
}
```
- `201` — _(no body)_
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to resend tenant onboarding invites
- `404` — Tenant not found
- `409` — Tenant does not have a resendable onboarding invite in its current state

---

### `PATCH /auth/system/tenants/{tenantId}/status`

**Update system tenant status**

Allows a super admin or system admin to suspend or reactivate a tenant by updating all tenant user accounts.

**Path params:**
  - `tenantId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  status: string enum("active" | "suspended")
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      tenant:
        {
          id: string
          name: string
          slug: string
          email: string
          phone: string | null
          address: string | null
          billingEmail: string | null
          plan: string enum("starter" | "professional" | "enterprise")
          planCode: string | null
          status: string enum("active" | "pending" | "suspended" | "inactive")
          organizationType: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator") | null
          organizationTypes: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator")[]
          vehicleCount: number
          driverCount: number
          deviceCount: number
          simCount: number
          monthlyRevenueNgn: number
          createdAt: string <date-time>
          lastActiveAt: string <date-time> | null
          features:
            {
              liveTracking: boolean
              messaging: boolean
              geofencing: boolean
              routeOptimization: boolean
              advancedAnalytics: boolean
              apiAccess: boolean
            }
          invitationStatus:
            {
              hasPendingInvitation: boolean
              invitationAccepted: boolean
            }
          businessInfo:
            {
              companyName: string
              registrationNumber: string | null
              taxId: string | null
              businessType: string | null
              industry: string | null
              addressLine1: string | null
              addressLine2: string | null
              city: string | null
              state: string | null
              postalCode: string | null
              country: string | null
              verificationStatus: string enum("not_submitted" | "pending" | "under_review" | "verified" | "rejected")
              verifiedAt: string <date-time> | null
              yearEstablished: number | null
            }
        }
      onboarding:
        {
          onboardingId: string
          tenantId: string
          status: string enum("pending_activation" | "managed")
          bootstrapRole: string
          company:
            {
              companyName: string
              email: string
              phoneNumber: string | null
              billingEmail: string | null
              businessAddress: string | null
              organizationType: string enum("fleet_provider" | "enterprise" | "aggregator" | "owner_operator")
            }
          subscription:
            {
              planCode: string
              billingCycle: string enum("monthly" | "yearly")
            }
          deviceProvisioning:
            {
              provisionNow: boolean
              numberOfDevices: number | null
              deviceManufacturer: string | null
              deviceModel: string | null
            }
          simAssignment:
            {
              provisionNow: boolean
              numberOfSims: number | null
              carrier: string enum("MTN" | "Airtel" | "Glo" | "9mobile") | null
              dataPackage: string enum("250MB/month" | "500MB/month" | "1GB/month" | "2GB/month") | null
            }
          features:
            {
              liveTracking: boolean
              messaging: boolean
              geofencing: boolean
              routeOptimization: boolean
              advancedAnalytics: boolean
              apiAccess: boolean
            }
          adminInviteEmail: string
          createdAt: string <date-time>
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to change tenant status
- `404` — Tenant not found
- `409` — Tenant status cannot be changed in its current onboarding state

---

### `GET /auth/system/sims/summary`

**Get system SIM summary**

Platform-wide SIM metrics.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      active: number
      unassigned: number
      pendingRequests: number
      carriers: number
      byStatus:
        object {}
      byCarrier:
        object {}
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view SIM summary

---

### `GET /auth/system/sims`

**List system SIM inventory**

Platform-wide SIM inventory.

**Query params:**
  - `search` (string, optional)
  - `status` (string, optional)
  - `carrier` (string, optional)
  - `tenantId` (string, optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      sims:
        [
          {
            id: string
            iccid: string
            imsi: string | null
            msisdn: string | null
            carrier: string
            plan: string
            status: string
            tenantId: string | null
            deviceId: string | null
            dataUsageMb: number
            dataLimitMb: number
            smsUsage: number
            smsLimit: number
            monthlyCostNgn: number
            activationDate: string <date-time> | null
            signalStrength: number | null
            networkType: string | null
            roaming: boolean
            fonuStatus: string | null
            createdAt: string <date-time>
            updatedAt: string <date-time>
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view SIM inventory

---

### `GET /auth/system/sims/export`

**Export system SIM inventory**

CSV export of platform SIM inventory.

**Query params:**
  - `tenantId` (string, optional)
  - `carrier` (string, optional)
  - `status` (string, optional)
  - `search` (string, optional)

**Request body:** _none_

**Responses:**

- `200` — CSV export
```
string <binary>
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to export SIM inventory

---

### `GET /auth/system/sims/requests`

**List SIM provisioning requests**

Approval queue for tenant SIM requests.

**Query params:**
  - `status` (string enum("pending" | "approved" | "rejected"), optional)
  - `search` (string, optional)
  - `organisation` (string, optional) — Tenant id or name
  - `carrier` (string, optional) — Preferred operator
  - `useCase` (string, optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      requests:
        [
          {
            id: string
            tenantId: string
            tenantName: string
            requestType: string
            numberOfSims: number
            preferredOperator: string
            requestedPlan: string
            requestedDataLimitMb: number
            deploymentTimeline: string | null
            useCase: string | null
            status: string
            approvedBy: string | null
            approvedByName: string | null
            approvedAt: string <date-time> | null
            rejectedReason: string | null
            createdAt: string <date-time>
            updatedAt: string <date-time>
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view SIM requests

---

### `GET /auth/system/sims/requests/summary`

**SIM approval queue summary**

Counts for the SIM provisioning approval queue cards.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      totalRequested: number
      pendingApproval: number
      approvedThisMonth: number
      rejectedThisMonth: number
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view SIM requests

---

### `GET /auth/system/sims/requests/export`

**Export SIM provisioning requests**

CSV export of the SIM approval queue.

**Query params:**
  - `useCase` (string, optional)
  - `carrier` (string, optional)
  - `organisation` (string, optional)
  - `search` (string, optional)
  - `status` (string enum("pending" | "approved" | "rejected"), optional)

**Request body:** _none_

**Responses:**

- `200` — CSV export
```
string <binary>
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to export SIM requests

---

### `POST /auth/system/sims/requests/{requestId}/approve`

**Approve SIM provisioning request**

Approves a pending request and queues an activation batch.

**Path params:**
  - `requestId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      requestId: string
      batchId: string
      tenantName: string
      quantity: number
      operator: string
    }
}
```
- `201` — _(no body)_
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to approve SIM requests
- `404` — SIM request not found
- `409` — SIM request already processed

---

### `POST /auth/system/sims/requests/{requestId}/reject`

**Reject SIM provisioning request**

Rejects a pending request with a reason.

**Path params:**
  - `requestId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  reason: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      requestId: string
      batchId: string
      tenantName: string
      quantity: number
      operator: string
    }
}
```
- `201` — _(no body)_
- `400` — Missing rejection reason
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to reject SIM requests
- `404` — SIM request not found
- `409` — SIM request already processed

---

### `GET /auth/system/sims/batches`

**List SIM activation batches**

Monitor batch activation progress.

**Query params:**
  - `status` (string, optional)
  - `search` (string, optional)
  - `operator` (string, optional)
  - `mode` (string enum("single" | "bulk"), optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      batches:
        [
          {
            id: string
            requestId: string | null
            tenantId: string
            tenantName: string
            activationMode: string
            quantity: number
            operator: string
            requestedPlan: string
            dataLimitGb: number
            status: string
            simsActivated: number
            simsFailed: number
            createdBy: string | null
            createdByName: string | null
            startedAt: string <date-time> | null
            completedAt: string <date-time> | null
            errorMessage: string | null
            createdAt: string <date-time>
            updatedAt: string <date-time>
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view SIM batches

---

### `GET /auth/system/sims/batches/summary`

**SIM activation batches summary**

Counts for the batch activation overview cards.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      pendingActivation: number
      inProgress: number
      totalSimsQueued: number
      needsAttention: number
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view SIM batches

---

### `GET /auth/system/sims/batches/export`

**Export SIM activation batches**

CSV export of activation batches.

**Query params:**
  - `mode` (string enum("single" | "bulk"), optional)
  - `operator` (string, optional)
  - `search` (string, optional)
  - `status` (string, optional)

**Request body:** _none_

**Responses:**

- `200` — CSV export
```
string <binary>
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to export SIM batches

---

### `GET /auth/system/sims/batches/{batchId}`

**Get SIM activation batch detail**

**Path params:**
  - `batchId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      requestId: string | null
      tenantId: string
      tenantName: string
      activationMode: string
      quantity: number
      operator: string
      requestedPlan: string
      dataLimitGb: number
      status: string
      simsActivated: number
      simsFailed: number
      createdBy: string | null
      createdByName: string | null
      startedAt: string <date-time> | null
      completedAt: string <date-time> | null
      errorMessage: string | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view SIM batches
- `404` — SIM batch not found

---

### `POST /auth/system/sims/batches/{batchId}/retry`

**Retry SIM activation batch**

Re-queues a failed or partially completed batch.

**Path params:**
  - `batchId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      batchId: string
      tenantName: string
      quantity: number
    }
}
```
- `201` — _(no body)_
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to retry SIM batches
- `404` — SIM batch not found
- `409` — SIM batch cannot be retried in its current state

---

### `GET /auth/system/sims/{simId}`

**Get SIM detail**

**Path params:**
  - `simId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      iccid: string
      imsi: string | null
      msisdn: string | null
      carrier: string
      plan: string
      status: string
      tenantId: string | null
      deviceId: string | null
      dataUsageMb: number
      dataLimitMb: number
      smsUsage: number
      smsLimit: number
      monthlyCostNgn: number
      activationDate: string <date-time> | null
      signalStrength: number | null
      networkType: string | null
      roaming: boolean
      fonuStatus: string | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to view SIM inventory
- `404` — SIM not found

---

### `PATCH /auth/system/sims/{simId}`

**Update SIM**

Edit plan, carrier, or data/SMS limits.

**Path params:**
  - `simId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  plan?: string enum("iot_basic" | "iot_premium" | "data_only" | "data_sms" | "data_sms_voice")
  carrier?: string enum("MTN" | "Airtel" | "Glo" | "9mobile")
  dataLimitMb?: number
  smsLimit?: number
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      iccid: string
      imsi: string | null
      msisdn: string | null
      carrier: string
      plan: string
      status: string
      tenantId: string | null
      deviceId: string | null
      dataUsageMb: number
      dataLimitMb: number
      smsUsage: number
      smsLimit: number
      monthlyCostNgn: number
      activationDate: string <date-time> | null
      signalStrength: number | null
      networkType: string | null
      roaming: boolean
      fonuStatus: string | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```
- `400` — Invalid SIM update payload
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to update SIMs
- `404` — SIM not found

---

### `PATCH /auth/system/sims/{simId}/reassign`

**Reassign SIM**

Assign the SIM to a tenant/device or return it to the pool.

**Path params:**
  - `simId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  tenantId: string | null
  deviceId?: string | null
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      iccid: string
      imsi: string | null
      msisdn: string | null
      carrier: string
      plan: string
      status: string
      tenantId: string | null
      deviceId: string | null
      dataUsageMb: number
      dataLimitMb: number
      smsUsage: number
      smsLimit: number
      monthlyCostNgn: number
      activationDate: string <date-time> | null
      signalStrength: number | null
      networkType: string | null
      roaming: boolean
      fonuStatus: string | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to reassign SIMs
- `404` — SIM not found

---

### `PATCH /auth/system/sims/{simId}/suspend`

**Suspend or reactivate SIM**

**Path params:**
  - `simId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  suspend?: boolean
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      iccid: string
      imsi: string | null
      msisdn: string | null
      carrier: string
      plan: string
      status: string
      tenantId: string | null
      deviceId: string | null
      dataUsageMb: number
      dataLimitMb: number
      smsUsage: number
      smsLimit: number
      monthlyCostNgn: number
      activationDate: string <date-time> | null
      signalStrength: number | null
      networkType: string | null
      roaming: boolean
      fonuStatus: string | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to suspend SIMs
- `404` — SIM not found

---

### `GET /auth/system/support/dashboard`

**Support dashboard stats**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      open: number
      inProgress: number
      escalated: number
      waitingOnTenant: number
      resolved: number
      closed: number
      resolvedToday: number
      byCategory:
        object {}
      topTenants:
        [
          {
            tenantId: string
            count: number
          }
        ]
      needsAttention:
        [
          {
            id: string
            subject: string
            tenantId: string
            category: string
            status: string
            priority: string
          }
        ]
      recentlyResolved:
        [
          {
            id: string
            subject: string
            tenantId: string
            category: string
            resolvedAt: string <date-time>
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Not a system actor

---

### `GET /auth/system/support/escalated`

**List escalated tickets grouped by escalation party**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      parties:
        [
          {
            party: string
            count: number
            tickets:
              [
                {
                  id: string
                  tenantId: string
                  category: string
                  subject: string
                  status: string
                  priority: string
                  escalatedTo: string | null
                  escalatedReferenceId: string | null
                  escalationNotes: string | null
                  escalatedAt: string <date-time> | null
                  resolvedAt: string <date-time> | null
                  closedAt: string <date-time> | null
                  createdAt: string <date-time>
                  updatedAt: string <date-time>
                }
              ]
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Not a system actor

---

### `GET /auth/system/support/device-setup`

**List device setup requests**

**Query params:**
  - `dateTo` (string, optional) — ISO date upper bound on createdAt
  - `dateFrom` (string, optional) — ISO date lower bound on createdAt
  - `manufacturer` (string, optional)
  - `search` (string, optional)
  - `status` (string enum("pending_review" | "in_progress" | "assigned" | "rejected"), optional)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      requests:
        [
          {
            id: string
            imei: string
            manufacturer: string
            model: string
            connectionType: string
            requesterName: string
            needsSim: boolean
            vehiclePlate: string | null
            location: string | null
            tenantId: string
            status: string enum("pending_review" | "in_progress" | "assigned" | "rejected")
            assignedTo: string | null
            notes: string | null
            preferredInstallDate: string <date-time> | null
            rejectedReason: string | null
            createdAt: string <date-time>
            updatedAt: string <date-time>
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Not a system actor

---

### `GET /auth/system/support/device-setup/export`

**Export device setup requests as CSV**

**Query params:**
  - `dateTo` (string, optional)
  - `dateFrom` (string, optional)
  - `manufacturer` (string, optional)
  - `search` (string, optional)
  - `status` (string enum("pending_review" | "in_progress" | "assigned" | "rejected"), optional)

**Request body:** _none_

**Responses:**

- `200` — CSV export
```
string <binary>
```
- `401` — Missing or invalid bearer token
- `403` — Not a system actor

---

### `GET /auth/system/support/device-setup/{requestId}`

**Get device setup request detail**

**Path params:**
  - `requestId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      imei: string
      manufacturer: string
      model: string
      connectionType: string
      requesterName: string
      needsSim: boolean
      vehiclePlate: string | null
      location: string | null
      tenantId: string
      status: string enum("pending_review" | "in_progress" | "assigned" | "rejected")
      assignedTo: string | null
      notes: string | null
      preferredInstallDate: string <date-time> | null
      rejectedReason: string | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Not a system actor
- `404` — Device setup request not found

---

### `PATCH /auth/system/support/device-setup/{requestId}/assign`

**Assign device setup request to current actor**

**Path params:**
  - `requestId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      imei: string
      manufacturer: string
      model: string
      connectionType: string
      requesterName: string
      needsSim: boolean
      vehiclePlate: string | null
      location: string | null
      tenantId: string
      status: string enum("pending_review" | "in_progress" | "assigned" | "rejected")
      assignedTo: string | null
      notes: string | null
      preferredInstallDate: string <date-time> | null
      rejectedReason: string | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to assign device setup requests
- `404` — Device setup request not found

---

### `PATCH /auth/system/support/device-setup/{requestId}/reject`

**Reject device setup request with a reason**

**Path params:**
  - `requestId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  reason: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      imei: string
      manufacturer: string
      model: string
      connectionType: string
      requesterName: string
      needsSim: boolean
      vehiclePlate: string | null
      location: string | null
      tenantId: string
      status: string enum("pending_review" | "in_progress" | "assigned" | "rejected")
      assignedTo: string | null
      notes: string | null
      preferredInstallDate: string <date-time> | null
      rejectedReason: string | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```
- `400` — Missing rejection reason
- `401` — Missing or invalid bearer token
- `403` — Caller is not permitted to reject device setup requests
- `404` — Device setup request not found

---

### `GET /auth/system/support/tickets/summary`

**Get support ticket counts summary**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      open: number
      inProgress: number
      escalated: number
      waitingOnTenant: number
      resolved: number
      closed: number
      resolvedToday: number
      byCategory:
        object {}
      topTenants:
        [
          {
            tenantId: string
            count: number
          }
        ]
      needsAttention:
        [
          {
            id: string
            subject: string
            tenantId: string
            category: string
            status: string
            priority: string
          }
        ]
      recentlyResolved:
        [
          {
            id: string
            subject: string
            tenantId: string
            category: string
            resolvedAt: string <date-time>
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Not a system actor

---

### `GET /auth/system/support/tickets/export`

**Export support tickets as CSV**

**Query params:**
  - `search` (string, optional)
  - `category` (string enum("device_tracking" | "billing" | "sim_connectivity" | "messaging" | "compliance" | "onboarding" | "other"), optional)
  - `status` (string, optional)

**Request body:** _none_

**Responses:**

- `200` — CSV export
```
string <binary>
```
- `401` — Missing or invalid bearer token
- `403` — Not a system actor

---

### `GET /auth/system/support/tickets`

**List all support tickets**

**Query params:**
  - `status` (string, optional)
  - `category` (string enum("device_tracking" | "billing" | "sim_connectivity" | "messaging" | "compliance" | "onboarding" | "other"), optional)
  - `search` (string, optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      tickets:
        [
          {
            id: string
            tenantId: string
            subject: string
            category: string
            status: string
            priority: string
            escalatedAt: string <date-time> | null
            resolvedAt: string <date-time> | null
            closedAt: string <date-time> | null
            createdAt: string <date-time>
            updatedAt: string <date-time>
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Not a system actor

---

### `GET /auth/system/support/tickets/{ticketId}`

**Get support ticket detail**

**Path params:**
  - `ticketId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      subject: string
      category: string
      status: string
      priority: string
      escalatedAt: string <date-time> | null
      resolvedAt: string <date-time> | null
      closedAt: string <date-time> | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
      messages:
        [
          {
            id: string
            ticketId: string
            senderId: string
            senderName: string
            senderRole: string
            message: string
            isInternal: boolean
            createdAt: string <date-time>
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Not a system actor
- `404` — Ticket not found

---

### `PATCH /auth/system/support/tickets/{ticketId}/status`

**Update ticket status**

**Path params:**
  - `ticketId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  status: string enum("open" | "in_progress" | "waiting_on_tenant" | "escalated" | "resolved" | "closed")
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      ticketId: string
      status: string
    }
}
```
- `400` — Invalid status
- `401` — Missing or invalid bearer token
- `403` — Not a system mutator
- `404` — Ticket not found

---

### `PATCH /auth/system/support/tickets/{ticketId}/escalate`

**Escalate support ticket**

**Path params:**
  - `ticketId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  escalatedTo: string enum("fleetpro_internal" | "fonu_connectivity" | "vendor_installer")
  referenceId?: string
  notes?: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      ticketId: string
      status: string
    }
}
```
- `400` — Invalid escalation target
- `401` — Missing or invalid bearer token
- `403` — Not a system mutator
- `404` — Ticket not found

---

### `GET /auth/system/support/tickets/{ticketId}/messages`

**List ticket messages (includes internal notes)**

**Path params:**
  - `ticketId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      ticketId: string
      total: number
      messages:
        [
          {
            id: string
            ticketId: string
            senderId: string
            senderName: string
            senderRole: string
            message: string
            isInternal: boolean
            createdAt: string <date-time>
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Not a system actor
- `404` — Ticket not found

---

### `POST /auth/system/support/tickets/{ticketId}/messages`

**Send message or internal note on ticket**

**Path params:**
  - `ticketId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  message: string
  isInternal?: boolean
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      ticketId: string
      senderId: string
      senderName: string
      senderRole: string
      message: string
      isInternal: boolean
      createdAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `403` — Not a system mutator
- `404` — Ticket not found

---

### `GET /auth/onboarding/plans`

**List subscription plans**

Returns all active subscription plans with NGN prices and limits.

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      plans:
        [
          {
            code: string
            tier: string enum("starter" | "professional" | "enterprise")
            name: string
            description: string
            monthlyPriceNgn: number | null
            yearlyMonthlyEquivalentNgn: number | null
            yearlyDiscountPercent: number | null
            maxActiveVehicles: number | null
            maxUsers: number | null
            customPricing: boolean
            trialDays: number | null
            badge: string | null
            ctaLabel: string
            features: string[]
          }
        ]
      generatedAt: string <date-time>
    }
}
```

---

### `GET /auth/onboarding/exchange-rate`

**Current NGN/USD exchange rate**

Live rate from ExchangeRate-API; cached 30 min.

**Request body:** _none_

**Responses:**

- `200` — Exchange rate data
```
{
  status: boolean
  message: string
  data:
    {
      ngnPerUsd: number
      source: string
      fetchedAt: string <date-time>
    }
}
```

---

### `POST /auth/onboarding/payment/intent`

**Create payment intent**

Initialises a Paystack transaction (card) or MoMo USSD push. Returns authorization URL or USSD string.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  planCode: string
  billingCycle: string enum("monthly" | "yearly")
  gateway: string enum("paystack" | "momo")
  phone?: string
  redirectUrl?: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      gateway: string enum("paystack" | "momo")
      reference: string
      authorizationUrl?: string | null
      accessCode?: string
      ussdString?: string
      message?: string
    }
}
```
- `400` — Plan not found or invalid gateway
- `401` — Missing or invalid bearer token

---

### `GET /auth/onboarding/payment/events`

**Subscribe to payment confirmation events (SSE)**

Server-sent event stream. Emits once when the Paystack webhook confirms payment and activates the subscription.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Server-sent events stream (text/event-stream)

---

### `POST /auth/onboarding/payment/webhook`

**Paystack payment webhook (no auth)**

Receives charge.success events from Paystack. Validates HMAC signature, activates subscription, emits SSE to tenant.

**Request body** (required):

```
{
  event: string
  data:
    object {}
}
```

**Responses:**

- `201` — Acknowledged
```
{
  received: boolean
}
```

---

### `POST /auth/onboarding/enterprise/enquiry`

**Submit enterprise plan enquiry**

Creates a support ticket of category enterprise_enquiry for the sales team.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  name: string
  email: string
  phone?: string
  companyName: string
  message: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      ticketId: string
    }
}
```
- `401` — Missing or invalid bearer token

---

### `GET /auth/onboarding/subscription/caps`

**Get device & SIM caps for active plan**

Returns maxDevices, maxSims, maxUsers from the tenant's active subscription plan.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Subscription capability limits
```
{
  status: boolean
  message: string
  data:
    {
      planCode: string | null
      planName: string | null
      planTier: string | null
      maxDevices: number | null
      maxSims: number | null
      maxUsers: number | null
      subscriptionActivatedAt: string <date-time> | null
    }
}
```
- `401` — Missing or invalid bearer token

---

### `GET /auth/onboarding/status`

**Get onboarding status**

Returns the onboarding completion status and active subscription info for the calling tenant.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      tenantId: string
      isOnboarded: boolean
      onboardingStatus: string enum("pending" | "in_progress" | "completed" | "rejected")
      planCode?: string | null
      subscriptionStatus?: string | null
    }
}
```
- `401` — Missing or invalid bearer token

---

### `GET /auth/onboarding/business-info`

**Get business info**

Returns stored business registration details and verification status for the calling tenant.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      tenantId: string
      companyName: string
      registrationNumber?: string | null
      taxId?: string | null
      businessType?: string | null
      industry?: string | null
      addressLine1?: string | null
      addressLine2?: string | null
      city?: string | null
      state?: string | null
      postalCode?: string | null
      country?: string | null
      phone?: string | null
      email?: string | null
      billingEmail?: string | null
      website?: string | null
      yearEstablished?: number | null
      numberOfEmployees?: number | null
      verificationStatus: string enum("pending" | "under_review" | "verified" | "rejected")
      updatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token

---

### `PUT /auth/onboarding/business-info`

**Save/update business info**

Upserts business registration details for the calling tenant. Verification status is managed by the system.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  companyName: string
  registrationNumber?: string
  taxId?: string
  businessType?: string
  industry?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
  email?: string
  billingEmail?: string
  website?: string
  yearEstablished?: number
  numberOfEmployees?: number
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      tenantId: string
      companyName: string
      registrationNumber?: string | null
      taxId?: string | null
      businessType?: string | null
      industry?: string | null
      addressLine1?: string | null
      addressLine2?: string | null
      city?: string | null
      state?: string | null
      postalCode?: string | null
      country?: string | null
      phone?: string | null
      email?: string | null
      billingEmail?: string | null
      website?: string | null
      yearEstablished?: number | null
      numberOfEmployees?: number | null
      verificationStatus: string enum("pending" | "under_review" | "verified" | "rejected")
      updatedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token

---

### `GET /auth/onboarding/kyc/documents`

**List KYC documents**

Lists all uploaded KYC documents for the calling tenant with their id, type, name, size, and status.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      documents:
        [
          {
            id: string
            documentType: string
            documentName: string
            fileSize: number
            status: string enum("pending" | "under_review" | "verified" | "rejected")
            createdAt: string <date-time>
          }
        ]
    }
}
```
- `401` — Missing or invalid bearer token

---

### `POST /auth/onboarding/kyc/documents`

**Upload KYC document**

Uploads a KYC document file (stored privately in Wasabi) and records the document metadata.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  document_type: string enum("certificate_of_incorporation" | "memorandum_of_association" | "tax_clearance" | "vat_certificate" | "business_license" | "insurance_certificate" | "proof_of_address" | "director_id" | "other")
  file: string <binary>
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      documents:
        [
          {
            id: string
            documentType: string
            documentName: string
            fileSize: number
            status: string enum("pending" | "under_review" | "verified" | "rejected")
            createdAt: string <date-time>
          }
        ]
    }
}
```
- `400` — Missing file or invalid document_type
- `401` — Missing or invalid bearer token

---

### `DELETE /auth/onboarding/kyc/documents/{docId}`

**Delete KYC document**

Removes a KYC document record by ID. Only the owning tenant can delete their own documents.

**Path params:**
  - `docId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
    }
}
```
- `401` — Missing or invalid bearer token
- `404` — Document not found

---

### `POST /auth/onboarding/devices/provision`

**Submit device provisioning request**

Submits a fleet device provisioning request (manufacturer, model, quantity). Reviewed by system team.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  manufacturer: string
  model: string
  quantity: number
  useCase?: string
  requesterNotes?: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      requestId: string
    }
}
```
- `401` — Missing or invalid bearer token

---

### `POST /auth/onboarding/sims/register`

**Register individual SIMs**

Registers one or more SIMs (by ICCID + mobile number + operator) directly to the tenant in the SIM inventory.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  sims:
    [
      {
        iccid: string
        mobileNumber: string
        networkOperator: string
      }
    ]
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      registered: number
    }
}
```
- `401` — Missing or invalid bearer token

---

### `POST /auth/onboarding/sims/import`

**Bulk CSV SIM import**

Accepts a CSV file with columns iccid, msisdn, carrier and bulk-registers the SIMs.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  file: string <binary>
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      imported: number
      skipped: number
      failed: number
    }
}
```
- `400` — Invalid CSV or missing required column: iccid
- `401` — Missing or invalid bearer token

---

### `POST /auth/onboarding/sims/provision`

**Submit SIM provisioning request**

Submits a SIM provisioning request to Fonu. Reviewed and fulfilled by the system team.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  numberOfSims: number
  dataLimitGb: number
  preferredOperator: string
  useCase?: string
  notes?: string
  deviceMappingEnabled?: boolean
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      requestId: string
    }
}
```
- `401` — Missing or invalid bearer token

---

### `PUT /auth/onboarding/features`

**Save feature toggle preferences**

Updates feature toggles (live_tracking, geofencing, etc.) on the tenant onboarding record.

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  liveTracking?: boolean
  geofencing?: boolean
  routeOptimization?: boolean
  messaging?: boolean
  analytics?: boolean
  apiAccess?: boolean
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      features:
        {
          liveTracking?: boolean
          geofencing?: boolean
          routeOptimization?: boolean
          messaging?: boolean
          advancedAnalytics?: boolean
          apiAccess?: boolean
        }
    }
}
```
- `401` — Missing or invalid bearer token
- `404` — Onboarding record not found

---

### `POST /auth/onboarding/complete`

**Mark onboarding as complete**

Sets onboarding_completed_at server-side so completion persists across devices and sessions.

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      completedAt: string <date-time>
    }
}
```
- `401` — Missing or invalid bearer token
- `409` — Onboarding already completed

---

### `GET /auth/sims`

**List tenant SIMs**

**Query params:**
  - `search` (string, optional)
  - `status` (string, optional)
  - `operators` (string[], optional)
  - `page` (number, optional)
  - `limit` (number, optional)
  - `format` (string enum("csv" | "xlsx"), optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      items:
        [
          {
            id: string
            iccid: string
            imsi: string
            mobileNumber: string
            operator: string
            status: string
            simType: string
            dataLimitGb: number
            dataUsedGb: number
            monthlyRentalNaira: number
            assignedDevice:
              {
                id: string
                name: string
                type: string
                imei: string
                vehicleId: string | null
              }
          }
        ]
      total: number
      page: number
      limit: number
    }
}
```

---

### `POST /auth/sims`

**Register a SIM**

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  iccid: string
  imsi?: string
  mobileNumber: string
  operator: string
  dataLimitGb: number
  simType?: string
  monthlyRentalNaira: number
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
    }
}
```

---

### `GET /auth/sims/export`

**Export tenant SIMs**

**Query params:**
  - `search` (string, optional)
  - `status` (string, optional)
  - `operators` (string[], optional)
  - `page` (number, optional)
  - `limit` (number, optional)
  - `format` (string enum("csv" | "xlsx"), optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — CSV/xlsx file
```
string <binary>
```

---

### `GET /auth/sims/import/template`

**Download SIM import CSV template**

**Request body:** _none_

**Responses:**

- `200` — CSV template file
```
string <binary>
```

---

### `POST /auth/sims/import`

**Import SIMs from CSV**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      imported: number
      skipped: number
      failed: number
    }
}
```

---

### `GET /auth/sims/carriers`

**List active carriers for tenants**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      carriers:
        [
          {
            id: string
            name: string
            displayName: string
            active: boolean
          }
        ]
    }
}
```

---

### `GET /auth/sims/data-bundles`

**List bundle plans for tenants**

**Query params:**
  - `carrierId` (string, required)
  - `billingCycle` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      items:
        [
          {
            id: string
            code: string
            name: string
            carrier: string
            dataAmountGb: number
            validityDays: number
            billingCycle: string
            price: number
            currency: string
            active: boolean
          }
        ]
      total: number
    }
}
```

---

### `GET /auth/sims/requests`

**List tenant SIM requests**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      items:
        [
          {
            id: string
            quantity: number
            organizationName: string
            requestingEmail: string
            carrier: string
            planType: string
            dataBundlePlan:
              {
                id: string
                name: string
                dataLimitGb: number
              }
            useCase: string
            status: string enum("pending_review" | "approved" | "rejected" | "fulfilled")
            createdAt: string <date-time>
            timeline:
              [
                {
                  label: string
                  at: string <date-time>
                  by: string | null
                }
              ]
          }
        ]
      total: number
    }
}
```

---

### `POST /auth/sims/requests`

**Submit SIM provisioning request**

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  quantity: number
  carrier: string
  planType: string
  dataBundlePlanId: string
  useCase?: string
  notes?: string
  deviceMappingFileId?: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      requestId: string
    }
}
```

---

### `GET /auth/sims/requests/device-mapping/template`

**Download device mapping CSV template**

**Request body:** _none_

**Responses:**

- `200` — CSV template
```
string <binary>
```

---

### `POST /auth/sims/requests/device-mapping`

**Upload device mapping CSV**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      processed: number
      mapped: number
      failed: number
    }
}
```

---

### `GET /auth/sims/requests/{id}`

**Get tenant SIM request detail**

**Path params:**
  - `id` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      quantity: number
      organizationName: string
      requestingEmail: string
      carrier: string
      planType: string
      dataBundlePlan:
        {
          id: string
          name: string
          dataLimitGb: number
        }
      useCase: string
      status: string enum("pending_review" | "approved" | "rejected" | "fulfilled")
      createdAt: string <date-time>
      timeline:
        [
          {
            label: string
            at: string <date-time>
            by: string | null
          }
        ]
    }
}
```

---

### `GET /auth/sims/{id}`

**Get SIM detail**

**Path params:**
  - `id` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      iccid: string
      imsi: string
      mobileNumber: string
      operator: string
      status: string
      simType: string
      dataLimitGb: number
      dataUsedGb: number
      monthlyRentalNaira: number
      assignedDevice:
        {
          id: string
          name: string
          type: string
          imei: string
          vehicleId: string | null
        }
      notes: string | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```

---

### `PATCH /auth/sims/{id}`

**Update SIM**

**Path params:**
  - `id` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  iccid?: string
  imsi?: string
  mobileNumber?: string
  operator?: string
  dataLimitGb?: number
  simType?: string
  monthlyRentalNaira?: number
  notes?: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      iccid: string
      imsi: string
      mobileNumber: string
      operator: string
      status: string
      simType: string
      dataLimitGb: number
      dataUsedGb: number
      monthlyRentalNaira: number
      assignedDevice:
        {
          id: string
          name: string
          type: string
          imei: string
          vehicleId: string | null
        }
      notes: string | null
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```

---

### `DELETE /auth/sims/{id}`

**Delete SIM**

**Path params:**
  - `id` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
    }
}
```

---

### `POST /auth/sims/{id}/suspend`

**Suspend SIM**

**Path params:**
  - `id` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  reason?: string
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
    }
}
```
- `201` — _(no body)_

---

### `POST /auth/sims/{id}/reactivate`

**Reactivate SIM**

**Path params:**
  - `id` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
    }
}
```
- `201` — _(no body)_

---

### `DELETE /auth/sims/{id}/device`

**Unassign device from SIM**

**Path params:**
  - `id` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
    }
}
```

---

### `POST /auth/system/carriers`

**Create carrier (system admin)**

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  id: string
  name: string
  displayName: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
    }
}
```

---

### `PATCH /auth/system/carriers/{id}`

**Update carrier (system admin)**

**Path params:**
  - `id` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  name?: string
  displayName?: string
  active?: boolean
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
    }
}
```

---

### `POST /auth/system/bundle-catalog`

**Create bundle plan (system admin)**

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  id: string
  code: string
  name: string
  carrierId: string
  dataAmountGb: number
  validityDays: number
  billingCycle: string
  priceNaira: number
  currency?: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
    }
}
```

---

### `PATCH /auth/system/bundle-catalog/{id}`

**Update bundle plan (system admin)**

**Path params:**
  - `id` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  name?: string
  dataAmountGb?: number
  validityDays?: number
  billingCycle?: string
  priceNaira?: number
  active?: boolean
}
```

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
    }
}
```

---

### `DELETE /auth/system/bundle-catalog/{id}`

**Delete bundle plan (system admin)**

**Path params:**
  - `id` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
    }
}
```

---

### `GET /auth/data-bundles/summary`

**Get data bundle dashboard summary**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      walletBalance: number
      currency: string
      totalAmountToppedUp: number
      successfulTopUpTransactions: number
      activeAllocations: number
      expiredAllocations: number
      expiringWithinSevenDays: number
      monthlySpend: number
      topUpsThisMonth: number
      totalDataUsedGb: number
    }
}
```

---

### `GET /auth/data-bundles/wallet/balance`

**Get wallet balance**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      balance: number
      currency: string
    }
}
```

---

### `POST /auth/data-bundles/wallet/topup`

**Top up wallet via mobile money (stub)**

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  amount: number
  mobileMoneyProvider: string
  mobileNumber: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      transactionId: string
      paymentReference: string
      amount: number
      status: string enum("pending")
      paymentProvider: string
      mobileNumber: string
      createdAt: string <date-time>
    }
}
```

---

### `GET /auth/data-bundles/spending-limit`

**Get spending limit settings**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      enabled: boolean
      monthlyLimit: number
      spentThisMonth: number
      resetDayOfMonth: number
      alertEmail: string | null
      notifyAtPercentages: number[]
    }
}
```

---

### `POST /auth/data-bundles/spending-limit`

**Save spending limit settings**

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  monthlyLimit: number
  resetDayOfMonth: number
  alertEmail: string
  notifyAtPercentages?: number[]
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      enabled: boolean
    }
}
```

---

### `DELETE /auth/data-bundles/spending-limit`

**Disable spending limit**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
    }
}
```

---

### `GET /auth/data-bundles/auto-topup`

**Get auto top-up settings**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      enabled: boolean
      thresholdAmount: number
      topUpAmount: number
      paymentProvider: string
      mobileNumber: string | null
    }
}
```

---

### `POST /auth/data-bundles/auto-topup`

**Save auto top-up settings**

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  thresholdAmount: number
  topUpAmount: number
  paymentProvider: string
  mobileNumber: string
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      enabled: boolean
    }
}
```

---

### `DELETE /auth/data-bundles/auto-topup`

**Disable auto top-up**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      message: string
    }
}
```

---

### `GET /auth/data-bundles/allocations`

**List bundle allocations**

**Query params:**
  - `search` (string, optional)
  - `status` (string, optional)
  - `billingCycles` (string[], optional)
  - `page` (number, optional)
  - `limit` (number, optional)
  - `format` (string enum("csv" | "xlsx"), optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      items:
        [
          {
            id: string
            mobileNumber: string
            bundle:
              {
                id: string
                code: string
                name: string
                carrier: string
                dataAmountGb: number
                billingCycle: string
                price: number
              }
            dataUsedMb: number
            dataTotalMb: number
            dataUsedGb: number
            dataTotalGb: number
            usagePercentage: number
            activatedAt: string <date-time> | null
            expiresAt: string <date-time> | null
            daysLeft: number
            status: string
          }
        ]
      total: number
    }
}
```

---

### `POST /auth/data-bundles/allocations`

**Allocate bundle to SIMs**

**Header params:**
  - `authorization` (string, required)

**Request body** (required):

```
{
  carrierId: string
  planType: string
  bundleId: string
  mobileNumbers: string[]
}
```

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    {
      allocationIds: string[]
      totalAmount: number
      successfulCount: number
      failedCount: number
      failures?:
        [
          {
            mobileNumber: string
            reason: string
          }
        ]
    }
}
```

---

### `GET /auth/data-bundles/allocations/export`

**Export bundle allocations**

**Query params:**
  - `search` (string, optional)
  - `status` (string, optional)
  - `billingCycles` (string[], optional)
  - `page` (number, optional)
  - `limit` (number, optional)
  - `format` (string enum("csv" | "xlsx"), optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — CSV/xlsx export
```
string <binary>
```

---

### `GET /auth/data-bundles/allocations/sims`

**List SIMs available for bundle allocation**

**Query params:**
  - `search` (string, required)
  - `carrierId` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      items:
        [
          {
            id: string
            iccid: string
            imsi: string
            mobileNumber: string
            operator: string
            status: string
            simType: string
            dataLimitGb: number
            dataUsedGb: number
            monthlyRentalNaira: number
            assignedDevice:
              {
                id: string
                name: string
                type: string
                imei: string
                vehicleId: string | null
              }
          }
        ]
      total: number
      page: number
      limit: number
    }
}
```

---

### `GET /auth/data-bundles/allocations/{id}`

**Get bundle allocation detail**

**Path params:**
  - `id` (string, required)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      mobileNumber: string
      bundle:
        {
          id: string
          code: string
          name: string
          carrier: string
          dataAmountGb: number
          billingCycle: string
          price: number
        }
      dataUsedMb: number
      dataTotalMb: number
      dataUsedGb: number
      dataTotalGb: number
      dataRemainingMb: number
      dataRemainingGb: number
      usagePercentage: number
      activatedAt: string <date-time> | null
      expiresAt: string <date-time> | null
      daysLeft: number
      status: string
    }
}
```

---

### `GET /auth/data-bundles/transactions`

**List bundle transactions**

**Query params:**
  - `search` (string, optional)
  - `status` (string, optional)
  - `carriers` (string[], optional)
  - `startDate` (string, optional)
  - `endDate` (string, optional)
  - `page` (number, optional)
  - `limit` (number, optional)
  - `format` (string enum("csv" | "xlsx"), optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      items:
        [
          {
            id: string
            date: string <date-time>
            mobileNumber: string
            bundle:
              {
                id: string
                code: string
                name: string
                carrier: string
              }
            amount: number
            status: string
            paymentReference: string | null
            failureReason: string | null
          }
        ]
      total: number
    }
}
```

---

### `GET /auth/data-bundles/transactions/export`

**Export bundle transactions**

**Query params:**
  - `search` (string, optional)
  - `status` (string, optional)
  - `carriers` (string[], optional)
  - `startDate` (string, optional)
  - `endDate` (string, optional)
  - `page` (number, optional)
  - `limit` (number, optional)
  - `format` (string enum("csv" | "xlsx"), optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — CSV/xlsx export
```
string <binary>
```

---

### `GET /auth/data-bundles/analytics/spend-trend`

**Get spend trend analytics**

**Query params:**
  - `range` (string enum("7d" | "30d" | "90d" | "custom"), optional)
  - `startDate` (string, optional)
  - `endDate` (string, optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      trend:
        [
          {
            date: string
            amount: number
          }
        ]
    }
}
```

---

### `GET /auth/data-bundles/analytics/spend-breakdown`

**Get spend breakdown analytics**

**Query params:**
  - `range` (string enum("7d" | "30d" | "90d" | "custom"), optional)
  - `startDate` (string, optional)
  - `endDate` (string, optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      breakdown:
        [
          {
            bundleId: string
            bundleName: string
            bundleCode: string
            amount: number
            percentage: number
          }
        ]
    }
}
```

---

### `GET /auth/data-bundles/analytics/carrier-distribution`

**Get carrier distribution analytics**

**Query params:**
  - `range` (string enum("7d" | "30d" | "90d" | "custom"), optional)
  - `startDate` (string, optional)
  - `endDate` (string, optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      distribution:
        [
          {
            carrierId: string
            amount: number
            percentage: number
          }
        ]
    }
}
```

---

### `GET /auth/data-bundles/analytics/subscription-usage`

**Get subscription usage analytics**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      usage:
        [
          {
            bundleId: string
            bundleCode: string
            usedMb: number
            totalMb: number
          }
        ]
    }
}
```

---

### `GET /auth/data-bundles/rates`

**List bundle rates**

**Query params:**
  - `search` (string, optional)
  - `carriers` (string[], optional)
  - `planType` (string, optional)
  - `page` (number, optional)
  - `limit` (number, optional)
  - `format` (string enum("csv" | "xlsx"), optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      items:
        [
          {
            id: string
            code: string
            name: string
            carrier: string
            dataAmountGb: number
            validityDays: number
            billingCycle: string
            price: number
            currency: string
            active: boolean
          }
        ]
      total: number
    }
}
```

---

### `GET /auth/data-bundles/rates/export`

**Export bundle rates**

**Query params:**
  - `search` (string, optional)
  - `carriers` (string[], optional)
  - `planType` (string, optional)
  - `page` (number, optional)
  - `limit` (number, optional)
  - `format` (string enum("csv" | "xlsx"), optional)

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — CSV/xlsx export
```
string <binary>
```

---

### `GET /auth/data-bundles/carriers`

**List carriers for data bundles**

**Header params:**
  - `authorization` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      carriers:
        [
          {
            id: string
            name: string
            displayName: string
            active: boolean
          }
        ]
    }
}
```

---
