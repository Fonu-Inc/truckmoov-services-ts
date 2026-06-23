# Fleet Service — API Reference

- OpenAPI: `3.0.0` · Version: `0.1.0`
- Source: `https://dev-api.truckmoov.com/docs/fleet-json`
- Total endpoints: **115**

## Index

- **Fleet** (112)
  - `GET /fleet/health` — 
  - `GET /fleet/ready` — Readiness probe
  - `GET /fleet/test-sentry` — Trigger a test Sentry error
  - `GET /fleet/routes/{vehicleId}/geofence` — Read the configured geofence
  - `POST /fleet/routes/{vehicleId}/geofence` — Register a geofence
  - `POST /fleet/routes/{vehicleId}/location` — Report live position and detect deviations
  - `GET /fleet/vehicles/{vehicleId}/health` — Get last seen status
  - `GET /fleet/vehicles/health` — List all last seen statuses
  - `GET /fleet/vehicles/nearest` — Find nearest vehicles to a coordinate
  - `GET /fleet/vehicles` — List vehicles
  - `POST /fleet/vehicles` — Create vehicle
  - `GET /fleet/vehicles/summary` — Vehicle summary stats
  - `GET /fleet/vehicles/export` — Export vehicles as CSV
  - `GET /fleet/devices` — List devices
  - `POST /fleet/devices` — Create device
  - `POST /fleet/devices/import` — Bulk import devices
  - `GET /fleet/devices/{id}` — Get device by ID
  - `PATCH /fleet/devices/{id}` — Update device
  - `DELETE /fleet/devices/{id}` — Delete device
  - `PATCH /fleet/devices/{id}/lifecycle` — Set device lifecycle status
  - `GET /fleet/devices/{id}/assignment/validate` — Validate device assignment
  - `PATCH /fleet/devices/{id}/assignment` — Assign device to vehicle
  - `DELETE /fleet/devices/{id}/assignment` — Unassign device from vehicle
  - `GET /fleet/gps-devices` — List GPS devices
  - `POST /fleet/vehicles/import` — Bulk import vehicles
  - `GET /fleet/vehicles/{id}` — Get vehicle by ID
  - `PATCH /fleet/vehicles/{id}` — Update vehicle
  - `DELETE /fleet/vehicles/{id}` — Delete vehicle
  - `PATCH /fleet/vehicles/{id}/status` — Set vehicle status
  - `PATCH /fleet/vehicles/{id}/assignment` — Assign driver to vehicle
  - `DELETE /fleet/vehicles/{id}/assignment` — Unassign driver from vehicle
  - `PATCH /fleet/vehicles/{id}/gps-device` — Register GPS device on vehicle
  - `GET /fleet/drivers` — List drivers
  - `POST /fleet/drivers` — Create driver
  - `POST /fleet/drivers/import` — Bulk import drivers
  - `GET /fleet/drivers/{id}` — Get driver by ID
  - `PATCH /fleet/drivers/{id}` — Update driver
  - `DELETE /fleet/drivers/{id}` — Delete driver
  - `PATCH /fleet/drivers/{id}/status` — Set driver status
  - `PATCH /fleet/drivers/{id}/contact-channels` — Update driver contact channels
  - `GET /fleet/jobs` — List jobs
  - `GET /fleet/dispatch/search` — Dispatch search
  - `POST /fleet/events/job-status` — Publish job status event
  - `GET /fleet/alerts/stats` — Alert statistics — H06
  - `GET /fleet/alerts` — List alerts — H04
  - `POST /fleet/alerts/{id}/acknowledge` — Acknowledge alert — H04
  - `POST /fleet/alerts/{id}/resolve` — Resolve alert — H04
  - `GET /fleet/reports/dashboard` — Operational dashboard — I01
  - `GET /fleet/analytics/summary` — Analytics summary
  - `GET /fleet/analytics/fleet-status` — Fleet status breakdown
  - `GET /fleet/analytics/job-pipeline` — Job pipeline
  - `GET /fleet/analytics/fuel-levels` — Fuel levels
  - `GET /fleet/analytics/driver-scores` — Driver safety scores
  - `GET /fleet/analytics/events` — Behavior events
  - `GET /fleet/analytics/vehicle-safety-radar` — Fleet safety radar
  - `GET /fleet/maintenance/profiles` — List maintenance profiles
  - `POST /fleet/maintenance/profiles` — Create maintenance profile
  - `DELETE /fleet/maintenance/profiles/{id}` — Delete maintenance profile
  - `POST /fleet/maintenance/profiles/{id}/complete` — Mark maintenance profile as completed
  - `GET /fleet/maintenance/profiles/summary` — Maintenance profiles summary
  - `GET /fleet/maintenance/service-categories` — List maintenance service categories
  - `GET /fleet/maintenance/profiles/export` — Export maintenance profiles as CSV
  - `GET /fleet/geofences` — List geofence zones
  - `POST /fleet/geofences` — Create geofence zone
  - `PATCH /fleet/geofences/{id}` — Update geofence zone
  - `DELETE /fleet/geofences/{id}` — Archive geofence zone (soft delete)
  - `PUT /fleet/geofences/{id}/vehicles` — Set vehicle assignments for a geofence zone
  - `GET /fleet/maintenance/records` — List maintenance records
  - `POST /fleet/maintenance/records` — Create maintenance record
  - `GET /fleet/maintenance/records/summary` — Maintenance records summary
  - `GET /fleet/maintenance/records/export` — Export maintenance records as CSV
  - `GET /fleet/maintenance/records/{id}` — Get maintenance record
  - `PATCH /fleet/maintenance/records/{id}` — Update maintenance record
  - `DELETE /fleet/maintenance/records/{id}` — Delete maintenance record
  - `POST /fleet/maintenance/records/{id}/start` — Start maintenance record
  - `POST /fleet/maintenance/records/{id}/complete` — Complete maintenance record
  - `POST /fleet/maintenance/reminders/send` — Send maintenance reminders
  - `GET /fleet/compliance/documents` — List compliance documents
  - `POST /fleet/compliance/documents` — Create compliance document
  - `GET /fleet/compliance/documents/summary` — Compliance documents summary
  - `GET /fleet/compliance/documents/export` — Export compliance documents as CSV
  - `PATCH /fleet/compliance/documents/{id}` — Update compliance document
  - `DELETE /fleet/compliance/documents/{id}` — Delete compliance document
  - `POST /fleet/compliance/documents/{id}/upload` — Set file URL for a compliance document
  - `POST /fleet/compliance/documents/{id}/renew` — Renew a compliance document
  - `PATCH /fleet/compliance/documents/{id}/reminder` — Set reminder days for a compliance document
  - `POST /fleet/compliance/reminders/send` — Send compliance reminder emails
  - `POST /fleet/financials/profitability` — Compute per-vehicle profitability
  - `GET /fleet/financials/summary` — Fleet financial summary
  - `GET /fleet/financials/configs` — List financial configs
  - `GET /fleet/financials/configs/{vehicleId}` — Get financial config for a vehicle
  - `PUT /fleet/financials/configs/{vehicleId}` — Upsert financial config for a vehicle
  - `GET /fleet/financials/vehicle-pl/export` — Export vehicle P&L as CSV
  - `GET /fleet/financials/cost-breakdown/export` — Export cost breakdown as CSV
  - `GET /fleet/fuel/transactions` — List fuel transactions (alias for /fuel/records)
  - `GET /fleet/fuel/summary` — Fuel summary stats
  - `GET /fleet/reports/delivery-metrics` — Delivery metrics — I05
  - `GET /fleet/reports/export/{entity}` — CSV export — I07
  - `GET /fleet/fuel` — List fuel transactions — N02
  - `POST /fleet/fuel` — Record fuel transaction — N01
  - `GET /fleet/fuel/metrics` — Fuel consumption chart — N04
  - `GET /fleet/fuel/efficiency` — Vehicle fuel efficiency — N05
  - `GET /fleet/fuel/thresholds` — Get fuel efficiency thresholds — N08
  - `GET /fleet/fuel/export` — Export fuel transactions to CSV — N07
  - `PATCH /fleet/fuel/{id}` — Edit fuel transaction with audit trail — N03
  - `DELETE /fleet/fuel/{id}` — Delete fuel transaction with audit trail — N03
  - `PUT /fleet/fuel/thresholds/{vehicleType}` — Set fuel efficiency threshold by vehicle type — N08
  - `GET /fleet/documents` — List documents for an entity — J01
  - `POST /fleet/documents` — Upload document — J01
  - `GET /fleet/documents/{id}/download-url` — Get secure download URL — J02
  - `GET /fleet/documents/{id}/access-log` — Document access log — J04
  - `GET /fleet/audit` — Activity/audit log — M06
