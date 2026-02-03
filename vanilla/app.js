// Vanilla HTML/CSS/JS version of the existing React client.
// Routing is hash-based so it works as a static file.

const root = document.getElementById('root');

const API_BASE_URL = () => localStorage.getItem('GEARGUARD_API_BASE_URL') || 'http://localhost:5000/api';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getSessionUser() {
  try {
    const raw = sessionStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSessionUser(user) {
  sessionStorage.setItem('user', JSON.stringify(user));
}

function clearSessionUser() {
  sessionStorage.removeItem('user');
}

function buildUrl(path, params) {
  const url = new URL(API_BASE_URL() + path);
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function apiRequest(method, path, { body, params } = {}) {
  const url = buildUrl(path, params);
  const headers = { 'Content-Type': 'application/json' };
  const options = {
    method,
    headers,
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let resp;
  try {
    resp = await fetch(url, options);
  } catch (e) {
    const err = new Error('Unable to connect to server. Please check your connection.');
    err.code = 'ERR_NETWORK';
    throw err;
  }

  let data;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }

  if (!resp.ok) {
    const err = new Error(data?.message || `Request failed (${resp.status})`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }

  return data;
}

const api = {
  get: (path, params) => apiRequest('GET', path, { params }),
  post: (path, body) => apiRequest('POST', path, { body }),
  patch: (path, body) => apiRequest('PATCH', path, { body }),
};

function parseHashRoute() {
  // Supports: #/path?query
  const raw = (location.hash || '').replace(/^#/, '');
  if (!raw) return { path: '/login', query: new URLSearchParams() };
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const query = new URLSearchParams(queryPart || '');
  return { path, query };
}

function navigate(path) {
  if (!path.startsWith('/')) path = `/${path}`;
  location.hash = `#${path}`;
}

function authCardHtml({ title, subtitle, isLogin, className, bodyHtml }) {
  return `
    <div class="auth-layout">
      <div class="auth-backdrop" aria-hidden="true">
        <span class="orb orb-a"></span>
        <span class="orb orb-b"></span>
        <span class="orb orb-c"></span>
      </div>

      <div class="auth-card ${escapeHtml(className || '')}">
        <div class="card-header">
          <div class="brand">GearGuard</div>
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="card-subtitle">${escapeHtml(subtitle)}</p>` : ''}
        </div>

        <div class="auth-switch">
          ${isLogin
            ? `Don't have an account? <a href="#/signup">Sign up</a>`
            : `Already have an account? <a href="#/login">Sign in</a>`}
        </div>

        ${bodyHtml}
      </div>

      <p class="caption">Secure equipment management for operations teams.</p>
    </div>
  `;
}

function appShellHtml({ outletHtml, currentPath }) {
  const isEquipmentPage = currentPath.startsWith('/app/equipment');
  return `
    <div class="app-layout">
      <div class="auth-backdrop" aria-hidden="true">
        <span class="orb orb-a"></span>
        <span class="orb orb-b"></span>
        <span class="orb orb-c"></span>
      </div>

      <aside class="app-sidebar">
        <div class="brand" style="margin-top: 4px">GearGuard</div>

        <a href="#/app" data-nav="/app">Home</a>
        <a href="#/app/calendar" data-nav="/app/calendar">Maintenance Calendar</a>

        <details class="sidebar-dropdown" ${isEquipmentPage ? 'open' : ''}>
          <summary>
            <span>Equipment</span>
            <span class="sidebar-caret" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7.25 4.75L12.5 10L7.25 15.25" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
          </summary>
          <div class="sidebar-submenu">
            <a href="#/app/equipment/work-center" data-nav="/app/equipment/work-center">Work Center</a>
            <a href="#/app/equipment/machine-tools" data-nav="/app/equipment/machine-tools">Machine &amp; Tools</a>
          </div>
        </details>

        <a href="#/app/requests" data-nav="/app/requests">Requests</a>
        <a href="#/app/teams" data-nav="/app/teams">Teams</a>
      </aside>

      <main class="app-main">
        ${outletHtml}
      </main>
    </div>
  `;
}

function setActiveSidebar(currentPath) {
  const links = root.querySelectorAll('.app-sidebar a[data-nav]');
  for (const a of links) {
    const nav = a.getAttribute('data-nav');
    const isActive = nav === currentPath;
    a.classList.toggle('active', isActive);
    if (isActive) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  // Special: make Home active for /app and /app/
  const home = root.querySelector('.app-sidebar a[data-nav="/app"]');
  if (home && (currentPath === '/app' || currentPath === '/app/')) {
    home.classList.add('active');
    home.setAttribute('aria-current', 'page');
  }
}

function mount(html) {
  root.innerHTML = html;
}

function mountAlert(selector, message) {
  const el = root.querySelector(selector);
  if (!el) return;
  if (!message) {
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }
  el.textContent = message;
  el.style.display = '';
}

function openModal(modalHtml, { onClose } = {}) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = modalHtml.trim();
  const overlay = wrapper.firstElementChild;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    onClose?.();
  };

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });

  const closeBtn = overlay.querySelector('[data-modal-close]');
  if (closeBtn) closeBtn.addEventListener('click', close);

  return { close, overlay };
}

function requireLogin() {
  const user = getSessionUser();
  if (!user) {
    navigate('/login');
    return null;
  }
  return user;
}

// ---------------------- Auth pages ----------------------

function renderLogin() {
  const html = authCardHtml({
    title: 'Welcome Back',
    subtitle: 'Sign in to manage equipment and track maintenance',
    isLogin: true,
    className: '',
    bodyHtml: `
      <form class="auth-form" id="loginForm">
        <div class="input-group">
          <label for="loginEmail">Email Address</label>
          <input id="loginEmail" type="email" placeholder="you@company.com" autocomplete="email" required />
        </div>

        <div class="input-group">
          <label for="loginPassword">Password</label>
          <div class="password-input">
            <input id="loginPassword" type="password" placeholder="Enter your password" autocomplete="current-password" required />
            <button type="button" class="password-toggle" id="toggleLoginPassword" aria-label="Show password">
              <svg id="eyeOpen" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
                <path d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7Z"/>
                <circle cx="10" cy="10" r="3"/>
              </svg>
              <svg id="eyeClosed" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20" style="display:none">
                <path d="M3.98 8.223A10.477 10.477 0 0 0 1 10c.73 2.89 4 7 9 7 1.59 0 3.07-.44 4.38-1.21M6.66 6.61A8.885 8.885 0 0 1 10 6c5 0 8.27 4.11 9 7a11.5 11.5 0 0 1-1.02 1.74M13.34 13.39A3 3 0 1 1 6.66 6.61"/>
                <line x1="1" y1="1" x2="19" y2="19"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="alert alert-error" id="loginError" role="alert" style="display:none"></div>

        <div class="form-footer">
          <label class="checkbox">
            <input type="checkbox" id="rememberMe" />
            Remember me
          </label>
          <button type="button" class="link-btn" id="forgotPasswordBtn">Forgot password?</button>
        </div>

        <button type="submit" class="btn-primary" id="loginSubmit">
          Sign In
        </button>
      </form>
    `,
  });

  mount(html);

  const emailEl = root.querySelector('#loginEmail');
  const pwEl = root.querySelector('#loginPassword');
  const errorEl = root.querySelector('#loginError');
  const submitBtn = root.querySelector('#loginSubmit');

  const toggleBtn = root.querySelector('#toggleLoginPassword');
  toggleBtn.addEventListener('click', () => {
    const isText = pwEl.type === 'text';
    pwEl.type = isText ? 'password' : 'text';
    root.querySelector('#eyeOpen').style.display = isText ? '' : 'none';
    root.querySelector('#eyeClosed').style.display = isText ? 'none' : '';
    toggleBtn.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
  });

  root.querySelector('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    errorEl.textContent = '';

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Signing in...';

    try {
      const data = await api.post('/auth/login', {
        email: emailEl.value,
        password: pwEl.value,
      });

      if (data?.success) {
        setSessionUser(data.user);
        navigate('/app');
      } else {
        errorEl.textContent = data?.message || 'Login failed';
        errorEl.style.display = '';
        root.querySelector('.auth-card')?.classList.add('animate-shake');
      }
    } catch (err) {
      let msg = err?.message || 'Login failed. Please try again.';
      if (err?.code === 'ERR_NETWORK') msg = 'Unable to connect to server. Please check your connection.';
      if (err?.status === 401) msg = 'Invalid email or password. Please try again.';
      if (err?.status === 404) msg = 'Account not found. Please sign up first.';
      errorEl.textContent = msg;
      errorEl.style.display = '';
      root.querySelector('.auth-card')?.classList.add('animate-shake');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });

  root.querySelector('#forgotPasswordBtn').addEventListener('click', () => {
    const modal = openModal(
      `
      <div class="modal-overlay" role="dialog" aria-modal="true">
        <div class="modal-content">
          <button class="modal-close" type="button" data-modal-close>×</button>
          <h3>Reset Password</h3>
          <p>Enter your email address and we'll send you a link to reset your password.</p>

          <form id="forgotForm">
            <input type="email" placeholder="you@company.com" class="modal-input" id="forgotEmail" required />
            <div class="alert alert-error" id="forgotError" style="margin-top: 10px; display:none"></div>
            <div class="alert alert-success" id="forgotSuccess" style="margin-top: 10px; display:none"></div>

            <div class="modal-actions">
              <button type="button" class="btn-secondary" data-modal-close>Cancel</button>
              <button type="submit" class="btn-accent" id="forgotSubmit">Send Reset Link</button>
            </div>
          </form>
        </div>
      </div>
      `
    );

    const form = modal.overlay.querySelector('#forgotForm');
    const email = modal.overlay.querySelector('#forgotEmail');
    const submit = modal.overlay.querySelector('#forgotSubmit');
    const errEl = modal.overlay.querySelector('#forgotError');
    const okEl = modal.overlay.querySelector('#forgotSuccess');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.style.display = 'none';
      okEl.style.display = 'none';

      submit.disabled = true;
      submit.innerHTML = '<span class="spinner"></span> Sending...';

      try {
        const data = await api.post('/auth/forget-password', { email: email.value });
        if (data?.success) {
          okEl.textContent = 'Password reset email sent! Please check your inbox.';
          okEl.style.display = '';
          setTimeout(() => modal.close(), 1500);
        } else {
          errEl.textContent = data?.message || 'Failed to send reset email';
          errEl.style.display = '';
        }
      } catch (err) {
        let msg = err?.message || 'Failed to send reset email. Please try again.';
        if (err?.code === 'ERR_NETWORK') msg = 'Unable to connect to server. Please check your connection.';
        if (err?.status === 404) msg = 'No account found with this email address.';
        errEl.textContent = msg;
        errEl.style.display = '';
      } finally {
        submit.disabled = false;
        submit.textContent = 'Send Reset Link';
      }
    });
  });
}

function computePasswordStrength(password) {
  if (!password) return { label: '', score: 0, color: '' };
  const checks = [/[A-Z]/, /[a-z]/, /\d/, /[^\w]/];
  const score = checks.reduce((acc, r) => acc + (r.test(password) ? 1 : 0), 0) + (password.length >= 10 ? 1 : 0);
  if (score >= 4) return { label: 'Strong', score, color: 'green' };
  if (score === 3) return { label: 'Good', score, color: 'blue' };
  if (score === 2) return { label: 'Fair', score, color: 'amber' };
  return { label: 'Weak', score, color: 'red' };
}

function renderSignup() {
  const html = authCardHtml({
    title: 'Create Account',
    subtitle: 'Join your team',
    isLogin: false,
    className: '',
    bodyHtml: `
      <form class="auth-form" id="signupForm">
        <div class="signup-grid">
          <div class="input-group">
            <label for="signupName">Full Name</label>
            <input id="signupName" type="text" placeholder="John Doe" autocomplete="name" required />
          </div>
          <div class="input-group">
            <label for="signupEmail">Email Address</label>
            <input id="signupEmail" type="email" placeholder="you@company.com" autocomplete="email" required />
          </div>
        </div>

        <div class="input-group">
          <label for="signupPassword">Password</label>
          <div class="password-input">
            <input id="signupPassword" type="password" placeholder="Create a strong password" autocomplete="new-password" minlength="8" required />
            <button type="button" class="password-toggle" id="toggleSignupPassword" aria-label="Show password">
              <svg id="eyeOpen2" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
                <path d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7Z"/>
                <circle cx="10" cy="10" r="3"/>
              </svg>
              <svg id="eyeClosed2" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20" style="display:none">
                <path d="M3.98 8.223A10.477 10.477 0 0 0 1 10c.73 2.89 4 7 9 7 1.59 0 3.07-.44 4.38-1.21M6.66 6.61A8.885 8.885 0 0 1 10 6c5 0 8.27 4.11 9 7a11.5 11.5 0 0 1-1.02 1.74M13.34 13.39A3 3 0 1 1 6.66 6.61"/>
                <line x1="1" y1="1" x2="19" y2="19"/>
              </svg>
            </button>
          </div>

          <div class="password-requirements" id="pwReq" style="display:none">
            <div class="req-unmet" data-req="length">10+ chars</div>
            <div class="req-unmet" data-req="uppercase">Uppercase</div>
            <div class="req-unmet" data-req="lowercase">Lowercase</div>
            <div class="req-unmet" data-req="number">Number</div>
            <div class="req-unmet" data-req="special">Special</div>
          </div>

          <div class="strength-indicator" id="pwStrength" style="display:none">
            <div class="strength-bar">
              <span class="strength-segment" data-seg="1"></span>
              <span class="strength-segment" data-seg="2"></span>
              <span class="strength-segment" data-seg="3"></span>
              <span class="strength-segment" data-seg="4"></span>
              <span class="strength-segment" data-seg="5"></span>
            </div>
            <span class="strength-label" id="pwStrengthLabel"></span>
          </div>
        </div>

        <div class="input-group">
          <label for="signupConfirm">Confirm Password</label>
          <div class="password-input">
            <input id="signupConfirm" type="password" placeholder="Re-enter your password" autocomplete="new-password" required />
            <button type="button" class="password-toggle" id="toggleSignupConfirm" aria-label="Show password">
              <svg id="eyeOpen3" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
                <path d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7Z"/>
                <circle cx="10" cy="10" r="3"/>
              </svg>
              <svg id="eyeClosed3" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20" style="display:none">
                <path d="M3.98 8.223A10.477 10.477 0 0 0 1 10c.73 2.89 4 7 9 7 1.59 0 3.07-.44 4.38-1.21M6.66 6.61A8.885 8.885 0 0 1 10 6c5 0 8.27 4.11 9 7a11.5 11.5 0 0 1-1.02 1.74M13.34 13.39A3 3 0 1 1 6.66 6.61"/>
                <line x1="1" y1="1" x2="19" y2="19"/>
              </svg>
            </button>
          </div>
          <small class="input-feedback" id="pwMatch" style="display:none"></small>
        </div>

        <div class="alert alert-error" id="signupError" role="alert" style="display:none"></div>
        <div class="alert alert-success" id="signupSuccess" role="alert" style="display:none"></div>

        <button type="submit" class="btn-primary" id="signupSubmit" disabled>
          Create Account
        </button>
      </form>
    `,
  });

  mount(html);

  const nameEl = root.querySelector('#signupName');
  const emailEl = root.querySelector('#signupEmail');
  const pwEl = root.querySelector('#signupPassword');
  const confirmEl = root.querySelector('#signupConfirm');
  const submitBtn = root.querySelector('#signupSubmit');
  const errEl = root.querySelector('#signupError');
  const okEl = root.querySelector('#signupSuccess');

  function togglePassword(input, openId, closedId, btn) {
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    root.querySelector(openId).style.display = isText ? '' : 'none';
    root.querySelector(closedId).style.display = isText ? 'none' : '';
    btn.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
  }

  root.querySelector('#toggleSignupPassword').addEventListener('click', (e) => {
    togglePassword(pwEl, '#eyeOpen2', '#eyeClosed2', e.currentTarget);
  });
  root.querySelector('#toggleSignupConfirm').addEventListener('click', (e) => {
    togglePassword(confirmEl, '#eyeOpen3', '#eyeClosed3', e.currentTarget);
  });

  function updatePwUi() {
    const pw = pwEl.value;
    const reqWrap = root.querySelector('#pwReq');
    const strengthWrap = root.querySelector('#pwStrength');

    if (!pw) {
      reqWrap.style.display = 'none';
      strengthWrap.style.display = 'none';
    } else {
      reqWrap.style.display = '';
      strengthWrap.style.display = '';

      const reqs = {
        length: pw.length >= 10,
        uppercase: /[A-Z]/.test(pw),
        lowercase: /[a-z]/.test(pw),
        number: /\d/.test(pw),
        special: /[^\w]/.test(pw),
      };

      for (const [key, ok] of Object.entries(reqs)) {
        const el = reqWrap.querySelector(`[data-req="${key}"]`);
        if (!el) continue;
        el.classList.toggle('req-met', ok);
        el.classList.toggle('req-unmet', !ok);
      }

      const strength = computePasswordStrength(pw);
      strengthWrap.className = `strength-indicator strength-${strength.color}`;
      root.querySelector('#pwStrengthLabel').textContent = strength.label;
      const segs = strengthWrap.querySelectorAll('.strength-segment');
      for (const seg of segs) {
        const n = Number(seg.getAttribute('data-seg'));
        seg.classList.toggle('active', n <= strength.score);
      }
    }

    const matchEl = root.querySelector('#pwMatch');
    const hasConfirm = Boolean(confirmEl.value);
    const match = confirmEl.value && confirmEl.value === pw;

    if (!hasConfirm) {
      matchEl.style.display = 'none';
      matchEl.textContent = '';
      matchEl.className = 'input-feedback';
    } else {
      matchEl.style.display = '';
      matchEl.className = `input-feedback ${match ? 'success' : 'error'}`;
      matchEl.textContent = match ? 'Passwords match' : 'Passwords do not match';
    }

    submitBtn.disabled = !(pw && match);
  }

  pwEl.addEventListener('input', updatePwUi);
  confirmEl.addEventListener('input', updatePwUi);
  updatePwUi();

  root.querySelector('#signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.style.display = 'none';
    okEl.style.display = 'none';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailEl.value)) {
      errEl.textContent = 'Invalid email format';
      errEl.style.display = '';
      root.querySelector('.auth-card')?.classList.add('animate-shake');
      return;
    }
    if (pwEl.value !== confirmEl.value) {
      errEl.textContent = 'Passwords do not match';
      errEl.style.display = '';
      root.querySelector('.auth-card')?.classList.add('animate-shake');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Creating account...';

    try {
      const data = await api.post('/auth/signup', {
        name: nameEl.value,
        email: emailEl.value,
        password: pwEl.value,
        reEnterPassword: confirmEl.value,
      });

      if (data?.success) {
        let countdown = 3;
        okEl.textContent = `Account created successfully! Redirecting in ${countdown}...`;
        okEl.style.display = '';
        root.querySelector('.auth-card')?.classList.add('animate-success');

        const timer = setInterval(() => {
          countdown -= 1;
          if (countdown <= 0) {
            clearInterval(timer);
            navigate('/login');
            return;
          }
          okEl.textContent = `Account created successfully! Redirecting in ${countdown}...`;
        }, 1000);
      } else {
        errEl.textContent = data?.message || 'Signup failed';
        errEl.style.display = '';
        root.querySelector('.auth-card')?.classList.add('animate-shake');
      }
    } catch (err) {
      let msg = err?.message || 'Signup failed. Please try again.';
      if (err?.code === 'ERR_NETWORK') msg = 'Unable to connect to server. Please check your connection.';
      if (err?.status === 409) msg = 'This email is already registered. Please sign in instead.';
      if (err?.status === 400) msg = err?.data?.message || 'Invalid input. Please check your details.';
      errEl.textContent = msg;
      errEl.style.display = '';
      root.querySelector('.auth-card')?.classList.add('animate-shake');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
      updatePwUi();
    }
  });
}

function renderResetPassword(query) {
  const emailParam = query.get('email') || '';

  const html = authCardHtml({
    title: 'Reset Your Password',
    subtitle: 'Enter your new password below',
    isLogin: false,
    className: '',
    bodyHtml: `
      <form class="auth-form" id="resetForm">
        <div class="input-group">
          <label for="resetEmail">Email Address</label>
          <input id="resetEmail" type="email" value="${escapeHtml(emailParam)}" disabled required style="background-color:#111010ff;cursor:not-allowed" />
        </div>

        <div class="input-group">
          <label for="resetNew">New Password</label>
          <div class="password-input">
            <input id="resetNew" type="password" placeholder="Enter new password" required ${emailParam ? '' : 'disabled'} />
            <button type="button" class="password-toggle" id="toggleResetNew" aria-label="Show password">
              <svg id="eyeOpen4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
                <path d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7Z"/>
                <circle cx="10" cy="10" r="3"/>
              </svg>
              <svg id="eyeClosed4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20" style="display:none">
                <path d="M3.98 8.223A10.477 10.477 0 0 0 1 10c.73 2.89 4 7 9 7 1.59 0 3.07-.44 4.38-1.21M6.66 6.61A8.885 8.885 0 0 1 10 6c5 0 8.27 4.11 9 7a11.5 11.5 0 0 1-1.02 1.74M13.34 13.39A3 3 0 1 1 6.66 6.61"/>
                <line x1="1" y1="1" x2="19" y2="19"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="input-group">
          <label for="resetConfirm">Confirm New Password</label>
          <div class="password-input">
            <input id="resetConfirm" type="password" placeholder="Re-enter new password" required ${emailParam ? '' : 'disabled'} />
            <button type="button" class="password-toggle" id="toggleResetConfirm" aria-label="Show password">
              <svg id="eyeOpen5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
                <path d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7Z"/>
                <circle cx="10" cy="10" r="3"/>
              </svg>
              <svg id="eyeClosed5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20" style="display:none">
                <path d="M3.98 8.223A10.477 10.477 0 0 0 1 10c.73 2.89 4 7 9 7 1.59 0 3.07-.44 4.38-1.21M6.66 6.61A8.885 8.885 0 0 1 10 6c5 0 8.27 4.11 9 7a11.5 11.5 0 0 1-1.02 1.74M13.34 13.39A3 3 0 1 1 6.66 6.61"/>
                <line x1="1" y1="1" x2="19" y2="19"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="password-requirements" style="font-size:12px;color:#666;margin-top:-10px;margin-bottom:15px">
          <p style="margin:5px 0">Password must contain:</p>
          <ul style="margin:5px 0;padding-left:20px">
            <li>At least 8 characters</li>
            <li>One uppercase letter</li>
            <li>One lowercase letter</li>
            <li>One special character (!@#$%^&*)</li>
          </ul>
        </div>

        <div class="alert alert-error" id="resetError" role="alert" style="display:none"></div>
        <div class="alert alert-success" id="resetSuccess" role="alert" style="display:none"></div>

        <button type="submit" class="btn-primary" id="resetSubmit" ${emailParam ? '' : 'disabled'}>
          Reset Password
        </button>
      </form>
    `,
  });

  mount(html);

  const errEl = root.querySelector('#resetError');
  const okEl = root.querySelector('#resetSuccess');
  const submitBtn = root.querySelector('#resetSubmit');

  if (!emailParam) {
    errEl.textContent = 'Invalid reset link. Please request a new password reset.';
    errEl.style.display = '';
    root.querySelector('.auth-card')?.classList.add('animate-shake');
    return;
  }

  function togglePassword(input, openId, closedId, btn) {
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    root.querySelector(openId).style.display = isText ? '' : 'none';
    root.querySelector(closedId).style.display = isText ? 'none' : '';
    btn.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
  }

  const newEl = root.querySelector('#resetNew');
  const confirmEl = root.querySelector('#resetConfirm');
  root.querySelector('#toggleResetNew').addEventListener('click', (e) => togglePassword(newEl, '#eyeOpen4', '#eyeClosed4', e.currentTarget));
  root.querySelector('#toggleResetConfirm').addEventListener('click', (e) => togglePassword(confirmEl, '#eyeOpen5', '#eyeClosed5', e.currentTarget));

  root.querySelector('#resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.style.display = 'none';
    okEl.style.display = 'none';

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Resetting Password...';

    try {
      const data = await api.post('/auth/reset-password', {
        email: emailParam,
        newPassword: newEl.value,
        confirmPassword: confirmEl.value,
      });

      if (data?.success) {
        okEl.textContent = 'Password reset successfully! Redirecting to login...';
        okEl.style.display = '';
        setTimeout(() => navigate('/login'), 1500);
      } else {
        errEl.textContent = data?.message || 'Failed to reset password';
        errEl.style.display = '';
        root.querySelector('.auth-card')?.classList.add('animate-shake');
      }
    } catch (err) {
      let msg = err?.message || 'Failed to reset password. Please try again.';
      if (err?.code === 'ERR_NETWORK') msg = 'Unable to connect to server. Please check your connection.';
      if (err?.status === 404) msg = 'Account not found. Please check your email address.';
      if (err?.status === 400) msg = err?.data?.message || 'Invalid input. Please check your passwords.';
      errEl.textContent = msg;
      errEl.style.display = '';
      root.querySelector('.auth-card')?.classList.add('animate-shake');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reset Password';
    }
  });
}

// ---------------------- App pages ----------------------

const DEFAULT_COMPANY = 'My Company (San Francisco)';

function isOpenStatus(status) {
  const s = String(status || '').toLowerCase();
  return s !== 'repaired' && s !== 'scrap';
}

async function renderDashboard(query) {
  const user = requireLogin();
  if (!user) return;

  let requests = [];
  let search = '';
  let company = DEFAULT_COMPANY;

  const render = ({ loading = false, error = '' } = {}) => {
    const openRequests = requests.filter((r) => isOpenStatus(r.status));

    const criticalEquipmentSet = new Set();
    for (const r of openRequests) {
      if (r.equipment_id) criticalEquipmentSet.add(r.equipment_id);
    }
    const criticalEquipmentCount = criticalEquipmentSet.size;

    const technicianLoadPct = (() => {
      const total = openRequests.length;
      if (!total) return 0;
      const assigned = openRequests.filter((r) => r.assigned_to_user_id || r.assigned_to_name).length;
      return Math.round((assigned / total) * 100);
    })();

    const filtered = (() => {
      const q = search.trim().toLowerCase();
      if (!q) return requests;
      return requests.filter((r) => {
        const hay = [
          r.subject,
          r.equipment_name,
          r.work_center_name,
          r.department,
          r.assigned_employee_name,
          r.assigned_to_name,
          r.created_by_name,
          r.type,
          r.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    })();

    const rowsHtml = !loading && filtered.length === 0
      ? `
        <tr>
          <td colspan="6" class="table-empty">No requests found.</td>
        </tr>
      `
      : filtered.slice(0, 15).map((r) => `
        <tr>
          <td>
            <div style="font-weight: 650">${escapeHtml(r.subject)}</div>
            <div class="muted" style="font-size: 12px; margin-top: 2px">${escapeHtml((r.work_center_name || r.equipment_name) ?? '-')}</div>
          </td>
          <td>${escapeHtml(r.assigned_employee_name || r.created_by_name || '-')}</td>
          <td>${escapeHtml(r.assigned_to_name || '-')}</td>
          <td>${escapeHtml(r.department || r.type || '-')}</td>
          <td><span class="pill">${escapeHtml(String(r.status || 'new').replaceAll('_', ' '))}</span></td>
          <td>${escapeHtml(company)}</td>
        </tr>
      `).join('');

    mount(appShellHtml({
      currentPath: '/app',
      outletHtml: `
        <div class="container">
          <div class="page-header">
            <div>
              <h1>Dashboard</h1>
              <p class="muted">At-a-glance status for maintenance.</p>
            </div>

            <div class="page-actions">
              <input class="modal-input" style="margin-bottom: 0; width: 240" id="dashSearch" value="${escapeHtml(search)}" placeholder="Search" aria-label="Search" />

              <select class="modal-input" style="margin-bottom: 0; width: 260" id="dashCompany" aria-label="Company">
                <option value="${escapeHtml(DEFAULT_COMPANY)}" ${company === DEFAULT_COMPANY ? 'selected' : ''}>${escapeHtml(DEFAULT_COMPANY)}</option>
              </select>

              <button type="button" class="btn-accent" id="dashNew">New Request</button>
              <button type="button" class="btn-secondary" id="dashRefresh" ${loading ? 'disabled' : ''}>${loading ? 'Refreshing…' : 'Refresh'}</button>
            </div>
          </div>

          ${error ? `<div class="alert alert-error animate-shake" style="margin-bottom: 12px">${escapeHtml(error)}</div>` : ''}

          <div class="card-grid" style="margin-bottom: 14px">
            <div class="card" style="border-left: 3px solid rgba(239, 68, 68, 0.55)">
              <p class="muted">Critical Equipment</p>
              <h2>${criticalEquipmentCount} Units</h2>
            </div>

            <div class="card" style="border-left: 3px solid rgba(90, 166, 255, 0.55)">
              <p class="muted">Technician Load</p>
              <h2>${technicianLoadPct}% Utilized</h2>
            </div>

            <div class="card" style="border-left: 3px solid rgba(69, 209, 156, 0.55)">
              <p class="muted">Open Requests</p>
              <h2>${openRequests.length} Pending</h2>
            </div>
          </div>

          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Employee</th>
                  <th>Technician</th>
                  <th>Category</th>
                  <th>Stage</th>
                  <th>Company</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      `,
    }));

    setActiveSidebar('/app');

    root.querySelector('#dashSearch').addEventListener('input', (e) => {
      search = e.target.value;
      render({ loading, error });
    });

    root.querySelector('#dashCompany').addEventListener('change', (e) => {
      company = e.target.value;
      render({ loading, error });
    });

    root.querySelector('#dashNew').addEventListener('click', () => {
      navigate('/app/requests?openNew=1');
    });

    root.querySelector('#dashRefresh').addEventListener('click', () => load());
  };

  const load = async () => {
    render({ loading: true, error: '' });
    try {
      const data = await api.get('/maintenance');
      requests = data?.data || [];
      render({ loading: false, error: '' });
    } catch (e) {
      render({ loading: false, error: e?.message || 'Failed to load dashboard data' });
    }
  };

  await load();
}

function formatHHmm(d) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildEventTimes(scheduledDate) {
  const d = toDateOnly(scheduledDate);
  if (!d) return { date: null, startTime: '09:00', endTime: '10:00' };

  if (d.getHours() === 0 && d.getMinutes() === 0) {
    const start = new Date(d);
    start.setHours(9, 0, 0, 0);
    const end = new Date(d);
    end.setHours(10, 0, 0, 0);
    return { date: d, startTime: formatHHmm(start), endTime: formatHHmm(end) };
  }

  const start = d;
  const end = new Date(d);
  end.setHours(end.getHours() + 1);
  return { date: d, startTime: formatHHmm(start), endTime: formatHHmm(end) };
}

function getWeekDays(currentDate) {
  const start = new Date(currentDate);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    days.push(date);
  }
  return days;
}

function getMonthDays(currentDate) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];

  const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  for (let i = 0; i < startDay; i++) days.push(null);

  for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));

  return days;
}

function isToday(date) {
  const today = new Date();
  return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
}

function getEventPosition(event) {
  const [startHour] = event.startTime.split(':').map(Number);
  const [endHour] = event.endTime.split(':').map(Number);
  const top = (startHour - 6) * 50;
  const height = (endHour - startHour) * 50;
  return { top: `${top}px`, height: `${height}px` };
}

async function renderCalendar() {
  const user = requireLogin();
  if (!user) return;

  let currentDate = new Date();
  let view = 'week';
  let scheduledRequests = [];

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const timeSlots = Array.from({ length: 15 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);

  const render = ({ loading = false, error = '' } = {}) => {
    const weekDays = getWeekDays(currentDate);
    const monthDays = getMonthDays(currentDate);

    const events = scheduledRequests
      .map((req) => {
        const times = buildEventTimes(req.scheduled_date);
        if (!times.date) return null;
        return {
          id: req.id,
          title: req.subject || 'Scheduled Maintenance',
          date: times.date,
          startTime: times.startTime,
          endTime: times.endTime,
          priority: 'medium',
          equipment: req.equipment_name || req.work_center_name || '',
        };
      })
      .filter(Boolean);

    mount(appShellHtml({
      currentPath: '/app/calendar',
      outletHtml: `
        <div class="container">
          <div class="calendar-header">
            <h1>Maintenance Calendar</h1>
            <div class="calendar-controls">
              <button class="calendar-nav-btn" id="calPrev">←</button>
              <button class="calendar-nav-btn" id="calToday">Today</button>
              <button class="calendar-nav-btn" id="calNext">→</button>
              <select class="calendar-view-select" id="calView">
                <option value="week" ${view === 'week' ? 'selected' : ''}>Week</option>
                <option value="month" ${view === 'month' ? 'selected' : ''}>Month</option>
              </select>
            </div>
          </div>

          ${error ? `<div class="alert alert-error" style="margin-bottom: 12px">${escapeHtml(error)}</div>` : ''}

          <div class="calendar-content">
            <div class="calendar-main">
              <div class="calendar-week-info">
                <span class="calendar-month-year">${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}</span>
                <span class="calendar-week-number">Week 51</span>
              </div>

              <div class="calendar-grid">
                <div class="calendar-time-column">
                  ${timeSlots.map((t) => `<div class="time-slot">${t}</div>`).join('')}
                </div>

                <div class="calendar-days-grid">
                  <div class="calendar-day-headers">
                    ${weekDays.map((day) => `
                      <div class="day-header">
                        <div class="day-name">${dayNames[day.getDay()]}</div>
                        <div class="day-number ${isToday(day) ? 'today' : ''}">${day.getDate()}</div>
                      </div>
                    `).join('')}
                  </div>

                  <div class="calendar-week-body">
                    ${weekDays.map((day) => {
                      const dayEvents = events.filter((ev) =>
                        ev.date.getDate() === day.getDate() &&
                        ev.date.getMonth() === day.getMonth() &&
                        ev.date.getFullYear() === day.getFullYear()
                      );

                      return `
                        <div class="calendar-day-column">
                          ${timeSlots.map(() => `<div class="calendar-time-cell"></div>`).join('')}
                          ${dayEvents.map((event) => {
                            const pos = getEventPosition(event);
                            return `
                              <div class="calendar-event priority-${event.priority}" style="top:${pos.top};height:${pos.height}">
                                ${escapeHtml(event.title)}
                              </div>
                            `;
                          }).join('')}
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              </div>
            </div>

            <div class="calendar-mini">
              <div class="mini-calendar-header">
                <button class="mini-nav-btn" id="miniPrev">←</button>
                <span class="mini-month-year">${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}</span>
                <button class="mini-nav-btn" id="miniNext">→</button>
              </div>

              <div class="mini-calendar-grid">
                <div class="mini-day-names">
                  ${['S','M','T','W','T','F','S'].map((d) => `<div class="mini-day-name">${d}</div>`).join('')}
                </div>
                <div class="mini-days">
                  ${monthDays.map((day) => {
                    const cls = [
                      'mini-day',
                      day ? '' : 'empty',
                      day && isToday(day) ? 'today' : '',
                      day && day.getDate() === currentDate.getDate() ? 'selected' : '',
                    ].filter(Boolean).join(' ');
                    return `<div class="${cls}">${day ? day.getDate() : ''}</div>`;
                  }).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
      `,
    }));

    setActiveSidebar('/app/calendar');

    root.querySelector('#calPrev').addEventListener('click', () => {
      const d = new Date(currentDate);
      if (view === 'week') d.setDate(d.getDate() - 7);
      else d.setMonth(d.getMonth() - 1);
      currentDate = d;
      render({ loading, error });
    });

    root.querySelector('#calNext').addEventListener('click', () => {
      const d = new Date(currentDate);
      if (view === 'week') d.setDate(d.getDate() + 7);
      else d.setMonth(d.getMonth() + 1);
      currentDate = d;
      render({ loading, error });
    });

    root.querySelector('#calToday').addEventListener('click', () => {
      currentDate = new Date();
      render({ loading, error });
    });

    root.querySelector('#calView').addEventListener('change', (e) => {
      view = e.target.value;
      render({ loading, error });
    });

    root.querySelector('#miniPrev').addEventListener('click', () => {
      const d = new Date(currentDate);
      d.setMonth(d.getMonth() - 1);
      currentDate = d;
      render({ loading, error });
    });

    root.querySelector('#miniNext').addEventListener('click', () => {
      const d = new Date(currentDate);
      d.setMonth(d.getMonth() + 1);
      currentDate = d;
      render({ loading, error });
    });
  };

  const load = async () => {
    render({ loading: true, error: '' });
    try {
      const data = await api.get('/maintenance/calendar');
      scheduledRequests = data?.data || [];
      render({ loading: false, error: '' });
    } catch (e) {
      render({ loading: false, error: e?.message || 'Failed to load calendar requests' });
    }
  };

  await load();
}

async function renderWorkCenter() {
  const user = requireLogin();
  if (!user) return;

  let rows = [];
  let altMap = {};

  const render = ({ loading = false, error = '' } = {}) => {
    mount(appShellHtml({
      currentPath: '/app/equipment/work-center',
      outletHtml: `
        <div class="container">
          <div class="page-header">
            <div>
              <h1>Work Center</h1>
              <p class="muted">Work center list view</p>
            </div>
            <div class="page-actions">
              <button type="button" class="btn-accent" id="wcNew">New</button>
              <button type="button" class="btn-secondary" id="wcRefresh" ${loading ? 'disabled' : ''}>${loading ? 'Refreshing…' : 'Refresh'}</button>
            </div>
          </div>

          ${error ? `<div class="alert alert-error animate-shake" style="margin-bottom:12px">${escapeHtml(error)}</div>` : ''}

          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Work Center</th>
                  <th>Code</th>
                  <th>Tag</th>
                  <th>Alternative Workcenters</th>
                  <th style="text-align:right">Cost per hour</th>
                  <th style="text-align:right">Capacity</th>
                  <th style="text-align:right">Time Efficiency</th>
                  <th style="text-align:right">OEE Target</th>
                </tr>
              </thead>
              <tbody>
                ${(!loading && rows.length === 0) ? `<tr><td colspan="8" class="table-empty">No work centers yet.</td></tr>` : ''}
                ${rows.map((wc) => {
                  const alts = altMap[wc.id] || [];
                  return `
                    <tr>
                      <td>${escapeHtml(wc.name)}</td>
                      <td>${escapeHtml(wc.code || '-')}</td>
                      <td>${escapeHtml(wc.tag || '-')}</td>
                      <td class="muted">${alts.length ? escapeHtml(alts.map((a) => a.alt_name).join(', ')) : '-'}</td>
                      <td style="text-align:right">${Number(wc.cost_per_hour ?? 0).toFixed(2)}</td>
                      <td style="text-align:right">${Number(wc.capacity_per_hour ?? 0).toFixed(2)}</td>
                      <td style="text-align:right">${Number(wc.time_efficiency_pct ?? 100).toFixed(2)}</td>
                      <td style="text-align:right">${Number(wc.oee_target_pct ?? 0).toFixed(2)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `,
    }));

    setActiveSidebar('/app/equipment/work-center');

    root.querySelector('#wcRefresh').addEventListener('click', () => load());
    root.querySelector('#wcNew').addEventListener('click', () => openCreate());
  };

  const load = async () => {
    render({ loading: true, error: '' });
    try {
      const data = await api.get('/work-centers');
      rows = data?.data || [];

      const pairs = await Promise.all(
        rows.map(async (wc) => {
          try {
            const resp = await api.get(`/work-centers/${wc.id}/alternatives`);
            return [wc.id, resp?.data || []];
          } catch {
            return [wc.id, []];
          }
        })
      );
      altMap = Object.fromEntries(pairs);

      render({ loading: false, error: '' });
    } catch (e) {
      render({ loading: false, error: e?.message || 'Failed to load work centers' });
    }
  };

  const openCreate = () => {
    const formState = {
      name: '',
      code: '',
      tag: '',
      cost_per_hour: '0',
      capacity_per_hour: '0',
      time_efficiency_pct: '100',
      oee_target_pct: '0',
      alternative_ids: [],
    };

    const modal = openModal(`
      <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Create work center">
        <div class="modal-content" style="max-width:520px">
          <button class="modal-close" type="button" data-modal-close>×</button>
          <h3>Create Work Center</h3>
          <p>Must create a work center proper form view with respective fields used in maintenance requests.</p>

          <form id="wcCreateForm">
            <div class="input-group">
              <label>Work Center Name</label>
              <input class="modal-input" name="name" placeholder="Assembly 1" />
            </div>

            <div class="signup-grid" style="margin-top:12px">
              <div class="input-group">
                <label>Code</label>
                <input class="modal-input" name="code" placeholder="WC-ASM-1" />
              </div>
              <div class="input-group">
                <label>Tag</label>
                <input class="modal-input" name="tag" placeholder="assembly" />
              </div>
            </div>

            <div class="signup-grid" style="margin-top:12px">
              <div class="input-group">
                <label>Cost per hour</label>
                <input class="modal-input" type="number" step="0.01" min="0" name="cost_per_hour" value="0" />
              </div>
              <div class="input-group">
                <label>Capacity</label>
                <input class="modal-input" type="number" step="0.01" min="0" name="capacity_per_hour" value="0" />
              </div>
            </div>

            <div class="signup-grid" style="margin-top:12px">
              <div class="input-group">
                <label>Time Efficiency (%)</label>
                <input class="modal-input" type="number" step="0.01" min="0" max="100" name="time_efficiency_pct" value="100" />
              </div>
              <div class="input-group">
                <label>OEE Target (%)</label>
                <input class="modal-input" type="number" step="0.01" min="0" max="100" name="oee_target_pct" value="0" />
              </div>
            </div>

            <div class="input-group" style="margin-top:12px">
              <label>Alternative Workcenters</label>
              <select class="modal-input" multiple name="alternative_ids" style="height:120px;padding-top:10px;padding-bottom:10px">
                ${rows.map((wc) => `<option value="${wc.id}">${escapeHtml(wc.name)}${wc.code ? ` (${escapeHtml(wc.code)})` : ''}</option>`).join('')}
              </select>
            </div>

            <div class="alert alert-error animate-shake" id="wcCreateError" style="margin-top:12px;white-space:pre-line;display:none"></div>
            <div class="alert alert-success" id="wcCreateSuccess" style="margin-top:12px;display:none"></div>

            <div class="modal-actions" style="margin-top:16px">
              <button type="button" class="btn-secondary" data-modal-close id="wcCancel">Cancel</button>
              <button type="submit" class="btn-accent" id="wcCreateBtn">Create</button>
            </div>
          </form>
        </div>
      </div>
    `);

    const form = modal.overlay.querySelector('#wcCreateForm');
    const errEl = modal.overlay.querySelector('#wcCreateError');
    const okEl = modal.overlay.querySelector('#wcCreateSuccess');
    const btn = modal.overlay.querySelector('#wcCreateBtn');

    const validate = () => {
      const errs = [];
      const name = form.elements.name.value.trim();
      if (!name) errs.push('Work Center name is required');
      const num = (v) => Number(v);

      const cph = num(form.elements.cost_per_hour.value);
      const cap = num(form.elements.capacity_per_hour.value);
      const te = num(form.elements.time_efficiency_pct.value);
      const oee = num(form.elements.oee_target_pct.value);

      if (Number.isNaN(cph) || cph < 0) errs.push('Cost per hour must be >= 0');
      if (Number.isNaN(cap) || cap < 0) errs.push('Capacity must be >= 0');
      if (Number.isNaN(te) || te < 0 || te > 100) errs.push('Time Efficiency must be between 0 and 100');
      if (Number.isNaN(oee) || oee < 0 || oee > 100) errs.push('OEE Target must be between 0 and 100');
      return errs;
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.style.display = 'none';
      okEl.style.display = 'none';

      const errs = validate();
      if (errs.length) {
        errEl.textContent = errs.join('\n');
        errEl.style.display = '';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Create';

      try {
        const payload = {
          name: form.elements.name.value.trim(),
          code: form.elements.code.value.trim() || null,
          tag: form.elements.tag.value.trim() || null,
          cost_per_hour: Number(form.elements.cost_per_hour.value),
          capacity_per_hour: Number(form.elements.capacity_per_hour.value),
          time_efficiency_pct: Number(form.elements.time_efficiency_pct.value),
          oee_target_pct: Number(form.elements.oee_target_pct.value),
          status: 'active',
        };

        const data = await api.post('/work-centers', payload);
        if (!data?.success) throw new Error(data?.message || 'Create failed');

        const newId = data?.data?.id;
        const selected = Array.from(form.elements.alternative_ids.selectedOptions)
          .map((o) => Number(o.value))
          .filter((n) => Number.isFinite(n));

        if (newId && selected.length) {
          const unique = Array.from(new Set(selected));
          await Promise.all(unique.map((altId) => api.post(`/work-centers/${newId}/alternatives`, { alternative_work_center_id: altId })));
        }

        okEl.textContent = 'Work center created successfully';
        okEl.style.display = '';
        await load();
        setTimeout(() => modal.close(), 600);
      } catch (e2) {
        errEl.textContent = e2?.message || 'Create failed';
        errEl.style.display = '';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create';
      }
    });
  };

  await load();
}

async function renderMachineTools(query) {
  const user = requireLogin();
  if (!user) return;

  let rows = [];
  let q = '';

  const render = ({ loading = false, error = '' } = {}) => {
    const filtered = (() => {
      const s = q.trim().toLowerCase();
      if (!s) return rows;
      return rows.filter((r) => [
        r.name,
        r.assigned_employee_name,
        r.department,
        r.serial_number,
        r.team_name,
        r.category,
        r.location,
      ].join(' ').toLowerCase().includes(s));
    })();

    mount(appShellHtml({
      currentPath: '/app/equipment/machine-tools',
      outletHtml: `
        <div class="container">
          <div class="page-header">
            <div>
              <h1>Equipment</h1>
              <p class="muted">Manage equipment and assignments.</p>
            </div>
            <div class="page-actions">
              <input class="modal-input" style="margin-bottom:0;width:260px" type="search" placeholder="Search" value="${escapeHtml(q)}" id="eqSearch" aria-label="Search equipment" />
              <button class="btn-accent" type="button" id="eqNew">New</button>
            </div>
          </div>

          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Equipment Name</th>
                  <th scope="col">Employee</th>
                  <th scope="col">Department</th>
                  <th scope="col">Serial Number</th>
                  <th scope="col">Technician</th>
                  <th scope="col">Equipment Category</th>
                  <th scope="col">Company</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map((r) => `
                  <tr class="table-row-click" data-eqid="${r.id}" title="Open related requests">
                    <td style="color:var(--accent2);font-weight:600">${escapeHtml(r.name)}</td>
                    <td>${escapeHtml(r.assigned_employee_name || '-')}</td>
                    <td>${escapeHtml(r.department || '-')}</td>
                    <td>${escapeHtml(r.serial_number || '-')}</td>
                    <td>${escapeHtml(r.team_name || '-')}</td>
                    <td>${escapeHtml(r.category || '-')}</td>
                    <td>${escapeHtml(r.location || '-')}</td>
                  </tr>
                `).join('')}

                ${(filtered.length === 0) ? `
                  <tr><td colspan="7" class="table-empty">${loading ? 'Loading…' : 'No equipment found.'}</td></tr>
                ` : ''}
              </tbody>
            </table>
          </div>

          ${error ? `<div class="alert alert-error" style="margin-top:12px">${escapeHtml(error)}</div>` : ''}
        </div>
      `,
    }));

    setActiveSidebar('/app/equipment/machine-tools');

    root.querySelector('#eqSearch').addEventListener('input', (e) => {
      q = e.target.value;
      render({ loading, error });
    });

    root.querySelectorAll('tr[data-eqid]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const id = tr.getAttribute('data-eqid');
        navigate(`/app/requests?equipment_id=${encodeURIComponent(id)}`);
      });
    });

    root.querySelector('#eqNew').addEventListener('click', () => openNewModal());
  };

  const load = async () => {
    render({ loading: true, error: '' });
    try {
      const data = await api.get('/equipment');
      rows = data?.data || [];
      render({ loading: false, error: '' });
    } catch (e) {
      render({ loading: false, error: e?.message || 'Failed to load equipment' });
    }
  };

  const openNewModal = () => {
    // Matches the React behavior: UI-only modal (no backend create yet).
    const modal = openModal(`
      <div class="modal-overlay" role="dialog" aria-modal="true">
        <div class="equipment-modal">
          <div class="equipment-modal-top">
            <h2 class="equipment-modal-title">Equipment</h2>
            <div class="equipment-modal-actions">
              <button class="btn-secondary" type="button" data-modal-close>Cancel</button>
              <button class="btn-accent" type="button" id="eqSubmit">Submit</button>
            </div>
          </div>

          <form id="equipmentForm" class="equipment-form">
            <div class="equipment-form-grid">
              ${[
                ['name', 'Name'],
                ['technician', 'Technician'],
                ['category', 'Equipment Category'],
                ['employee', 'Employee'],
                ['company', 'Company'],
                ['scrapDate', 'Scrap Date'],
                ['location', 'Used in location'],
                ['workCenter', 'Work Center'],
                ['department', 'Department'],
                ['serial', 'Serial Number'],
              ].map(([n, label]) => `
                <div class="field">
                  <label>${escapeHtml(label)} </label>
                  <input name="${escapeHtml(n)}" class="modal-input" />
                </div>
              `).join('')}

              <div class="field field-wide">
                <label>Description</label>
                <input name="description" class="modal-input" />
              </div>
            </div>
          </form>
        </div>
      </div>
    `);

    modal.overlay.querySelector('#eqSubmit').addEventListener('click', async () => {
      modal.close();
      await load();
    });
  };

  await load();
}

async function renderTeams() {
  const user = requireLogin();
  if (!user) return;

  let rows = [];

  const render = () => {
    mount(appShellHtml({
      currentPath: '/app/teams',
      outletHtml: `
        <div class="container">
          <div class="page-header">
            <div>
              <h1>Teams</h1>
              <p class="muted">Manage maintenance teams and members.</p>
            </div>
            <div class="page-actions">
              <button class="btn-accent" type="button" id="teamNew">New</button>
            </div>
          </div>

          <div class="table-wrap">
            <table class="table" style="min-width:720px">
              <thead>
                <tr>
                  <th scope="col">Team Name</th>
                  <th scope="col">Team Members</th>
                  <th scope="col">Company</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((r) => `
                  <tr>
                    <td>${escapeHtml(r.name)}</td>
                    <td>${escapeHtml(r.members || 'No members yet')}</td>
                    <td>${escapeHtml(r.company || DEFAULT_COMPANY)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `,
    }));

    setActiveSidebar('/app/teams');

    root.querySelector('#teamNew').addEventListener('click', () => openNew());
  };

  const fetchTeams = async () => {
    const data = await api.get('/teams');
    if (data?.success) rows = data.data;
    else rows = data?.data || [];
  };

  const openNew = () => {
    const modal = openModal(`
      <div class="modal-overlay" role="dialog" aria-modal="true">
        <div class="modal-content" style="max-width:520px">
          <button class="modal-close" type="button" data-modal-close>×</button>
          <h3>New Team</h3>
          <p>Create a maintenance team.</p>

          <form id="teamForm">
            <div class="input-group">
              <label>Team Name *</label>
              <input class="modal-input" name="name" required placeholder="e.g., Internal Maintenance" />
            </div>

            <div class="input-group">
              <label>Company *</label>
              <input class="modal-input" name="company" required value="${escapeHtml(DEFAULT_COMPANY)}" placeholder="e.g., ${escapeHtml(DEFAULT_COMPANY)}" />
            </div>

            <div class="input-group">
              <label>Team Members *</label>
              <input class="modal-input" name="members" required placeholder="e.g., Marc Demo, Maggie Davidson" />
            </div>

            <div class="modal-actions">
              <button class="btn-secondary" type="button" data-modal-close>Cancel</button>
              <button class="btn-accent" type="submit" id="teamSubmit">Submit</button>
            </div>
          </form>
        </div>
      </div>
    `);

    const form = modal.overlay.querySelector('#teamForm');
    const submit = modal.overlay.querySelector('#teamSubmit');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true;
      try {
        const name = form.elements.name.value.trim();
        const data = await api.post('/teams', { name });
        if (!data?.success) throw new Error(data?.message || 'Failed to create team');
        await fetchTeams();
        render();
        modal.close();
      } catch (err) {
        alert(err?.message || 'Failed to create team');
      } finally {
        submit.disabled = false;
      }
    });
  };

  await fetchTeams();
  render();
}

async function renderRequests(query) {
  const user = requireLogin();
  if (!user) return;

  const scope = {
    equipment_id: query.get('equipment_id') || '',
    work_center_id: query.get('work_center_id') || '',
  };

  let loading = false;
  let error = '';

  let activeRequest = null;
  let requests = [];
  let equipmentOptions = [];
  let workCenterOptions = [];

  let showWorksheet = false;
  let activeTab = 'notes';
  let alertStatus = 'in-progress';

  const statusPhases = [
    { id: 'new', label: 'New Request' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'repaired', label: 'Repaired' },
    { id: 'scrap', label: 'Scrapped' },
  ];

  const getStatusIndex = (statusId) => statusPhases.findIndex((p) => p.id === statusId);

  const loadPicklists = async () => {
    try {
      const [eq, wc] = await Promise.all([api.get('/equipment'), api.get('/work-centers')]);
      equipmentOptions = eq?.data || [];
      workCenterOptions = wc?.data || [];
    } catch {
      // ignore
    }
  };

  const loadRequestsList = async () => {
    error = '';
    loading = true;
    draw();

    try {
      const params = {
        ...(scope.equipment_id ? { equipment_id: scope.equipment_id } : {}),
        ...(scope.work_center_id ? { work_center_id: scope.work_center_id } : {}),
      };
      const data = await api.get('/maintenance', params);
      requests = data?.data || [];
      if (!activeRequest?.id || !requests.some((r) => r.id === activeRequest.id)) {
        activeRequest = requests[0] || null;
      }
    } catch (e) {
      error = e?.message || 'Failed to load requests';
    } finally {
      loading = false;
      draw();
    }
  };

  const loadRequestById = async (id) => {
    const data = await api.get(`/maintenance/${id}`);
    activeRequest = data?.data || null;
    draw();
  };

  const assignToMe = async () => {
    if (!activeRequest?.id || !user?.id) return;
    error = '';
    draw();
    try {
      await api.patch(`/maintenance/${activeRequest.id}/assign`, { user_id: user.id });
      await loadRequestById(activeRequest.id);
      await loadRequestsList();
    } catch (e) {
      error = e?.message || 'Failed to assign request';
      draw();
    }
  };

  const updateStatus = async (status, duration) => {
    if (!activeRequest?.id) return;
    error = '';
    draw();
    try {
      await api.patch(`/maintenance/${activeRequest.id}/status`, {
        status,
        duration_hours: duration,
      });
      await loadRequestById(activeRequest.id);
      await loadRequestsList();
    } catch (e) {
      error = e?.message || 'Failed to update status';
      draw();
    }
  };

  const DEFAULT_NEW_REQUEST = {
    subject: '',
    maintenanceFor: 'equipment',
    equipment_id: '',
    work_center_id: '',
    type: 'corrective',
    scheduled_date: '',
    category: '',
    maintenance_team_id: '',
    maintenance_team_name: '',
  };

  const openNewModal = () => {
    const state = structuredClone(DEFAULT_NEW_REQUEST);

    const onNewChange = (key, value) => {
      state[key] = value;
      sync();
    };

    const onSelectEquipment = async (id) => {
      onNewChange('maintenanceFor', 'equipment');
      onNewChange('equipment_id', id);
      onNewChange('work_center_id', '');

      if (!id) {
        onNewChange('category', '');
        onNewChange('maintenance_team_id', '');
        onNewChange('maintenance_team_name', '');
        return;
      }

      try {
        const data = await api.get(`/equipment/${id}`);
        const eq = data?.data;
        onNewChange('category', eq?.category || eq?.department || '');
        onNewChange('maintenance_team_id', eq?.maintenance_team_id ? String(eq.maintenance_team_id) : '');
        onNewChange('maintenance_team_name', eq?.team_name || '');
      } catch {
        // ignore
      }
    };

    const onSelectWorkCenter = (id) => {
      onNewChange('maintenanceFor', 'work-center');
      onNewChange('work_center_id', id);
      onNewChange('equipment_id', '');
      onNewChange('category', '');
      onNewChange('maintenance_team_id', '');
      onNewChange('maintenance_team_name', '');
    };

    const modal = openModal(`
      <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="New Request">
        <div class="modal-content request-modal">
          <div class="modal-header">
            <h2>New Request</h2>
            <button class="modal-close" type="button" data-modal-close>×</button>
          </div>

          <form id="newReqForm">
            <div class="alert alert-error" id="newReqError" style="margin-bottom:12px;display:none"></div>
            <div class="new-request-helper">Select exactly one target: Equipment or Work Center.</div>

            <div class="new-request-grid">
              <div class="field field-wide">
                <label>Subject</label>
                <input type="text" class="form-input" name="subject" placeholder="e.g. Printer stopped working" autofocus />
              </div>

              <div class="field field-wide">
                <label>Maintenance Type</label>
                <div class="radio-group">
                  <label class="radio-label"><input type="radio" name="newType" value="corrective" checked />Breakdown (Corrective)</label>
                  <label class="radio-label"><input type="radio" name="newType" value="preventive" />Routine Checkup (Preventive)</label>
                </div>
              </div>

              <div class="field">
                <label>Equipment</label>
                <select class="form-input" name="equipment_id">
                  <option value="">Select equipment</option>
                  ${equipmentOptions.map((eq) => `<option value="${eq.id}">${escapeHtml(eq.name)}${eq.serial_number ? ` / ${escapeHtml(eq.serial_number)}` : ''}</option>`).join('')}
                </select>
                <p class="muted" id="newEqHint" style="margin-top:6px;margin-bottom:0;display:none">Clear Work Center to choose equipment.</p>
              </div>

              <div class="field">
                <label>Work Center</label>
                <select class="form-input" name="work_center_id">
                  <option value="">Select work center</option>
                  ${workCenterOptions.map((wc) => `<option value="${wc.id}">${escapeHtml(wc.name)}</option>`).join('')}
                </select>
                <p class="muted" id="newWcHint" style="margin-top:6px;margin-bottom:0;display:none">Clear Equipment to choose work center.</p>
              </div>

              <div class="field" id="newCategoryWrap" style="display:none">
                <label>Category</label>
                <input class="form-input" name="category" disabled />
              </div>
              <div class="field" id="newTeamWrap" style="display:none">
                <label>Maintenance Team</label>
                <input class="form-input" name="maintenance_team_name" disabled />
              </div>

              <div class="field field-wide" id="newScheduledWrap" style="display:none">
                <label>Scheduled Date</label>
                <input type="date" class="form-input" name="scheduled_date" />
              </div>
            </div>

            <div class="modal-actions">
              <button class="btn-secondary" type="button" data-modal-close>Cancel</button>
              <button class="btn-new" type="submit" id="newReqSubmit">Create Request</button>
            </div>
          </form>
        </div>
      </div>
    `);

    const form = modal.overlay.querySelector('#newReqForm');
    const errEl = modal.overlay.querySelector('#newReqError');
    const submitBtn = modal.overlay.querySelector('#newReqSubmit');

    const sync = () => {
      form.elements.subject.value = state.subject;

      const type = state.type;
      form.querySelectorAll('input[name="newType"]').forEach((r) => {
        r.checked = r.value === type;
      });

      form.elements.equipment_id.value = state.equipment_id;
      form.elements.work_center_id.value = state.work_center_id;

      const hasEq = Boolean(state.equipment_id);
      const hasWc = Boolean(state.work_center_id);

      form.elements.equipment_id.disabled = hasWc;
      form.elements.work_center_id.disabled = hasEq;

      modal.overlay.querySelector('#newEqHint').style.display = hasWc ? '' : 'none';
      modal.overlay.querySelector('#newWcHint').style.display = hasEq ? '' : 'none';

      const showEqMeta = hasEq;
      modal.overlay.querySelector('#newCategoryWrap').style.display = showEqMeta ? '' : 'none';
      modal.overlay.querySelector('#newTeamWrap').style.display = showEqMeta ? '' : 'none';
      form.elements.category.value = state.category || '';
      form.elements.maintenance_team_name.value = state.maintenance_team_name || '';

      const showScheduled = state.type === 'preventive';
      modal.overlay.querySelector('#newScheduledWrap').style.display = showScheduled ? '' : 'none';
      form.elements.scheduled_date.value = state.scheduled_date || '';
    };

    sync();

    form.elements.subject.addEventListener('input', (e) => onNewChange('subject', e.target.value));

    form.querySelectorAll('input[name="newType"]').forEach((r) => {
      r.addEventListener('change', () => onNewChange('type', r.value));
    });

    form.elements.equipment_id.addEventListener('change', async (e) => {
      await onSelectEquipment(e.target.value);
    });

    form.elements.work_center_id.addEventListener('change', (e) => {
      onSelectWorkCenter(e.target.value);
    });

    form.elements.scheduled_date.addEventListener('change', (e) => onNewChange('scheduled_date', e.target.value));

    // Preselect if deep-linked
    (async () => {
      if (scope.equipment_id) await onSelectEquipment(scope.equipment_id);
      else if (scope.work_center_id) onSelectWorkCenter(scope.work_center_id);
    })();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.style.display = 'none';

      if (!user?.id) {
        errEl.textContent = 'Please log in again to create a request.';
        errEl.style.display = '';
        return;
      }
      if (!state.subject.trim()) {
        errEl.textContent = 'Subject is required.';
        errEl.style.display = '';
        return;
      }

      const hasEq = Boolean(state.equipment_id);
      const hasWc = Boolean(state.work_center_id);
      if ((hasEq && hasWc) || (!hasEq && !hasWc)) {
        errEl.textContent = 'Select exactly one: Equipment or Work Center.';
        errEl.style.display = '';
        return;
      }
      if (state.type === 'preventive' && !state.scheduled_date) {
        errEl.textContent = 'Scheduled Date is required for preventive requests.';
        errEl.style.display = '';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating…';

      try {
        const payload = {
          type: state.type,
          subject: state.subject.trim(),
          equipment_id: hasEq ? Number(state.equipment_id) : null,
          work_center_id: hasWc ? Number(state.work_center_id) : null,
          team_id: state.maintenance_team_id ? Number(state.maintenance_team_id) : null,
          scheduled_date: state.scheduled_date || null,
          created_by_user_id: user.id,
        };

        const data = await api.post('/maintenance', payload);
        if (!data?.success) throw new Error(data?.message || 'Failed to create request');

        await loadRequestById(data?.data?.id);
        await loadRequestsList();
        modal.close();
      } catch (err2) {
        errEl.textContent = err2?.message || 'Failed to create request';
        errEl.style.display = '';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Request';
      }
    });
  };

  const openCompleteModal = () => {
    const modal = openModal(`
      <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Complete Request">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Complete Request</h2>
            <button class="modal-close" type="button" data-modal-close>×</button>
          </div>

          <form id="completeForm">
            <div class="alert alert-error" id="completeError" style="margin-bottom:12px;display:none"></div>

            <div class="form-section">
              <label>Hours Worked</label>
              <input type="number" step="0.25" min="0" class="form-input" id="hoursWorked" placeholder="e.g. 1.5" autofocus />
            </div>

            <div class="modal-actions">
              <button class="btn-secondary" type="button" data-modal-close>Cancel</button>
              <button class="btn-new" type="submit">Mark Repaired</button>
            </div>
          </form>
        </div>
      </div>
    `);

    const form = modal.overlay.querySelector('#completeForm');
    const hoursEl = modal.overlay.querySelector('#hoursWorked');
    const errEl = modal.overlay.querySelector('#completeError');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.style.display = 'none';

      const parsed = Number(hoursEl.value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        errEl.textContent = 'Enter a valid number of hours (greater than 0).';
        errEl.style.display = '';
        return;
      }

      await updateStatus('repaired', parsed);
      modal.close();
    });
  };

  const draw = () => {
    const currentStatus = activeRequest?.status || 'new';
    const currentIndex = getStatusIndex(currentStatus);

    const formData = activeRequest ? {
      subject: activeRequest.subject || '',
      createdBy: activeRequest.created_by_name || user?.name || '',
      maintenanceFor: activeRequest.equipment_id ? 'equipment' : 'work-center',
      equipment: activeRequest.equipment_name
        ? `${activeRequest.equipment_name}${activeRequest.serial_number ? `/${activeRequest.serial_number}` : ''}`
        : '',
      workCenter: activeRequest.work_center_name || '',
      category: activeRequest.department || activeRequest.type || '',
      requestDate: activeRequest.created_at ? String(activeRequest.created_at).slice(0, 10) : '',
      maintenanceType: activeRequest.type || 'corrective',
      team: activeRequest.team_name || '',
      internalMaintenance: activeRequest.assigned_to_name || '',
      scheduledDate: activeRequest.scheduled_date || '',
      duration: typeof activeRequest.duration_hours === 'number'
        ? String(activeRequest.duration_hours)
        : (activeRequest.duration_hours || ''),
      priority: 'medium',
      company: DEFAULT_COMPANY,
    } : {
      subject: '',
      createdBy: user?.name || '',
      maintenanceFor: 'equipment',
      equipment: '',
      workCenter: '',
      category: '',
      requestDate: '',
      maintenanceType: 'corrective',
      team: '',
      internalMaintenance: '',
      scheduledDate: '',
      duration: '',
      priority: 'medium',
      company: DEFAULT_COMPANY,
    };

    const canAssignToMe = activeRequest && !activeRequest.assigned_to_user_id;
    const canStartWork = activeRequest && activeRequest.assigned_to_user_id === user?.id && activeRequest.status === 'new';
    const canComplete = activeRequest && activeRequest.assigned_to_user_id === user?.id && activeRequest.status === 'in_progress';

    mount(appShellHtml({
      currentPath: '/app/requests',
      outletHtml: `
        <div class="container">
          <div class="page-header">
            <div>
              <h1>Requests</h1>
              <p class="muted">
                Submit, triage, and track maintenance work.
                ${scope.equipment_id ? ` • Showing equipment #${escapeHtml(scope.equipment_id)}` : ''}
                ${scope.work_center_id ? ` • Showing work center #${escapeHtml(scope.work_center_id)}` : ''}
              </p>
            </div>
          </div>

          ${error ? `<div class="alert alert-error animate-shake" style="margin-bottom:12px">${escapeHtml(error)}</div>` : ''}

          <div class="request-top-bar">
            <button class="btn-new" type="button" id="reqNew">+ New</button>

            <div style="display:flex; gap:10px; align-items:center">
              ${canAssignToMe ? `<button class="btn-secondary" type="button" id="reqAssign">Assign to me</button>` : ''}
              ${canStartWork ? `<button class="btn-secondary" type="button" id="reqStart">Start Work</button>` : ''}
              ${canComplete ? `<button class="btn-secondary" type="button" id="reqComplete">Complete</button>` : ''}
            </div>

            <div class="status-timeline">
              ${statusPhases.map((phase, idx) => {
                const cls = `status-phase ${phase.id === currentStatus ? 'active' : idx < currentIndex ? 'completed' : 'pending'}`;
                return `
                  <div class="${cls}">
                    <div class="status-phase-dot"></div>
                    <span class="status-phase-label">${escapeHtml(phase.label)}</span>
                  </div>
                `;
              }).join('')}
            </div>

            <button class="worksheet-btn ${showWorksheet ? 'active' : ''}" id="worksheetToggle" title="Toggle worksheet comments">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>

          <div class="status-alert-dots">
            ${[
              ['in-progress', 'in-progress', 'In Progress'],
              ['blocked', 'blocked', 'Blocked'],
              ['ready', 'ready', 'Ready'],
            ].map(([id, cls, label]) => `
              <button type="button" class="alert-dot ${cls} ${alertStatus === id ? 'active' : ''}" data-alert="${id}" title="${label}" aria-label="${label}"></button>
            `).join('')}
          </div>

          <div class="table-wrap" style="margin-top:10px">
            <table class="table" style="min-width:860px">
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Status</th>
                  <th scope="col">Type</th>
                  <th scope="col">Scheduled</th>
                  <th scope="col">Assigned To</th>
                </tr>
              </thead>
              <tbody>
                ${requests.map((r) => {
                  const style = activeRequest?.id === r.id ? 'outline:2px solid rgba(90,166,255,0.35);outline-offset:-2px' : '';
                  return `
                    <tr class="table-row-click" data-reqid="${r.id}" title="Open request" style="${style}">
                      <td>${escapeHtml(r.subject)}</td>
                      <td>${escapeHtml(r.status)}</td>
                      <td>${escapeHtml(r.type)}</td>
                      <td>${r.scheduled_date ? escapeHtml(String(r.scheduled_date).slice(0, 10)) : '-'}</td>
                      <td>${escapeHtml(r.assigned_to_name || '-') }</td>
                    </tr>
                  `;
                }).join('')}

                ${(requests.length === 0) ? `<tr><td colspan="5" class="table-empty">${loading ? 'Loading…' : 'No requests found.'}</td></tr>` : ''}
              </tbody>
            </table>
          </div>

          <div class="request-layout">
            <div class="request-form-panel">
              <h2 class="request-title">${escapeHtml(formData.subject || (loading ? 'Loading…' : 'No request selected'))}</h2>

              <div class="form-section">
                <label>Created By</label>
                <input type="text" class="form-input" value="${escapeHtml(formData.createdBy)}" disabled />
              </div>

              <div class="form-section">
                <label>Maintenance For</label>
                <select class="form-input" disabled>
                  <option value="equipment" ${formData.maintenanceFor === 'equipment' ? 'selected' : ''}>Equipment</option>
                  <option value="work-center" ${formData.maintenanceFor === 'work-center' ? 'selected' : ''}>Work Center</option>
                </select>
              </div>

              ${formData.maintenanceFor === 'equipment' ? `
                <div class="form-section">
                  <label>Equipment</label>
                  <input type="text" class="form-input" value="${escapeHtml(formData.equipment)}" disabled />
                </div>
              ` : `
                <div class="form-section">
                  <label>Work Center</label>
                  <input type="text" class="form-input" value="${escapeHtml(formData.workCenter)}" disabled />
                </div>
              `}

              <div class="form-section">
                <label>Category</label>
                <input type="text" class="form-input" value="${escapeHtml(formData.category)}" disabled />
              </div>

              <div class="form-section">
                <label>Request Date</label>
                <input type="text" class="form-input" value="${escapeHtml(formData.requestDate)}" disabled />
              </div>

              <div class="form-section">
                <label>Maintenance Type</label>
                <div class="radio-group">
                  <label class="radio-label">
                    <input type="radio" ${formData.maintenanceType === 'corrective' ? 'checked' : ''} disabled />
                    Corrective
                  </label>
                  <label class="radio-label">
                    <input type="radio" ${formData.maintenanceType === 'preventive' ? 'checked' : ''} disabled />
                    Preventive
                  </label>
                </div>
              </div>
            </div>

            <div class="request-details-panel">
              <div class="form-section"><label>Team</label><input type="text" class="form-input" value="${escapeHtml(formData.team)}" disabled /></div>
              <div class="form-section"><label>Internal Maintenance</label><input type="text" class="form-input" value="${escapeHtml(formData.internalMaintenance)}" disabled /></div>
              <div class="form-section"><label>Scheduled Date</label><input type="datetime-local" class="form-input" value="${escapeHtml(formData.scheduledDate)}" disabled /></div>
              <div class="form-section"><label>Duration (hours)</label><input type="text" class="form-input" value="${escapeHtml(formData.duration)}" disabled /></div>

              <div class="form-section">
                <label>Priority</label>
                <div class="priority-selector">
                  <div class="priority-diamond ${formData.priority === 'low' ? 'active' : ''}" title="Low Priority" aria-disabled="true"></div>
                  <div class="priority-diamond ${formData.priority === 'medium' ? 'active' : ''}" title="Medium Priority" aria-disabled="true"></div>
                  <div class="priority-diamond ${formData.priority === 'high' ? 'active' : ''}" title="High Priority" aria-disabled="true"></div>
                </div>
              </div>

              <div class="form-section"><label>Company</label><input type="text" class="form-input" value="${escapeHtml(formData.company)}" disabled /></div>
            </div>
          </div>

          ${showWorksheet ? `
            <div class="worksheet-section">
              <div class="worksheet-header">
                <h3>Worksheet Comments</h3>
                <button class="close-btn" id="worksheetClose" aria-label="Close worksheet">×</button>
              </div>
              <textarea class="worksheet-textarea" placeholder="Add worksheet comments here..."></textarea>
            </div>
          ` : ''}

          <div class="tabs-section">
            <div class="tabs-header">
              <button class="tab-btn ${activeTab === 'notes' ? 'active' : ''}" data-tab="notes">Notes</button>
              <button class="tab-btn ${activeTab === 'instructions' ? 'active' : ''}" data-tab="instructions">Instructions</button>
            </div>
            <div class="tab-content">
              <textarea class="notes-textarea" placeholder="${activeTab === 'notes' ? 'Add notes here...' : 'Add instructions here...'}"></textarea>
            </div>
          </div>
        </div>
      `,
    }));

    setActiveSidebar('/app/requests');

    root.querySelector('#reqNew').addEventListener('click', () => openNewModal());

    root.querySelectorAll('tr[data-reqid]').forEach((tr) => {
      tr.addEventListener('click', () => loadRequestById(tr.getAttribute('data-reqid')));
    });

    root.querySelectorAll('button[data-alert]').forEach((btn) => {
      btn.addEventListener('click', () => {
        alertStatus = btn.getAttribute('data-alert');
        draw();
      });
    });

    const assignBtn = root.querySelector('#reqAssign');
    if (assignBtn) assignBtn.addEventListener('click', assignToMe);

    const startBtn = root.querySelector('#reqStart');
    if (startBtn) startBtn.addEventListener('click', () => updateStatus('in_progress'));

    const completeBtn = root.querySelector('#reqComplete');
    if (completeBtn) completeBtn.addEventListener('click', () => openCompleteModal());

    root.querySelector('#worksheetToggle').addEventListener('click', () => {
      showWorksheet = !showWorksheet;
      draw();
    });

    const wsClose = root.querySelector('#worksheetClose');
    if (wsClose) wsClose.addEventListener('click', () => {
      showWorksheet = false;
      draw();
    });

    root.querySelectorAll('button[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab');
        draw();
      });
    });
  };

  await loadPicklists();
  await loadRequestsList();

  if (query.get('openNew') === '1') {
    openNewModal();
  }
}

// ---------------------- Router ----------------------

async function renderRoute() {
  const { path, query } = parseHashRoute();

  // Root redirect
  if (path === '/') {
    navigate('/login');
    return;
  }

  try {
    if (path === '/login') return renderLogin();
    if (path === '/signup') return renderSignup();
    if (path === '/reset-password') return renderResetPassword(query);

    if (path === '/app' || path === '/app/') return renderDashboard(query);
    if (path === '/app/calendar') return renderCalendar(query);
    if (path === '/app/equipment/work-center') return renderWorkCenter(query);
    if (path === '/app/equipment/machine-tools') return renderMachineTools(query);
    if (path === '/app/requests') return renderRequests(query);
    if (path === '/app/teams') return renderTeams(query);

    // Fallback
    if (path.startsWith('/app')) {
      navigate('/app');
      return;
    }
    navigate('/login');
  } catch (e) {
    // Last-resort screen
    mount(`
      <div class="auth-layout">
        <div class="auth-backdrop" aria-hidden="true">
          <span class="orb orb-a"></span>
          <span class="orb orb-b"></span>
          <span class="orb orb-c"></span>
        </div>
        <div class="auth-card">
          <div class="card-header">
            <div class="brand">GearGuard</div>
            <h1>Something went wrong</h1>
            <p class="card-subtitle">${escapeHtml(e?.message || 'Unknown error')}</p>
          </div>
          <div class="auth-switch">
            <a href="#/login">Back to login</a>
          </div>
        </div>
      </div>
    `);
  }
}

window.addEventListener('hashchange', () => {
  renderRoute();
});

// Initial render
if (!location.hash) {
  location.hash = '#/login';
}
renderRoute();
