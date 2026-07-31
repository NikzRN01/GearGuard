# Installation Guide for Windows

## Supported runtime

GearGuard uses Node.js 22 LTS. The supported range is Node.js 22.12 or newer,
but lower than Node.js 23. The repository `.nvmrc` selects Node.js 22.23.1.

Verify the active runtime before installing dependencies:

```powershell
node --version
npm.cmd --version
where.exe node
```

If `node --version` does not show `v22.12.0` or newer, install the current
Node.js 22 LTS patch or select it with nvm-windows:

```powershell
nvm install 22.23.1
nvm use 22.23.1
```

Close and reopen PowerShell after changing Node installations.

## Backend installation

```powershell
cd A:\GearGuard\server
Copy-Item .env.example .env -ErrorAction SilentlyContinue
npm.cmd ci
npm.cmd start
```

Verify the backend in another terminal:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

## Frontend installation

Create `A:\GearGuard\client\.env` with:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Then run:

```powershell
cd A:\GearGuard\client
npm.cmd ci
npm.cmd run dev
```

Open `http://localhost:5173`.

## Native dependency troubleshooting

The project now uses a current `better-sqlite3` release with prebuilt binaries
for supported Node.js LTS versions. Visual Studio C++ Build Tools should not be
required on a standard Windows x64 Node.js 22 installation.

If installation still tries to compile `better-sqlite3` locally:

1. Confirm that Node.js is within the supported range.
2. Close programs that may be holding files under `node_modules`.
3. Remove the incomplete installation.
4. Reinstall from the lockfile.

```powershell
cd A:\GearGuard\server
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force -LiteralPath .\node_modules -ErrorAction SilentlyContinue
npm.cmd ci
```

SQLite remains suitable only for local development and disposable demos in the
current architecture. The product-readiness plan requires durable PostgreSQL
persistence before real customer data is accepted.