- **Webhooks** (3)
  - `POST /webhooks/cpaas` — CPaaS inbound webhook — K01/K02
  - `POST /webhooks/erp` — ERP/TMS job sync webhook — K05
  - `GET /webhooks/health` — Integration health — K06

## Fleet

### `GET /fleet/health`

Health check

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
    }
}
```

---

### `GET /fleet/ready`

**Readiness probe**

Readiness probe — L14

**Request body:** _none_

**Responses:**

- `200` — Service readiness status

---

### `GET /fleet/test-sentry`

**Trigger a test Sentry error**

Throws an unhandled error so Sentry capture can be verified.

**Request body:** _none_

**Responses:**

- `200` — Never returns — always throws

---

### `GET /fleet/routes/{vehicleId}/geofence`

**Read the configured geofence**

**Path params:**
  - `vehicleId` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Current bounding box

---

### `POST /fleet/routes/{vehicleId}/geofence`

**Register a geofence**

Stores a bounding box for a vehicle so we can detect deviations.

**Path params:**
  - `vehicleId` (string, required)

**Request body** (required):

```
{
  northeast:
    {
      lat: number
      lng: number
    }
  southwest:
    {
      lat: number
      lng: number
    }
}
```

**Responses:**

- `201` — Geofence stored

---

### `POST /fleet/routes/{vehicleId}/location`

**Report live position and detect deviations**

**Path params:**
  - `vehicleId` (string, required)

**Request body** (required):

```
{
  lat: number
  lng: number
}
```

**Responses:**

- `200` — Deviation flag
- `201` — _(no body)_

---

### `GET /fleet/vehicles/{vehicleId}/health`

**Get last seen status**

**Path params:**
  - `vehicleId` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      vehicleId: string
      plateNumber: string
      model: string
      assignedDriverId: string | null
      deviceId: string | null
      lastSeen: number | null
      healthy: boolean
    }
}
```

---

### `GET /fleet/vehicles/health`

**List all last seen statuses**

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
        vehicleId: string
        plateNumber: string
        model: string
        assignedDriverId: string | null
        deviceId: string | null
        lastSeen: number | null
        healthy: boolean
      }
    ]
}
```

---

### `GET /fleet/vehicles/nearest`

**Find nearest vehicles to a coordinate**

**Query params:**
  - `lat` (number, required)
  - `lng` (number, required)
  - `limit` (number, optional)

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
        vehicleId: string
        plateNumber: string
        model: string
        assignedDriverId: string | null
        lat: number
        lng: number
        distanceKm: number
      }
    ]
}
```

---

### `GET /fleet/vehicles`

**List vehicles**

Epic C (US-C01, US-C04, US-C06): list/search/filter fleet vehicles.

**Query params:**
  - `query` (string, optional)
  - `status` (string enum("active" | "inactive" | "maintenance" | "decommissioned"), optional)
  - `assigned` (string enum("true" | "false"), optional)
  - `type` (string enum("truck" | "van" | "trailer"), optional)
  - `yearFrom` (number, optional)
  - `yearTo` (number, optional)

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
        registrationNumber: string
        plateNumber: string
        vin: string | null
        make: string | null
        model: string
        year: number | null
        type: string enum("truck" | "van" | "trailer") | null
        capacity: number | null
        tenantId: string
        status: string enum("active" | "inactive" | "maintenance" | "decommissioned")
        assignedDriverId: string | null
        assignedDriverName?: string | null
        fuelLevelPercent?: number | null
        gpsDevice:
          {
            imei: string
            manufacturer: string
            model: string
            firmwareVersion: string
            installedAt: string
          }
      }
    ]
}
```
- `400` — Invalid query parameter values

---

### `POST /fleet/vehicles`

**Create vehicle**

Epic C (US-C01): create a new fleet vehicle.

**Request body** (required):

```
{
  plateNumber?: string
  registrationNumber?: string
  vin?: string
  make?: string
  model: string
  year?: number
  type?: string enum("truck" | "van" | "trailer")
  capacity?: number
  status?: string enum("active" | "inactive" | "maintenance" | "decommissioned")
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
      registrationNumber: string
      plateNumber: string
      vin: string | null
      make: string | null
      model: string
      year: number | null
      type: string enum("truck" | "van" | "trailer") | null
      capacity: number | null
      tenantId: string
      status: string enum("active" | "inactive" | "maintenance" | "decommissioned")
      assignedDriverId: string | null
      assignedDriverName?: string | null
      fuelLevelPercent?: number | null
      gpsDevice:
        {
          imei: string
          manufacturer: string
          model: string
          firmwareVersion: string
          installedAt: string
        }
    }
}
```

---

### `GET /fleet/vehicles/summary`

**Vehicle summary stats**

Returns count of vehicles grouped by status for the calling tenant.

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
      inactive: number
      maintenance: number
      decommissioned: number
    }
}
```

---

### `GET /fleet/vehicles/export`

**Export vehicles as CSV**

Returns a CSV of all vehicles for the calling tenant.

**Query params:**
  - `query` (string, optional)
  - `status` (string enum("active" | "inactive" | "maintenance" | "decommissioned"), optional)
  - `assigned` (string, optional)
  - `type` (string enum("truck" | "van" | "trailer"), optional)
  - `yearFrom` (string, optional)
  - `yearTo` (string, optional)

**Request body:** _none_

**Responses:**

- `200` — CSV file

---

### `GET /fleet/devices`

**List devices**

Lists standalone GPS/IoT devices for the fleet admin Devices inventory page.

**Query params:**
  - `query` (string, optional)
  - `manufacturer` (string, optional)
  - `status` (string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned"), optional)
  - `lifecycleStatus` (string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned"), optional)
  - `assigned` (string enum("true" | "false"), optional)

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
        imei: string
        manufacturer: string
        model: string
        firmwareVersion: string
        tenantId: string
        status: string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned")
        lifecycleStatus: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
        vehicleId: string | null
        signalStrength: number | null
        batteryLevel: number | null
        lastSeen: string | null
        assignedAt: string | null
        createdAt: string
        updatedAt: string
      }
    ]
}
```

---

### `POST /fleet/devices`

**Create device**

Registers a standalone GPS/IoT device before it is assigned to a vehicle.

**Request body** (required):

```
{
  imei: string
  manufacturer: string
  model: string
  firmwareVersion: string
  lifecycleStatus?: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
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
      imei: string
      manufacturer: string
      model: string
      firmwareVersion: string
      tenantId: string
      status: string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned")
      lifecycleStatus: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
      vehicleId: string | null
      signalStrength: number | null
      batteryLevel: number | null
      lastSeen: string | null
      assignedAt: string | null
      createdAt: string
      updatedAt: string
    }
}
```

---

### `POST /fleet/devices/import`

**Bulk import devices**

Bulk registers or updates GPS/IoT devices for the fleet Devices inventory.

**Request body** (required):

```
{
  items:
    [
      {
        imei: string
        manufacturer: string
        model: string
        firmwareVersion?: string
        lifecycleStatus?: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
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
      created: number
      updated: number
      total: number
      records:
        [
          {
            id: string
            imei: string
            manufacturer: string
            model: string
            firmwareVersion: string
            tenantId: string
            status: string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned")
            lifecycleStatus: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
            vehicleId: string | null
            signalStrength: number | null
            batteryLevel: number | null
            lastSeen: string | null
            assignedAt: string | null
            createdAt: string
            updatedAt: string
          }
        ]
    }
}
```

---

### `GET /fleet/devices/{id}`

**Get device by ID**

**Path params:**
  - `id` (string, required)

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
      firmwareVersion: string
      tenantId: string
      status: string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned")
      lifecycleStatus: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
      vehicleId: string | null
      signalStrength: number | null
      batteryLevel: number | null
      lastSeen: string | null
      assignedAt: string | null
      createdAt: string
      updatedAt: string
    }
}
```

---

### `PATCH /fleet/devices/{id}`

**Update device**

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  signalStrength?: number | null
  batteryLevel?: number | null
  lastSeen?: string | null
  imei?: string
  manufacturer?: string
  model?: string
  firmwareVersion?: string
  lifecycleStatus?: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
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
      firmwareVersion: string
      tenantId: string
      status: string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned")
      lifecycleStatus: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
      vehicleId: string | null
      signalStrength: number | null
      batteryLevel: number | null
      lastSeen: string | null
      assignedAt: string | null
      createdAt: string
      updatedAt: string
    }
}
```

---

### `DELETE /fleet/devices/{id}`

**Delete device**

**Path params:**
  - `id` (string, required)

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
      firmwareVersion: string
      tenantId: string
      status: string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned")
      lifecycleStatus: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
      vehicleId: string | null
      signalStrength: number | null
      batteryLevel: number | null
      lastSeen: string | null
      assignedAt: string | null
      createdAt: string
      updatedAt: string
    }
}
```

