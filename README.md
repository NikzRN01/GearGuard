# GearGuard

GearGuard is a simple maintenance management portal built for the Odoo Virtual Hackathon.

https://gearguardodoo.vercel.app
 
It consists of:
- **Client**: React + Vite (UI)
- **Server**: Node.js + Express + SQLite (API + persistence)

---

## Tech Stack

**Frontend**
- React 18
- Vite
- React Router
- Axios

**Backend**
- Express
- SQLite (via `better-sqlite3`)
- bcrypt (password hashing)
- nodemailer (password reset email)
- dotenv (environment variables)

---

## Project Structure

```
client/   # Vite + React app
server/   # Express API + SQLite database
```

---

## Prerequisites

- Node.js 18+ recommended
- npm

---

## Getting Started (Local Development)

### 1) Backend (Express API)

From the repository root:

```bash
cd server
npm install
```

Create a `.env` file inside `server/`:

```env
# Server
PORT=5000

# Email (used for password reset)
# NOTE: Uses Gmail transport in current code.
SMTP_USER=your_gmail_address@gmail.com
SMTP_PASS=your_gmail_app_password
```

Start the API:

```bash
npm run dev
# or
npm start
```

Health check:

- `GET http://localhost:5000/api/health`

> The SQLite database file is created automatically at `server/portal.db` on first run.

---

### 2) Frontend (React + Vite)

From the repository root:

```bash
cd client
npm install
```

(Optional) Configure API base URL. Create `client/.env`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Start the UI:

```bash
npm run dev
```

By default, Vite runs at:
- `http://localhost:5173`

---

## App Routes (Frontend)

The client uses React Router:

- `/login` – Login
- `/signup` – Signup
- `/reset-password` – Reset Password page
- `/app` – Main authenticated layout
  - `/app` – Dashboard
  - `/app/calendar` – Maintenance Calendar
  - `/app/equipment/work-center` – Work Centers
  - `/app/equipment/machine-tools` – Machines & Tools
  - `/app/requests` – Maintenance Requests
  - `/app/teams` – Teams

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
