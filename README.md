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
- **SQLite** (better-sqlite3 12.x) - Local/demo Database
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

**3. Configure Environment Variables**

Create a `.env` file in the `server/` directory (see `server/.env.example`):
```env
# Server Configuration
PORT=5000

# Public URL of the frontend; used for password reset links and CORS
APP_BASE_URL=http://localhost:5173

# Browser origins allowed to call this API (comma separated)
CORS_ALLOWED_ORIGINS=http://localhost:5173

# Email Configuration (Gmail)
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

> **Note**: For Gmail, generate an [App Password](https://support.google.com/accounts/answer/185833)
>
> **Deployment**: `CORS_ALLOWED_ORIGINS` must list your deployed frontend origin.
> The built-in default only allows `http://localhost:5173`, so browser calls from
> a deployed frontend will be blocked until you set it.

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
- Email reset uses Gmail SMTP; you may need a Gmail **App Password** (recommended) instead of your account password.
- SQLite is a single-file database. On Vercel it lives in `/tmp` and is wiped on
  every cold start, so deployed data is not durable.

---

## Testing

```bash
cd server && npm test    # 177 API, schema, migration and hardening tests
cd client && npm test    # 140 component, service and routing tests
```

The server suite runs against a throwaway SQLite file (`SQLITE_DB_PATH`) and a
no-op mail transport, so it never touches `portal.db` or sends real email.

---

## Scripts

### Server

```bash
cd server
npm run dev   # nodemon
npm start     # node
```

### Client

```bash
cd client
npm run dev
npm run build
npm run preview
```