---

### `PATCH /fleet/devices/{id}/lifecycle`

**Set device lifecycle status**

Advances or changes a device through the installation lifecycle used by the Devices page.

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  lifecycleStatus: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
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
      firmwareVersion: string
      tenantId: string
      status: string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned")
      lifecycleStatus: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
      vehicleId: string | null
      signalStrength: number | null
      batteryLevel: number | null
      lastSeen: string | null
      assignedAt: string | null
      createdAt: string
      updatedAt: string
    }
}
```

---

### `GET /fleet/devices/{id}/assignment/validate`

**Validate device assignment**

Checks whether a device can be assigned to a specific vehicle before the UI submits the actual assignment.

**Path params:**
  - `id` (string, required)

**Query params:**
  - `vehicleId` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      canAssign: boolean
      reason: string | null
    }
}
```

---

### `PATCH /fleet/devices/{id}/assignment`

**Assign device to vehicle**

Assigns a standalone device inventory record to a fleet vehicle.

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  vehicleId: string
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
      firmwareVersion: string
      tenantId: string
      status: string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned")
      lifecycleStatus: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
      vehicleId: string | null
      signalStrength: number | null
      batteryLevel: number | null
      lastSeen: string | null
      assignedAt: string | null
      createdAt: string
      updatedAt: string
    }
}
```

---

### `DELETE /fleet/devices/{id}/assignment`

**Unassign device from vehicle**

**Path params:**
  - `id` (string, required)

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
      firmwareVersion: string
      tenantId: string
      status: string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned")
      lifecycleStatus: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
      vehicleId: string | null
      signalStrength: number | null
      batteryLevel: number | null
      lastSeen: string | null
      assignedAt: string | null
      createdAt: string
      updatedAt: string
    }
}
```

---

### `GET /fleet/gps-devices`

**List GPS devices**

Legacy alias for device inventory with vehicle mapping details preserved for older clients.

**Query params:**
  - `query` (string, optional)
  - `vehicleStatus` (string enum("active" | "inactive"), optional)

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
        imei: string
        manufacturer: string
        model: string
        firmwareVersion: string
        installedAt: string | null
        tenantId: string
        status: string enum("registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned")
        lifecycleStatus: string enum("registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned")
        vehicleId: string | null
        vehicleRegistrationNumber: string | null
        vehicleStatus: string enum("active" | "inactive") | null
        signalStrength: number | null
        batteryLevel: number | null
        lastSeen: string | null
        assignedAt: string | null
      }
    ]
}
```

---

### `POST /fleet/vehicles/import`

**Bulk import vehicles**

Epic C (US-C05): bulk upsert vehicles by plate number.

**Request body** (required):

```
{
  items:
    [
      {
        plateNumber?: string
        registrationNumber?: string
        vin?: string
        make?: string
        model: string
        year?: number
        type?: string enum("truck" | "van" | "trailer")
        capacity?: number
        status?: string enum("active" | "inactive" | "maintenance" | "decommissioned")
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
      created: number
      updated: number
      total: number
      records:
        [
          {
            id: string
            registrationNumber: string
            plateNumber: string
            vin: string | null
            make: string | null
            model: string
            year: number | null
            type: string enum("truck" | "van" | "trailer") | null
            capacity: number | null
            tenantId: string
            status: string enum("active" | "inactive" | "maintenance" | "decommissioned")
            assignedDriverId: string | null
            assignedDriverName?: string | null
            fuelLevelPercent?: number | null
            gpsDevice:
              {
                imei: string
                manufacturer: string
                model: string
                firmwareVersion: string
                installedAt: string
              }
          }
        ]
    }
}
```

---

### `GET /fleet/vehicles/{id}`

**Get vehicle by ID**

Retrieve a vehicle by ID

**Path params:**
  - `id` (string, required)

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
      registrationNumber: string
      plateNumber: string
      vin: string | null
      make: string | null
      model: string
      year: number | null
      type: string enum("truck" | "van" | "trailer") | null
      capacity: number | null
      tenantId: string
      status: string enum("active" | "inactive" | "maintenance" | "decommissioned")
      assignedDriverId: string | null
      assignedDriverName?: string | null
      fuelLevelPercent?: number | null
      gpsDevice:
        {
          imei: string
          manufacturer: string
          model: string
          firmwareVersion: string
          installedAt: string
        }
    }
}
```

---

### `PATCH /fleet/vehicles/{id}`

**Update vehicle**

Partially update a vehicle's details

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  plateNumber?: string
  registrationNumber?: string
  vin?: string
  make?: string
  model?: string
  year?: number
  type?: string enum("truck" | "van" | "trailer")
  capacity?: number
  status?: string enum("active" | "inactive" | "maintenance" | "decommissioned")
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
      registrationNumber: string
      plateNumber: string
      vin: string | null
      make: string | null
      model: string
      year: number | null
      type: string enum("truck" | "van" | "trailer") | null
      capacity: number | null
      tenantId: string
      status: string enum("active" | "inactive" | "maintenance" | "decommissioned")
      assignedDriverId: string | null
      assignedDriverName?: string | null
      fuelLevelPercent?: number | null
      gpsDevice:
        {
          imei: string
          manufacturer: string
          model: string
          firmwareVersion: string
          installedAt: string
        }
    }
}
```

---

### `DELETE /fleet/vehicles/{id}`

**Delete vehicle**

Remove a vehicle from the fleet

**Path params:**
  - `id` (string, required)

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
      registrationNumber: string
      plateNumber: string
      vin: string | null
      make: string | null
      model: string
      year: number | null
      type: string enum("truck" | "van" | "trailer") | null
      capacity: number | null
      tenantId: string
      status: string enum("active" | "inactive" | "maintenance" | "decommissioned")
      assignedDriverId: string | null
      assignedDriverName?: string | null
      fuelLevelPercent?: number | null
      gpsDevice:
        {
          imei: string
          manufacturer: string
          model: string
          firmwareVersion: string
          installedAt: string
        }
    }
}
```

---

### `PATCH /fleet/vehicles/{id}/status`

**Set vehicle status**

Epic C (US-C04): activate/deactivate vehicle availability.

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  status: string enum("active" | "inactive" | "maintenance" | "decommissioned")
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
      registrationNumber: string
      plateNumber: string
      vin: string | null
      make: string | null
      model: string
      year: number | null
      type: string enum("truck" | "van" | "trailer") | null
      capacity: number | null
      tenantId: string
      status: string enum("active" | "inactive" | "maintenance" | "decommissioned")
      assignedDriverId: string | null
      assignedDriverName?: string | null
      fuelLevelPercent?: number | null
      gpsDevice:
        {
          imei: string
          manufacturer: string
          model: string
          firmwareVersion: string
          installedAt: string
        }
    }
}
```

---

### `PATCH /fleet/vehicles/{id}/assignment`

**Assign driver to vehicle**

Epic C (US-C03): assign a driver record to a vehicle record.

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  driverId: string
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
      vehicle:
        {
          id: string
          registrationNumber: string
          plateNumber: string
          vin: string | null
          make: string | null
          model: string
          year: number | null
          type: string enum("truck" | "van" | "trailer") | null
          capacity: number | null
          tenantId: string
          status: string enum("active" | "inactive" | "maintenance" | "decommissioned")
          assignedDriverId: string | null
          assignedDriverName?: string | null
          fuelLevelPercent?: number | null
          gpsDevice:
            {
              imei: string
              manufacturer: string
              model: string
              firmwareVersion: string
              installedAt: string
            }
        }
      driver:
        {
          id: string
          firstName: string
          lastName: string
          name: string
          phone: string
          email: string | null
          licenseNumber: string
          licenseExpiryDate: string | null
          tenantId: string
          status:
            object {}
          communicationPreference:
            object {}
          assignedVehicleId: string | null
          contactChannels:
            {
              whatsappNumber: string | null
              smsNumber: string | null
              voiceNumber: string | null
            }
          createdAt: string
          updatedAt: string
        }
    }
}
```
- `400` — Invalid assignment rule (tenant/state mismatch)

---

### `DELETE /fleet/vehicles/{id}/assignment`

**Unassign driver from vehicle**

Remove current driver assignment from a vehicle

