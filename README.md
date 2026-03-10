<div align="center">

# 🛠️ GearGuard

### Intelligent Maintenance Management System

[![Live Demo](https://img.shields.io/badge/demo-live-success?style=for-the-badge)](https://gearguardodoo.vercel.app)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
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
- **Vite** 5.0.10 - Build Tool & Dev Server
- **React Router** 6.28.0 - Client-side Routing
- **Axios** 1.7.7 - HTTP Client

### Backend
- **Node.js** 20.x - Runtime Environment
- **Express** 4.18.2 - Web Framework
- **SQLite** (better-sqlite3 9.2.2) - Database
- **bcrypt** 5.1.1 - Password Hashing
- **nodemailer** 6.9.7 - Email Service
- **dotenv** 16.6.1 - Environment Variables

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.x or higher ([Download](https://nodejs.org/))
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

Create a `.env` file in the `server/` directory:
```env
# Server Configuration
PORT=5000

# Email Configuration (Gmail)
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

> **Note**: For Gmail, generate an [App Password](https://support.google.com/accounts/answer/185833)

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
- `POST /forget-password` – Sends reset link email
- `POST /reset-password` – Resets password

**Notes**
- Password rules enforced on signup/reset: min 8 chars, at least 1 uppercase, 1 lowercase, 1 special character.
- The forget-password email currently links to: `http://localhost:5173/reset-password?email=...`

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

- Authentication is currently **not token-based** (login returns user info only). If you need route protection, you can extend this with JWT/session handling.
- Email reset uses Gmail SMTP; you may need a Gmail **App Password** (recommended) instead of your account password.

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
