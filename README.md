<div align="center">

# 🛠️ GearGuard

### Intelligent Maintenance Management System

[![Live Demo](https://img.shields.io/badge/demo-live-success?style=for-the-badge)](https://gearguardodoo.vercel.app)
[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-ISC-blue?style=for-the-badge)](LICENSE)

**A comprehensive maintenance management portal built for the Odoo Virtual Hackathon**

[Features](#-features) • [Quick Start](#-quick-start) • [API Reference](#-api-reference) • [Demo](#-demo-accounts)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Demo Accounts](#-demo-accounts)
- [API Reference](#-api-reference)
- [User Roles](#-user-roles)
- [Deployment](#-deployment)

---

## 🎯 Overview

**GearGuard** is a modern, full-stack maintenance management system designed to streamline equipment maintenance workflows, team coordination, and preventive maintenance scheduling. Built with React and Node.js, it provides an intuitive interface for managing maintenance requests, tracking equipment health, and optimizing maintenance team operations.

### 🌟 Why GearGuard?

- **Centralized Management**: Single platform for all maintenance operations
- **Real-time Tracking**: Monitor maintenance requests from creation to completion
- **Team Collaboration**: Assign tasks, track progress, and manage maintenance teams
- **Preventive Maintenance**: Schedule and track preventive maintenance to reduce downtime
- **Work Center Integration**: Manage work centers and their alternative configurations
- **Calendar View**: Visual scheduling for maintenance activities

---

## ✨ Features

### 🔐 Authentication & User Management
- ✅ Secure user registration and login
- ✅ Role-based access control (Admin, Manager, Technician, User)
- ✅ Password reset via email
- ✅ Session management

### 📊 Dashboard & Analytics
- ✅ Real-time maintenance request overview
- ✅ Critical equipment monitoring
- ✅ Technician workload tracking
- ✅ Open requests summary
- ✅ Role-specific dashboards (Manager vs Technician views)

### 🔧 Maintenance Request Management
- ✅ Create corrective and preventive maintenance requests
- ✅ Link requests to equipment or work centers
- ✅ Status workflow: New → In Progress → Repaired/Scrap
- ✅ Assign requests to technicians
- ✅ Add notes and track duration
- ✅ Filter by status, type, team, and date

### 📅 Maintenance Calendar
- ✅ Week and month views
- ✅ Visual scheduling of preventive maintenance
- ✅ Date range filtering

### 🏭 Equipment Management
- ✅ Track machines and tools inventory
- ✅ Serial number management
- ✅ Department and location tracking
- ✅ Warranty tracking
- ✅ Assign maintenance teams to equipment
- ✅ Equipment categorization

### 👥 Team Management
- ✅ Create and manage maintenance teams
- ✅ Add/remove team members
- ✅ Role-based team assignments
- ✅ View team workload

### 🏢 Work Center Management
- ✅ Define work centers with operational metrics
- ✅ Track cost per hour and capacity
- ✅ Monitor time efficiency and OEE targets
- ✅ Configure alternative work centers

---

## 🛠️ Tech Stack

### Frontend
- **React** 18.3.1 - UI Framework
- **Vite** 8.2.x - Build Tool & Dev Server
- **React Router** 7.18.x - Client-side Routing
- **Axios** 1.19.x - HTTP Client

### Backend
- **Node.js** 22 LTS (22.12 or newer) - Runtime Environment
- **Express** 4.22.x - Web Framework
- **PostgreSQL** (pg 8.x) - Database, hosted on [Neon](https://neon.tech)
- **Versioned SQL migrations** - forward-only, transactional, checksum-verified
- **bcrypt** 6.x - Password Hashing
- **nodemailer** 9.x - Email Service
- **dotenv** 17.x - Environment Variables

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 22 LTS, version 22.12 or newer ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/yourusername/gearguard.git
cd gearguard
```

**2. Set up the Backend**
```bash
cd server
npm install
```

**3. Start a PostgreSQL database**

For local development, a disposable container:

```bash
docker run -d --name gearguard-pg \
  -e POSTGRES_USER=gearguard -e POSTGRES_PASSWORD=gearguard -e POSTGRES_DB=gearguard \
  -p 55432:5432 postgres:16-alpine
```

For a hosted database, create a project at [Neon](https://neon.tech) and copy
the connection string. Neon gives each branch two endpoints, and the difference
matters:

| Endpoint | Host | Use it for |
|---|---|---|
| **Pooled** | `ep-xxxx-pooler.…` | Normal running, especially serverless — PgBouncer keeps many short-lived instances from exhausting the branch's connection ceiling |
| **Direct** | `ep-xxxx.…` | Anything setting `DB_SCHEMA`, including the test suite |

The pooled endpoint runs PgBouncer in transaction mode, which refuses startup
parameters that would outlive a single transaction — `search_path` among them.
So a schema-scoped connection must use the direct endpoint. The server checks
this at startup and says so, rather than letting the driver fail with a bare
`08P01` on the first query. Migrations work on either, because the runner takes
a *transaction*-scoped advisory lock for exactly this reason.

**4. Configure Environment Variables**

Create a `.env` file in the `server/` directory (see `server/.env.example`):
```env
# PostgreSQL connection string - REQUIRED, the server will not start without it.
# Local container:
DATABASE_URL=postgresql://gearguard:gearguard@127.0.0.1:55432/gearguard
# Neon:
# DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/DB?sslmode=require

# Server Configuration
PORT=5000

# Public URL of the frontend; used for password reset links and CORS
CLIENT_URL=http://localhost:5173

# Browser origins allowed to call this API (comma separated)
CORS_ALLOWED_ORIGINS=http://localhost:5173

# Email Configuration (Gmail)
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

Migrations run automatically on startup; there is no separate migrate step.

> **Note**: For Gmail, generate an [App Password](https://support.google.com/accounts/answer/185833)
>
> **Deployment**: `CORS_ALLOWED_ORIGINS` must list your deployed frontend origin.
> The built-in default only allows `http://localhost:5173`, so browser calls from
> a deployed frontend will be blocked until you set it.
>
> **First admin**: automatic demo seeding is refused in production. Either set
> `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` for the first boot to
> create a real administrator, or run `npm run seed:demo` to provision the
> public demo accounts deliberately (see [Demo accounts](#-demo-accounts)).

**4. Start the Backend Server**
```bash
npm run dev    # Development mode with auto-reload
# OR
npm start      # Production mode
```

Server runs at `http://localhost:5000`

**5. Set up the Frontend** (in a new terminal)
```bash
cd client
npm install
```

**6. Configure Frontend Environment** (Optional)

Create a `.env` file in the `client/` directory:
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

**7. Start the Frontend**
```bash
npm run dev
```

App opens at `http://localhost:5173`

### 🎉 You're Ready!

Visit `http://localhost:5173` and create your first account!

---

## 🎭 Demo Accounts

One account per role, all sharing the same password:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@demo.com` | `Password123!` |
| Manager | `manager@demo.com` | `Password123!` |
| Technician | `technician@demo.com` | `Password123!` |
| Requester | `user@demo.com` | `Password123!` |

Provision them on any environment with:

```bash
cd server
npm run seed:demo -- --reset    # --reset removes every existing account first
```

`--reset` also deletes maintenance requests, notes, team memberships and
sessions, because a request cannot outlive the account that raised it. Audit
history is kept, with its actors anonymised — deleting the record of what
happened is the wrong default even on a demo. Override the password with
`DEMO_PASSWORD`; it must satisfy the normal account policy.

> ⚠️ These credentials are public. Never run this against a deployment holding
> real accounts or real data. The automatic startup seed remains barred in
> production regardless — this command is the only supported way in, and it
> only runs when somebody chooses to run it.

---

## API Overview (Backend)

Base URL (local): `http://localhost:5000/api`

### Auth (`/api/auth`)

- `POST /signup` – Create user
- `POST /login` – Login (returns user info)
- `POST /forget-password` – Issues a single-use reset token and emails the link
- `POST /reset-password` – Resets password (requires `email`, `token`, `newPassword`, `confirmPassword`)

**Notes**
- Password rules enforced on signup/reset: min 8 chars, at least 1 uppercase, 1 lowercase, 1 special character.
- `POST /reset-password` **requires the token** from the emailed link. Knowing an
  email address is not sufficient to change a password.
- Reset tokens are stored only as a SHA-256 hash, expire after 1 hour, are
  single-use, and are invalidated when a newer one is issued.
- The reset link is built from `APP_BASE_URL`: `${APP_BASE_URL}/reset-password?email=...&token=...`
- `POST /login` returns **401** for both an unknown account and a wrong password,
  and `POST /forget-password` always returns 200. Neither reveals whether an
  email address is registered.

### Equipment (`/api/equipment`)

- `GET /` – List equipment (supports `department`, `employee`, `status` query params)
- `GET /:id` – Get equipment by id
- `POST /` – Create equipment
- `PUT /:id` – Update equipment
- `DELETE /:id` – Delete equipment (blocked if maintenance requests exist)

### Teams (`/api/teams`)

- `GET /` – List teams (includes member count)
- `GET /:id` – Get team + members
- `POST /` – Create team
- `PUT /:id` – Update team
- `DELETE /:id` – Delete team (blocked if assigned to equipment)
- `POST /:id/members` – Add member to team
- `DELETE /:id/members/:userId` – Remove member from team
- `GET /:id/available-users` – List available technicians/managers not in the team

### Maintenance Requests (`/api/maintenance`)

- `GET /` – List requests (filters: `status`, `type`, `team_id`, `assigned_to`, `scheduled_date`)
- `GET /calendar` – Calendar view (filters: `start_date`, `end_date`)
- `GET /:id` – Request details + notes
- `POST /` – Create request
  - Requires: `type`, `subject`, `created_by_user_id` and **exactly one of** `equipment_id` or `work_center_id`
  - If equipment has a maintenance team, it can auto-fill `team_id`
- `PATCH /:id/assign` – Assign to technician/manager
- `PATCH /:id/status` – Update status (`new -> in_progress -> repaired/scrap`)
- `POST /:id/notes` – Add notes

### Work Centers (`/api/work-centers`)

- `GET /` – List work centers (filters: `status`, `search`)
- `GET /:id` – Work center + alternatives
- `POST /` – Create work center
- `PUT /:id` – Update work center
- `DELETE /:id` – Deactivate work center (soft delete)
- `GET /:id/alternatives` – List alternatives
- `POST /:id/alternatives` – Add alternative link
- `DELETE /:id/alternatives/:altId` – Remove alternative link

---

## Notes / Limitations

- **The API is authenticated and role-checked server-side.** Login sets an
  opaque `HttpOnly` session cookie (only its SHA-256 hash is stored); every
  route outside `/api/auth` runs through `authenticate` + `requireCsrf`, and
  each router applies `authorize(...)` on top. Row visibility is scoped in SQL,
  so a technician sees only their assigned requests and a plain user only the
  ones they raised — query parameters cannot widen it. Role checks in the React
  app are navigational convenience layered on this, not the boundary itself.
  See [`server/RBAC.md`](server/RBAC.md) for the full capability matrix.
- **Demo accounts are never created automatically in a deployment.** They share
  a password published in this repository, so the startup seed is refused
  outright whenever `NODE_ENV=production` or the platform sets `VERCEL` — and no
  environment variable can switch it back on. A deployment gets accounts one of
  two deliberate ways:
  - **A real administrator**: set `BOOTSTRAP_ADMIN_EMAIL` and
    `BOOTSTRAP_ADMIN_PASSWORD` for one boot, sign in, change the password, then
    remove them. This only runs when the database has no admin at all, so it
    cannot add a second one or reset an existing account.
  - **The public demo accounts**: run `npm run seed:demo` by hand. An operator
    running a command knowing what it does is a different thing from a server
    creating a backdoor on every boot, which is why the startup guard stays
    closed and this is a separate, explicit step.
- Email reset uses Gmail SMTP; you may need a Gmail **App Password** (recommended) instead of your account password.
- Schema changes are **forward-only SQL migrations** in `server/migrations`,
  applied at startup inside one transaction under an advisory lock, so several
  instances booting at once cannot race. An applied file that later changes on
  disk is refused rather than silently skipped — add a new file instead.
- `cost_per_hour` and the other work-centre metrics are `double precision`
  rather than `numeric`. `numeric` is the right type for money, but node-postgres
  returns it as a *string* to protect precision, which would change every API
  response shape — a deliberate follow-up, not a silent change.

---

## Testing

```bash
cd server && npm test    # 205 API, schema, migration and hardening tests
cd client && npm test    # 150 component, service and routing tests
```

The server suite needs a PostgreSQL instance. A disposable one:

```bash
docker run -d --name gearguard-pg \
  -e POSTGRES_USER=gearguard -e POSTGRES_PASSWORD=gearguard -e POSTGRES_DB=gearguard \
  -p 55432:5432 postgres:16-alpine
```

That is the default the harness connects to; point `TEST_DATABASE_URL` elsewhere
to override it. Each test file runs its own migrations inside a uniquely named
`test_*` schema and drops it afterwards, so files can run concurrently and no
run can touch real tables. Mail uses a no-op transport, so no run sends email.

> Use `127.0.0.1`, not `localhost`, in connection strings on Windows: `localhost`
> resolves to `::1` first and Docker publishes ports on IPv4 only, so the IPv6
> attempt hangs until it times out.

---

## Scripts

### Server

```bash
cd server
npm run dev              # nodemon
npm start                # node
npm run seed:demo        # create the demo accounts (add -- --reset to wipe first)
npm test                 # needs a PostgreSQL instance
npm run lint
```

### Client

```bash
cd client
npm run dev
npm run build
npm run preview
```