**Path params:**
  - `id` (string, required)

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
      registrationNumber: string
      plateNumber: string
      vin: string | null
      make: string | null
      model: string
      year: number | null
      type: string enum("truck" | "van" | "trailer") | null
      capacity: number | null
      tenantId: string
      status: string enum("active" | "inactive" | "maintenance" | "decommissioned")
      assignedDriverId: string | null
      assignedDriverName?: string | null
      fuelLevelPercent?: number | null
      gpsDevice:
        {
          imei: string
          manufacturer: string
          model: string
          firmwareVersion: string
          installedAt: string
        }
    }
}
```

---

### `PATCH /fleet/vehicles/{id}/gps-device`

**Register GPS device on vehicle**

Epic C (US-C08): map a GPS device to a vehicle.

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  imei: string
  manufacturer: string
  model: string
  firmwareVersion: string
  installedAt?: string
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
      registrationNumber: string
      plateNumber: string
      vin: string | null
      make: string | null
      model: string
      year: number | null
      type: string enum("truck" | "van" | "trailer") | null
      capacity: number | null
      tenantId: string
      status: string enum("active" | "inactive" | "maintenance" | "decommissioned")
      assignedDriverId: string | null
      assignedDriverName?: string | null
      fuelLevelPercent?: number | null
      gpsDevice:
        {
          imei: string
          manufacturer: string
          model: string
          firmwareVersion: string
          installedAt: string
        }
    }
}
```

---

### `GET /fleet/drivers`

**List drivers**

Epic C (US-C02, US-C04, US-C06): list/search/filter drivers.

**Query params:**
  - `query` (string, optional)
  - `status` (string enum("active" | "available" | "offline" | "suspended" | "inactive"), optional)
  - `assigned` (string enum("true" | "false"), optional)

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
        firstName: string
        lastName: string
        name: string
        phone: string
        email: string | null
        licenseNumber: string
        licenseExpiryDate: string | null
        tenantId: string
        status:
          object {}
        communicationPreference:
          object {}
        assignedVehicleId: string | null
        contactChannels:
          {
            whatsappNumber: string | null
            smsNumber: string | null
            voiceNumber: string | null
          }
        createdAt: string
        updatedAt: string
      }
    ]
}
```
- `400` — Invalid query parameter values

---

### `POST /fleet/drivers`

**Create driver**

Epic C (US-C02): create a new driver record.

**Request body** (required):

```
{
  name?: string
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  licenseNumber: string
  licenseExpiryDate?: string
  status?: string enum("active" | "available" | "offline" | "suspended" | "inactive")
  communicationPreference?: string enum("whatsapp" | "sms" | "email" | "voice")
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
      firstName: string
      lastName: string
      name: string
      phone: string
      email: string | null
      licenseNumber: string
      licenseExpiryDate: string | null
      tenantId: string
      status:
        object {}
      communicationPreference:
        object {}
      assignedVehicleId: string | null
      contactChannels:
        {
          whatsappNumber: string | null
          smsNumber: string | null
          voiceNumber: string | null
        }
      createdAt: string
      updatedAt: string
    }
}
```

---

### `POST /fleet/drivers/import`

**Bulk import drivers**

Epic C (US-C05): bulk upsert drivers by license number.

**Request body** (required):

```
{
  items:
    [
      {
        name?: string
        firstName?: string
        lastName?: string
        phone?: string
        email?: string
        licenseNumber: string
        licenseExpiryDate?: string
        status?: string enum("active" | "available" | "offline" | "suspended" | "inactive")
        communicationPreference?: string enum("whatsapp" | "sms" | "email" | "voice")
        contactChannels?:
          {
            whatsappNumber?: string | null
            smsNumber?: string | null
            voiceNumber?: string | null
          }
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
      created: number
      updated: number
      total: number
      records:
        [
          {
            id: string
            firstName: string
            lastName: string
            name: string
            phone: string
            email: string | null
            licenseNumber: string
            licenseExpiryDate: string | null
            tenantId: string
            status:
              object {}
            communicationPreference:
              object {}
            assignedVehicleId: string | null
            contactChannels:
              {
                whatsappNumber: string | null
                smsNumber: string | null
                voiceNumber: string | null
              }
            createdAt: string
            updatedAt: string
          }
        ]
    }
}
```

---

### `GET /fleet/drivers/{id}`

**Get driver by ID**

Retrieve a driver by ID

**Path params:**
  - `id` (string, required)

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
      firstName: string
      lastName: string
      name: string
      phone: string
      email: string | null
      licenseNumber: string
      licenseExpiryDate: string | null
      tenantId: string
      status:
        object {}
      communicationPreference:
        object {}
      assignedVehicleId: string | null
      contactChannels:
        {
          whatsappNumber: string | null
          smsNumber: string | null
          voiceNumber: string | null
        }
      createdAt: string
      updatedAt: string
    }
}
```

---

### `PATCH /fleet/drivers/{id}`

**Update driver**

Partially update a driver's details

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  name?: string
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  licenseNumber?: string
  licenseExpiryDate?: string
  status?: string enum("active" | "available" | "offline" | "suspended" | "inactive")
  communicationPreference?: string enum("whatsapp" | "sms" | "email" | "voice")
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
      firstName: string
      lastName: string
      name: string
      phone: string
      email: string | null
      licenseNumber: string
      licenseExpiryDate: string | null
      tenantId: string
      status:
        object {}
      communicationPreference:
        object {}
      assignedVehicleId: string | null
      contactChannels:
        {
          whatsappNumber: string | null
          smsNumber: string | null
          voiceNumber: string | null
        }
      createdAt: string
      updatedAt: string
    }
}
```

---

### `DELETE /fleet/drivers/{id}`

**Delete driver**

Remove a driver record

**Path params:**
  - `id` (string, required)

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
      firstName: string
      lastName: string
      name: string
      phone: string
      email: string | null
      licenseNumber: string
      licenseExpiryDate: string | null
      tenantId: string
      status:
        object {}
      communicationPreference:
        object {}
      assignedVehicleId: string | null
      contactChannels:
        {
          whatsappNumber: string | null
          smsNumber: string | null
          voiceNumber: string | null
        }
      createdAt: string
      updatedAt: string
    }
}
```

---

### `PATCH /fleet/drivers/{id}/status`

**Set driver status**

Epic C (US-C04): activate/deactivate driver availability.

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  status: string enum("active" | "available" | "offline" | "suspended" | "inactive")
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
      firstName: string
      lastName: string
      name: string
      phone: string
      email: string | null
      licenseNumber: string
      licenseExpiryDate: string | null
      tenantId: string
      status:
        object {}
      communicationPreference:
        object {}
      assignedVehicleId: string | null
      contactChannels:
        {
          whatsappNumber: string | null
          smsNumber: string | null
          voiceNumber: string | null
        }
      createdAt: string
      updatedAt: string
    }
}
```

---

### `PATCH /fleet/drivers/{id}/contact-channels`

**Update driver contact channels**

Epic C (US-C07): manage driver WhatsApp/SMS/voice channels.

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  whatsappNumber?: string | null
  smsNumber?: string | null
  voiceNumber?: string | null
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
      firstName: string
      lastName: string
      name: string
      phone: string
      email: string | null
      licenseNumber: string
      licenseExpiryDate: string | null
      tenantId: string
      status:
        object {}
      communicationPreference:
        object {}
      assignedVehicleId: string | null
      contactChannels:
        {
          whatsappNumber: string | null
          smsNumber: string | null
          voiceNumber: string | null
        }
      createdAt: string
      updatedAt: string
    }
}
```

---

### `GET /fleet/jobs`

**List jobs**

Epic C (US-C06): filter/search jobs for dispatch views.

**Query params:**
  - `query` (string, optional)
  - `status` (string, optional)

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
        jobId: string
        tenantId: string
        status: string
        updatedAt: string
      }
    ]
}
```

---

### `GET /fleet/dispatch/search`

**Dispatch search**

Epic C (US-C06): combined search/filter over vehicles, drivers, and jobs.

**Query params:**
  - `query` (string, optional)
  - `vehicleStatus` (string enum("active" | "inactive"), optional)
  - `driverStatus` (string enum("active" | "available" | "offline" | "suspended" | "inactive"), optional)
  - `jobStatus` (string, optional)
  - `assignedOnly` (string enum("true" | "false"), optional)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      vehicles:
        [
          {
            id: string
            registrationNumber: string
            plateNumber: string
            vin: string | null
            make: string | null
            model: string
            year: number | null
            type: string enum("truck" | "van" | "trailer") | null
            capacity: number | null
            tenantId: string
            status: string enum("active" | "inactive" | "maintenance" | "decommissioned")
            assignedDriverId: string | null
            assignedDriverName?: string | null
            fuelLevelPercent?: number | null
            gpsDevice:
              {
                imei: string
                manufacturer: string
                model: string
                firmwareVersion: string
                installedAt: string
              }
          }
        ]
      drivers:
        [
          {
            id: string
            firstName: string
            lastName: string
            name: string
            phone: string
            email: string | null
            licenseNumber: string
            licenseExpiryDate: string | null
            tenantId: string
            status:
              object {}
            communicationPreference:
              object {}
            assignedVehicleId: string | null
            contactChannels:
              {
                whatsappNumber: string | null
                smsNumber: string | null
                voiceNumber: string | null
              }
            createdAt: string
            updatedAt: string
          }
        ]
      jobs:
        [
          {
            jobId: string
            tenantId: string
            status: string
            updatedAt: string
          }
        ]
    }
}
```
- `400` — Invalid query parameter values

