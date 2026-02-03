# Vanilla (HTML/CSS/JS) version

This folder is a plain HTML/CSS/JS version of the existing GearGuard client UI.

- It does **not** modify the existing React app.
- It re-uses the original CSS at `client/src/styles.css` to keep styling identical.

## Run

1. Start the backend:
   - `cd server`
   - `npm install`
   - `npm start`

2. Open `vanilla/index.html` in a browser.

## Notes

- Routing uses hash routes (e.g. `#/login`, `#/app/requests`).
- API base URL defaults to `http://localhost:5000/api`.
  You can override it in DevTools console:
  - `localStorage.setItem('GEARGUARD_API_BASE_URL', 'http://localhost:5000/api')`