---

### `POST /fleet/events/job-status`

**Publish job status event**

Records job status snapshot and emits job.status.changed event.

**Request body:** _none_

**Responses:**

- `201` — 
```
{
  status: boolean
  message: string
  data:
    object {}
}
```

---

### `GET /fleet/alerts/stats`

**Alert statistics — H06**

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
      byStatus:
        object {}
      byType:
        object {}
      bySeverity:
        object {}
      meanTimeToResolveMs: number | null
    }
}
```

---

### `GET /fleet/alerts`

**List alerts — H04**

**Query params:**
  - `status` (string enum("open" | "acknowledged" | "resolved" | "escalated"), optional)
  - `type` (string, optional)
  - `vehicleId` (string, optional)

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
        type: string
        severity: string enum("low" | "medium" | "high" | "critical")
        status: string enum("open" | "acknowledged" | "resolved" | "escalated")
        vehicleId: string | null
        jobId: string | null
        details:
          object {}
        createdAt: string
        triggeredAt: string
        acknowledgedAt: string | null
        resolvedAt: string | null
        escalatedAt: string | null
        acknowledgedBy: string | null
        resolvedBy: string | null
      }
    ]
}
```

---

### `POST /fleet/alerts/{id}/acknowledge`

**Acknowledge alert — H04**

**Path params:**
  - `id` (string, required)

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
      type: string
      severity: string enum("low" | "medium" | "high" | "critical")
      status: string enum("open" | "acknowledged" | "resolved" | "escalated")
      vehicleId: string | null
      jobId: string | null
      details:
        object {}
      createdAt: string
      triggeredAt: string
      acknowledgedAt: string | null
      resolvedAt: string | null
      escalatedAt: string | null
      acknowledgedBy: string | null
      resolvedBy: string | null
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
      id: string
      type: string
      severity: string enum("low" | "medium" | "high" | "critical")
      status: string enum("open" | "acknowledged" | "resolved" | "escalated")
      vehicleId: string | null
      jobId: string | null
      details:
        object {}
      createdAt: string
      triggeredAt: string
      acknowledgedAt: string | null
      resolvedAt: string | null
      escalatedAt: string | null
      acknowledgedBy: string | null
      resolvedBy: string | null
    }
}
```

---

### `POST /fleet/alerts/{id}/resolve`

**Resolve alert — H04**

**Path params:**
  - `id` (string, required)

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
      type: string
      severity: string enum("low" | "medium" | "high" | "critical")
      status: string enum("open" | "acknowledged" | "resolved" | "escalated")
      vehicleId: string | null
      jobId: string | null
      details:
        object {}
      createdAt: string
      triggeredAt: string
      acknowledgedAt: string | null
      resolvedAt: string | null
      escalatedAt: string | null
      acknowledgedBy: string | null
      resolvedBy: string | null
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
      id: string
      type: string
      severity: string enum("low" | "medium" | "high" | "critical")
      status: string enum("open" | "acknowledged" | "resolved" | "escalated")
      vehicleId: string | null
      jobId: string | null
      details:
        object {}
      createdAt: string
      triggeredAt: string
      acknowledgedAt: string | null
      resolvedAt: string | null
      escalatedAt: string | null
      acknowledgedBy: string | null
      resolvedBy: string | null
    }
}
```

---

### `GET /fleet/reports/dashboard`

**Operational dashboard — I01**

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      vehicles:
        {
          total: number
          active: number
          inactive: number
          assigned: number
          seenInLastHour: number
        }
      drivers:
        {
          total: number
          active: number
          inactive: number
          assigned: number
        }
      jobs:
        {
          total: number
          byStatus:
            object {}
        }
      alerts:
        {
          open: number
          escalated: number
        }
      generatedAt: string
    }
}
```

---

### `GET /fleet/analytics/summary`

**Analytics summary**

High-level fleet summary across vehicles, drivers, jobs, and safety events for the given period.

**Query params:**
  - `period_days` (number enum(7 | 30 | 60 | 90), optional)

**Request body:** _none_

**Responses:**

- `200` — Analytics summary object
```
{
  status: boolean
  message: string
  data:
    {
      vehicles:
        {
          total: number
          active: number
          inactive: number
          maintenance: number
          decommissioned: number
        }
      drivers:
        {
          total: number
          active: number
          inactive: number
        }
      jobs:
        {
          total: number
          completed: number
          inProgress: number
          pending: number
        }
      safety:
        {
          totalEvents: number
          open: number
          critical: number
        }
      periodDays: number
    }
}
```

---

### `GET /fleet/analytics/fleet-status`

**Fleet status breakdown**

Vehicles grouped by status for the calling tenant.

**Query params:**
  - `period_days` (number enum(1 | 2 | 7 | 30 | 90), optional)

**Request body:** _none_

**Responses:**

- `200` — Fleet status breakdown
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      byStatus:
        object {}
      breakdown:
        [
          {
            id: string
            plateNumber: string
            status: string
            type: string
            assignedDriverId: string | null
          }
        ]
      periodDays: number
    }
}
```

---

### `GET /fleet/analytics/job-pipeline`

**Job pipeline**

Jobs grouped by status for the given period.

**Query params:**
  - `period_days` (number enum(7 | 30 | 60 | 90), optional)

**Request body:** _none_

**Responses:**

- `200` — Job pipeline breakdown
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      byStatus:
        object {}
      periodDays: number
    }
}
```

---

### `GET /fleet/analytics/fuel-levels`

**Fuel levels**

Per-vehicle fuel level (from telemetry where available).

**Query params:**
  - `period_days` (number enum(1 | 2 | 7 | 30 | 90), optional)

**Request body:** _none_

**Responses:**

- `200` — Fuel level array per vehicle
```
{
  status: boolean
  message: string
  data:
    {
      periodDays: number
      vehicles:
        [
          {
            vehicleId: string
            plateNumber: string
            fuelLevelPercent: number | null
            lastUpdated: string | null
          }
        ]
    }
}
```

---

### `GET /fleet/analytics/driver-scores`

**Driver safety scores**

Safety scores per driver based on behavior events in the given period.

**Query params:**
  - `period_days` (number enum(7 | 30 | 60 | 90), optional)
  - `limit` (number, optional)

**Request body:** _none_

**Responses:**

- `200` — Driver scores array
```
{
  status: boolean
  message: string
  data:
    [
      {
        driverId: string
        driverName: string
        incidents: number
        harshBraking: number
        overspeeding: number
        safetyScore: number
      }
    ]
}
```

---

### `GET /fleet/analytics/events`

**Behavior events**

Alert/behavior event list with filters for the given period.

**Query params:**
  - `period_days` (number enum(7 | 30 | 60 | 90), optional)
  - `limit` (number, optional)
  - `severity` (string enum("low" | "medium" | "high" | "critical"), optional)

**Request body:** _none_

**Responses:**

- `200` — Events array
```
{
  status: boolean
  message: string
  data:
    [
      {
        id: string
        type: string
        severity: string
        status: string
        vehicleId: string | null
        jobId: string | null
        details:
          object {}
        triggeredAt: string
      }
    ]
}
```

---

### `GET /fleet/analytics/vehicle-safety-radar`

**Fleet safety radar**

Average driver behavior scores across the fleet: braking, acceleration, speed control, and cornering for the given period.

**Query params:**
  - `period_days` (number enum(1 | 2 | 7 | 30 | 90), optional)

**Request body:** _none_

**Responses:**

- `200` — Average behavior scores per dimension (0-100)
```
{
  status: boolean
  message: string
  data:
    {
      braking: number
      acceleration: number
      speedControl: number
      cornering: number
      periodDays: number
    }
}
```

---

### `GET /fleet/maintenance/profiles`

**List maintenance profiles**

**Query params:**
  - `vehicleId` (string, optional)
  - `lifecycleStatus` (string enum("overdue" | "due" | "upcoming" | "completed"), optional)
  - `nextDueDateFrom` (string, optional)
  - `nextDueDateTo` (string, optional)

**Request body:** _none_

**Responses:**

- `200` — Maintenance profiles array
```
{
  status: boolean
  message: string
  data:
    [
      {
        id: string
        tenantId: string
        vehicleId: string
        serviceType: string
        serviceLabel: string
        intervalType: string enum("date" | "mileage" | "both" | "months")
        intervalDays: number | null
        intervalMonths: number | null
        intervalKm: number | null
        lastServiceDate: string | null
        lastServiceMileage: number | null
        currentMileage: number | null
        mileageSource: string enum("telemetry" | "manual")
        nextDueDate: string | null
        nextDueMileage: number | null
        createdAt: string
        updatedAt: string
        lifecycleStatus: string enum("overdue" | "due" | "upcoming" | "completed")
      }
    ]
}
```

---

### `POST /fleet/maintenance/profiles`

**Create maintenance profile**

**Request body** (required):

```
{
  vehicleId: string
  serviceType: string
  serviceLabel: string
  intervalType: string enum("date" | "mileage" | "both" | "months")
  intervalDays?: number | null
  intervalMonths?: number | null
  intervalKm?: number | null
  lastServiceDate?: string | null
  lastServiceMileage?: number | null
  currentMileage?: number | null
  mileageSource: string enum("telemetry" | "manual")
  nextDueDate?: string | null
  nextDueMileage?: number | null
}
```

**Responses:**

- `201` — Maintenance profile created
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string
      serviceType: string
      serviceLabel: string
      intervalType: string enum("date" | "mileage" | "both" | "months")
      intervalDays: number | null
      intervalMonths: number | null
      intervalKm: number | null
      lastServiceDate: string | null
      lastServiceMileage: number | null
      currentMileage: number | null
      mileageSource: string enum("telemetry" | "manual")
      nextDueDate: string | null
      nextDueMileage: number | null
      createdAt: string
      updatedAt: string
      lifecycleStatus: string enum("overdue" | "due" | "upcoming" | "completed")
    }
}
```

---

### `DELETE /fleet/maintenance/profiles/{id}`

**Delete maintenance profile**

**Path params:**
  - `id` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Deleted
```
{
  status: boolean
  message: string
  data:
    object {}
}
```

---

### `POST /fleet/maintenance/profiles/{id}/complete`

**Mark maintenance profile as completed**

**Path params:**
  - `id` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Completed
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string
      serviceType: string
      serviceLabel: string
      intervalType: string enum("date" | "mileage" | "both" | "months")
      intervalDays: number | null
      intervalMonths: number | null
      intervalKm: number | null
      lastServiceDate: string | null
      lastServiceMileage: number | null
      currentMileage: number | null
      mileageSource: string enum("telemetry" | "manual")
      nextDueDate: string | null
      nextDueMileage: number | null
      createdAt: string
      updatedAt: string
      lifecycleStatus: string enum("overdue" | "due" | "upcoming" | "completed")
    }
}
```
- `201` — _(no body)_

---

### `GET /fleet/maintenance/profiles/summary`

**Maintenance profiles summary**

**Request body:** _none_

**Responses:**

- `200` — Summary counts
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      overdue: number
      due: number
      upcoming: number
      completed: number
    }
}
```

---

### `GET /fleet/maintenance/service-categories`

**List maintenance service categories**

**Request body:** _none_

**Responses:**

- `200` — Service categories list
```
{
  status: boolean
  message: string
  data: string[]
}
```

---

### `GET /fleet/maintenance/profiles/export`

**Export maintenance profiles as CSV**

**Request body:** _none_

**Responses:**

- `200` — CSV file

---

### `GET /fleet/geofences`

**List geofence zones**

**Query params:**
  - `status` (string enum("ACTIVE" | "ARCHIVED"), optional)

**Request body:** _none_

**Responses:**

- `200` — Geofence zones array
```
{
  status: boolean
  message: string
  data:
    [
      {
        id: string
        tenantId: string
        name: string
        description: string | null
        coordinates: number[][]
        radiusMeters: number | null
        status: string enum("ACTIVE" | "ARCHIVED")
        assignedVehicleIds: string[]
        createdAt: string <date-time>
        updatedAt: string <date-time>
      }
    ]
}
```

---

### `POST /fleet/geofences`

**Create geofence zone**

**Request body** (required):

```
{
  name: string
  description?: string | null
  coordinates: number[][]
  radiusMeters?: number | null
}
```

**Responses:**

- `201` — Zone created
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      name: string
      description: string | null
      coordinates: number[][]
      radiusMeters: number | null
      status: string enum("ACTIVE" | "ARCHIVED")
      assignedVehicleIds: string[]
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```

---

### `PATCH /fleet/geofences/{id}`

**Update geofence zone**

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  name?: string
  description?: string | null
  coordinates?: number[][]
  radiusMeters?: number | null
  status?: string enum("ACTIVE" | "ARCHIVED")
}
```

**Responses:**

- `200` — Zone updated
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      name: string
      description: string | null
      coordinates: number[][]
      radiusMeters: number | null
      status: string enum("ACTIVE" | "ARCHIVED")
      assignedVehicleIds: string[]
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```

---

### `DELETE /fleet/geofences/{id}`

**Archive geofence zone (soft delete)**

**Path params:**
  - `id` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Zone archived
```
{
  status: boolean
  message: string
  data:
    object {}
}
```

---

### `PUT /fleet/geofences/{id}/vehicles`

**Set vehicle assignments for a geofence zone**

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  vehicleIds: string[]
}
```

**Responses:**

- `200` — Assignments updated
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      name: string
      description: string | null
      coordinates: number[][]
      radiusMeters: number | null
      status: string enum("ACTIVE" | "ARCHIVED")
      assignedVehicleIds: string[]
      createdAt: string <date-time>
      updatedAt: string <date-time>
    }
}
```

---

### `GET /fleet/maintenance/records`

**List maintenance records**

**Query params:**
  - `vehicleId` (string, optional)
  - `status` (string enum("scheduled" | "in_progress" | "completed" | "cancelled" | "overdue"), optional)
  - `priority` (string enum("low" | "medium" | "high" | "critical"), optional)
  - `maintenanceType` (string, optional)
  - `search` (string, optional)

**Request body:** _none_

**Responses:**

- `200` — Maintenance records array
```
{
  status: boolean
  message: string
  data:
    [
      {
        id: string
        tenantId: string
        vehicleId: string
        maintenanceType: string
        description: string | null
        status: string enum("scheduled" | "in_progress" | "completed" | "cancelled")
        priority: string enum("low" | "medium" | "high" | "critical")
        scheduledDate: string | null
        completedDate: string | null
        cost: number | null
        currency: string
        technician: string | null
        notes: string | null
        createdAt: string
        updatedAt: string
      }
    ]
}
```

---

### `POST /fleet/maintenance/records`

**Create maintenance record**

**Request body** (required):

```
{
  vehicleId: string
  maintenanceType: string
  description?: string | null
  status: string enum("scheduled" | "in_progress" | "completed" | "cancelled")
  priority: string enum("low" | "medium" | "high" | "critical")
  scheduledDate?: string | null
  completedDate?: string | null
  cost?: number | null
  currency: string
  technician?: string | null
  notes?: string | null
}
```

**Responses:**

- `201` — Record created
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string
      maintenanceType: string
      description: string | null
      status: string enum("scheduled" | "in_progress" | "completed" | "cancelled")
      priority: string enum("low" | "medium" | "high" | "critical")
      scheduledDate: string | null
      completedDate: string | null
      cost: number | null
      currency: string
      technician: string | null
      notes: string | null
      createdAt: string
      updatedAt: string
    }
}
```

---

### `GET /fleet/maintenance/records/summary`

**Maintenance records summary**

**Request body:** _none_

**Responses:**

- `200` — Summary counts
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      scheduled: number
      inProgress: number
      completed: number
      overdue: number
      totalCostNgn: number
    }
}
```

---

### `GET /fleet/maintenance/records/export`

**Export maintenance records as CSV**

**Request body:** _none_

**Responses:**

- `200` — CSV file

---

### `GET /fleet/maintenance/records/{id}`

**Get maintenance record**

**Path params:**
  - `id` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Maintenance record
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string
      maintenanceType: string
      description: string | null
      status: string enum("scheduled" | "in_progress" | "completed" | "cancelled")
      priority: string enum("low" | "medium" | "high" | "critical")
      scheduledDate: string | null
      completedDate: string | null
      cost: number | null
      currency: string
      technician: string | null
      notes: string | null
      createdAt: string
      updatedAt: string
    }
}
```

---

### `PATCH /fleet/maintenance/records/{id}`

**Update maintenance record**

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  vehicleId?: string
  maintenanceType?: string
  description?: string | null
  status?: string enum("scheduled" | "in_progress" | "completed" | "cancelled")
  priority?: string enum("low" | "medium" | "high" | "critical")
  scheduledDate?: string | null
  completedDate?: string | null
  cost?: number | null
  currency?: string
  technician?: string | null
  notes?: string | null
}
```

**Responses:**

- `200` — Updated
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string
      maintenanceType: string
      description: string | null
      status: string enum("scheduled" | "in_progress" | "completed" | "cancelled")
      priority: string enum("low" | "medium" | "high" | "critical")
      scheduledDate: string | null
      completedDate: string | null
      cost: number | null
      currency: string
      technician: string | null
      notes: string | null
      createdAt: string
      updatedAt: string
    }
}
```

---

### `DELETE /fleet/maintenance/records/{id}`

**Delete maintenance record**

**Path params:**
  - `id` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Deleted
```
{
  status: boolean
  message: string
  data:
    object {}
}
```

---

### `POST /fleet/maintenance/records/{id}/start`

**Start maintenance record**

**Path params:**
  - `id` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Started
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string
      maintenanceType: string
      description: string | null
      status: string enum("scheduled" | "in_progress" | "completed" | "cancelled")
      priority: string enum("low" | "medium" | "high" | "critical")
      scheduledDate: string | null
      completedDate: string | null
      cost: number | null
      currency: string
      technician: string | null
      notes: string | null
      createdAt: string
      updatedAt: string
    }
}
```
- `201` — _(no body)_

---

### `POST /fleet/maintenance/records/{id}/complete`

**Complete maintenance record**

**Path params:**
  - `id` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Completed
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string
      maintenanceType: string
      description: string | null
      status: string enum("scheduled" | "in_progress" | "completed" | "cancelled")
      priority: string enum("low" | "medium" | "high" | "critical")
      scheduledDate: string | null
      completedDate: string | null
      cost: number | null
      currency: string
      technician: string | null
      notes: string | null
      createdAt: string
      updatedAt: string
    }
}
```
- `201` — _(no body)_

---

### `POST /fleet/maintenance/reminders/send`

**Send maintenance reminders**

**Request body:** _none_

**Responses:**

- `200` — Reminders queued
```
{
  status: boolean
  message: string
  data:
    {
      queued: number
      message: string
    }
}
```
- `201` — _(no body)_

---

### `GET /fleet/compliance/documents`

**List compliance documents**

**Query params:**
  - `vehicleId` (string, optional)
  - `documentType` (string, optional)
  - `status` (string enum("valid" | "expiring" | "expired"), optional)
  - `search` (string, optional)

**Request body:** _none_

**Responses:**

- `200` — Compliance documents array
```
{
  status: boolean
  message: string
  data:
    [
      {
        id: string
        tenantId: string
        vehicleId: string | null
        documentType: string
        documentName: string
        issueDate: string | null
        expiryDate: string | null
        reminderDays: number
        fileUrl: string | null
        fileSize: number | null
        notes: string | null
        createdAt: string
        updatedAt: string
        status: string enum("valid" | "expiring" | "expired")
      }
    ]
}
```

---

### `POST /fleet/compliance/documents`

**Create compliance document**

**Request body** (required):

```
{
  vehicleId?: string | null
  documentType: string
  documentName: string
  issueDate?: string | null
  expiryDate?: string | null
  reminderDays?: number
  fileUrl?: string | null
  fileSize?: number | null
  notes?: string | null
}
```

**Responses:**

- `201` — Document created
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string | null
      documentType: string
      documentName: string
      issueDate: string | null
      expiryDate: string | null
      reminderDays: number
      fileUrl: string | null
      fileSize: number | null
      notes: string | null
      createdAt: string
      updatedAt: string
      status: string enum("valid" | "expiring" | "expired")
    }
}
```

---

### `GET /fleet/compliance/documents/summary`

**Compliance documents summary**

**Request body:** _none_

**Responses:**

- `200` — Summary counts
```
{
  status: boolean
  message: string
  data:
    {
      total: number
      valid: number
      expiringSoon: number
      expired: number
      complianceRatePercent: number
    }
}
```

---

### `GET /fleet/compliance/documents/export`

**Export compliance documents as CSV**

**Request body:** _none_

**Responses:**

- `200` — CSV file

---

### `PATCH /fleet/compliance/documents/{id}`

**Update compliance document**

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  vehicleId?: string | null
  documentType?: string
  documentName?: string
  issueDate?: string | null
  expiryDate?: string | null
  reminderDays?: number
  fileUrl?: string | null
  fileSize?: number | null
  notes?: string | null
}
```

**Responses:**

- `200` — Updated
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string | null
      documentType: string
      documentName: string
      issueDate: string | null
      expiryDate: string | null
      reminderDays: number
      fileUrl: string | null
      fileSize: number | null
      notes: string | null
      createdAt: string
      updatedAt: string
      status: string enum("valid" | "expiring" | "expired")
    }
}
```

---

### `DELETE /fleet/compliance/documents/{id}`

**Delete compliance document**

**Path params:**
  - `id` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Deleted
```
{
  status: boolean
  message: string
  data:
    object {}
}
```

---

### `POST /fleet/compliance/documents/{id}/upload`

**Set file URL for a compliance document**

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  fileUrl: string
  fileSize?: number
}
```

**Responses:**

- `200` — File URL updated
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string | null
      documentType: string
      documentName: string
      issueDate: string | null
      expiryDate: string | null
      reminderDays: number
      fileUrl: string | null
      fileSize: number | null
      notes: string | null
      createdAt: string
      updatedAt: string
      status: string enum("valid" | "expiring" | "expired")
    }
}
```
- `201` — _(no body)_

---

### `POST /fleet/compliance/documents/{id}/renew`

**Renew a compliance document**

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  expiryDate?: string
  fileUrl?: string
  fileSize?: number
}
```

**Responses:**

- `200` — Document renewed
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string | null
      documentType: string
      documentName: string
      issueDate: string | null
      expiryDate: string | null
      reminderDays: number
      fileUrl: string | null
      fileSize: number | null
      notes: string | null
      createdAt: string
      updatedAt: string
      status: string enum("valid" | "expiring" | "expired")
    }
}
```
- `201` — _(no body)_

---

### `PATCH /fleet/compliance/documents/{id}/reminder`

**Set reminder days for a compliance document**

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  reminderDays: number
}
```

**Responses:**

- `200` — Reminder updated
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string | null
      documentType: string
      documentName: string
      issueDate: string | null
      expiryDate: string | null
      reminderDays: number
      fileUrl: string | null
      fileSize: number | null
      notes: string | null
      createdAt: string
      updatedAt: string
      status: string enum("valid" | "expiring" | "expired")
    }
}
```

---

### `POST /fleet/compliance/reminders/send`

**Send compliance reminder emails**

**Request body:** _none_

**Responses:**

- `200` — Reminders queued
```
{
  status: boolean
  message: string
  data:
    {
      queued: number
      message: string
    }
}
```
- `201` — _(no body)_

---

### `POST /fleet/financials/profitability`

**Compute per-vehicle profitability**

**Request body** (required):

```
{
  periodMonths?: number
}
```

**Responses:**

- `200` — Profitability array
```
{
  status: boolean
  message: string
  data:
    [
      {
        vehicleId: string
        plateNumber: string
        revenue: number
        fuelCost: number
        maintenanceCost: number
        fixedCosts: number
        totalCost: number
        profit: number
        marginPercent: number
        tier: string enum("excellent" | "good" | "marginal" | "loss_making")
        jobCount: number
      }
    ]
}
```
- `201` — _(no body)_

---

### `GET /fleet/financials/summary`

**Fleet financial summary**

**Request body:** _none_

**Responses:**

- `200` — Financial summary
```
{
  status: boolean
  message: string
  data:
    {
      totalRevenue: number
      totalCost: number
      totalProfit: number
      avgMarginPercent: number
      vehicleCount: number
    }
}
```

---

### `GET /fleet/financials/configs`

**List financial configs**

**Request body:** _none_

**Responses:**

- `200` — Financial configs array
```
{
  status: boolean
  message: string
  data:
    [
      {
        id: string
        tenantId: string
        vehicleId: string
        monthlyWagesNgn: number | null
        monthlyInsuranceNgn: number | null
        monthlyDepreciationNgn: number | null
        monthlyOtherNgn: number | null
        createdAt: string
        updatedAt: string
      }
    ]
}
```

---

### `GET /fleet/financials/configs/{vehicleId}`

**Get financial config for a vehicle**

**Path params:**
  - `vehicleId` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Financial config
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string
      monthlyWagesNgn: number | null
      monthlyInsuranceNgn: number | null
      monthlyDepreciationNgn: number | null
      monthlyOtherNgn: number | null
      createdAt: string
      updatedAt: string
    }
}
```

---

### `PUT /fleet/financials/configs/{vehicleId}`

**Upsert financial config for a vehicle**

**Path params:**
  - `vehicleId` (string, required)

**Request body** (required):

```
{
  monthlyWagesNgn?: number | null
  monthlyInsuranceNgn?: number | null
  monthlyDepreciationNgn?: number | null
  monthlyOtherNgn?: number | null
}
```

**Responses:**

- `200` — Config upserted
```
{
  status: boolean
  message: string
  data:
    {
      id: string
      tenantId: string
      vehicleId: string
      monthlyWagesNgn: number | null
      monthlyInsuranceNgn: number | null
      monthlyDepreciationNgn: number | null
      monthlyOtherNgn: number | null
      createdAt: string
      updatedAt: string
    }
}
```

---

### `GET /fleet/financials/vehicle-pl/export`

**Export vehicle P&L as CSV**

**Request body:** _none_

**Responses:**

- `200` — CSV file

---

### `GET /fleet/financials/cost-breakdown/export`

**Export cost breakdown as CSV**

**Request body:** _none_

**Responses:**

- `200` — CSV file

---

### `GET /fleet/fuel/transactions`

**List fuel transactions (alias for /fuel/records)**

**Query params:**
  - `vehicleId` (string, optional)
  - `from` (string, optional)
  - `to` (string, optional)

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
        vehicleId: string
        driverId: string | null
        vehicleType: string | null
        liters: number
        pricePerLiter: number
        totalCost: number
        station: string | null
        odometer: number | null
        recordedAt: string
        recordedBy: string
        deletedAt: string | null
      }
    ]
}
```

---

### `GET /fleet/fuel/summary`

**Fuel summary stats**

**Request body:** _none_

**Responses:**

- `200` — Fuel summary
```
{
  status: boolean
  message: string
  data:
    {
      totalLitres: number
      totalCostNgn: number
      avgPricePerLitre: number
      transactionCount: number
    }
}
```

---

### `GET /fleet/reports/delivery-metrics`

**Delivery metrics — I05**

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      totalJobs: number
      delivered: number
      cancelled: number
      inProgress: number
      deliverySuccessRate: number
      averageCycleTimeMs: number | null
      vehicleUtilizationRate: number
      generatedAt: string
    }
}
```

---

### `GET /fleet/reports/export/{entity}`

**CSV export — I07**

**Path params:**
  - `entity` (string, required)

**Request body:** _none_

**Responses:**

- `200` — CSV file
```
string <binary>
```

---

### `GET /fleet/fuel`

**List fuel transactions — N02**

**Query params:**
  - `vehicleId` (string, optional)
  - `driverId` (string, optional)
  - `station` (string, optional)
  - `from` (string, optional)
  - `to` (string, optional)

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
        vehicleId: string
        driverId: string | null
        vehicleType: string | null
        liters: number
        pricePerLiter: number
        totalCost: number
        station: string | null
        odometer: number | null
        recordedAt: string
        recordedBy: string
        deletedAt: string | null
      }
    ]
}
```

---

### `POST /fleet/fuel`

**Record fuel transaction — N01**

**Request body** (required):

```
{
  vehicleId: string
  driverId?: string | null
  vehicleType?: string | null
  liters: number
  pricePerLiter: number
  station?: string | null
  odometer?: number | null
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
      tenantId: string
      vehicleId: string
      driverId: string | null
      vehicleType: string | null
      liters: number
      pricePerLiter: number
      totalCost: number
      station: string | null
      odometer: number | null
      recordedAt: string
      recordedBy: string
      deletedAt: string | null
    }
}
```

---

### `GET /fleet/fuel/metrics`

**Fuel consumption chart — N04**

**Query params:**
  - `period` (string enum("weekly" | "monthly"), optional)

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
        label: string
        liters: number
        totalCost: number
        records: number
      }
    ]
}
```

---

### `GET /fleet/fuel/efficiency`

**Vehicle fuel efficiency — N05**

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
        vehicleId: string
        kmPerLiter: number | null
        belowThreshold: boolean
        threshold: number | null
      }
    ]
}
```

---

### `GET /fleet/fuel/thresholds`

**Get fuel efficiency thresholds — N08**

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
        vehicleType: string
        minKmPerLiter: number
      }
    ]
}
```

---

### `GET /fleet/fuel/export`

**Export fuel transactions to CSV — N07**

**Request body:** _none_

**Responses:**

- `200` — CSV file
```
string <binary>
```

---

### `PATCH /fleet/fuel/{id}`

**Edit fuel transaction with audit trail — N03**

**Path params:**
  - `id` (string, required)

**Request body** (required):

```
{
  vehicleId?: string
  driverId?: string | null
  vehicleType?: string | null
  liters?: number
  pricePerLiter?: number
  station?: string | null
  odometer?: number | null
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
      tenantId: string
      vehicleId: string
      driverId: string | null
      vehicleType: string | null
      liters: number
      pricePerLiter: number
      totalCost: number
      station: string | null
      odometer: number | null
      recordedAt: string
      recordedBy: string
      deletedAt: string | null
    }
}
```

---

### `DELETE /fleet/fuel/{id}`

**Delete fuel transaction with audit trail — N03**

**Path params:**
  - `id` (string, required)

**Request body:** _none_

**Responses:**

- `200` — Deleted successfully
```
{
  status: boolean
  message: string
  data:
    object {}
}
```

---

### `PUT /fleet/fuel/thresholds/{vehicleType}`

**Set fuel efficiency threshold by vehicle type — N08**

**Path params:**
  - `vehicleType` (string, required)

**Request body** (required):

```
{
  minKmPerLiter: number
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
      vehicleType: string
      minKmPerLiter: number
    }
}
```

---

### `GET /fleet/documents`

**List documents for an entity — J01**

**Query params:**
  - `entityType` (string enum("job" | "vehicle" | "driver"), required)
  - `entityId` (string, required)

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
        entityType: string enum("job" | "vehicle" | "driver")
        entityId: string
        docType: string enum("pod" | "invoice" | "permit" | "other")
        filename: string
        contentType: string
        sizeBytes: number
        uploadedBy: string
        uploadedAt: string
        expiresAt: string | null
      }
    ]
}
```

---

### `POST /fleet/documents`

**Upload document — J01**

**Query params:**
  - `entityType` (string, required)
  - `entityId` (string, required)
  - `docType` (string, required)

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
      id: string
      tenantId: string
      entityType: string enum("job" | "vehicle" | "driver")
      entityId: string
      docType: string enum("pod" | "invoice" | "permit" | "other")
      filename: string
      contentType: string
      sizeBytes: number
      uploadedBy: string
      uploadedAt: string
      expiresAt: string | null
    }
}
```

---

### `GET /fleet/documents/{id}/download-url`

**Get secure download URL — J02**

**Path params:**
  - `id` (string, required)

**Request body:** _none_

**Responses:**

- `200` — 
```
{
  status: boolean
  message: string
  data:
    {
      url: string
      expiresIn: number
    }
}
```

---

### `GET /fleet/documents/{id}/access-log`

**Document access log — J04**

**Path params:**
  - `id` (string, required)

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
        docId: string
        action: string enum("upload" | "download")
        userId: string
        ip: string
        at: string
      }
    ]
}
```

---

### `GET /fleet/audit`

**Activity/audit log — M06**

**Query params:**
  - `entityType` (string enum("job" | "vehicle" | "driver" | "device" | "fuel" | "alert" | "document" | "geofence"), optional)
  - `entityId` (string, optional)
  - `action` (string, optional)
  - `limit` (number, optional)

**Request body:** _none_

**Responses:**

- `200` — Audit entries (newest first)
```
{
  status: boolean
  message: string
  data:
    [
      {
        id: string
        tenantId: string
        entityType: string enum("job" | "vehicle" | "driver" | "device" | "fuel" | "alert" | "document" | "geofence")
        entityId: string
        action: string
        actorId: string
        metadata:
          object {}
        occurredAt: string
      }
    ]
}
```

---

## Webhooks

### `POST /webhooks/cpaas`

**CPaaS inbound webhook — K01/K02**

**Request body** (required):

```
{
  From: string
  Body: string
  tenant_id?: string
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
      ok: boolean
    }
}
```
- `201` — _(no body)_

---

### `POST /webhooks/erp`

**ERP/TMS job sync webhook — K05**

**Request body** (required):

```
{
  externalId: string
  tenantId: string
  status: string enum("created" | "updated" | "cancelled")
  jobData:
    {
      referenceId?: string
      pickupAddress?: string
      dropoffAddress?: string
      scheduledAt?: string
      priority?: string
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
      ok: boolean
      jobId: string
    }
}
```
- `201` — _(no body)_

---

### `GET /webhooks/health`

**Integration health — K06**

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
        source: string
        lastReceived: string | null
        successCount: number
        failureCount: number
        healthy: boolean
      }
    ]
}
```

---
