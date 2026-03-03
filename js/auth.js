const getAuthUrl = () => {
  const base = window.SANDBOX_URL || window.location.origin;
  return new URL('/auth', base).toString();
};
const TOKEN_KEY = 'sf_jwt';
const USER_KEY  = 'sf_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

export function isLoggedIn() {
  const token = getToken();
  if (!token) return false;
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return exp * 1000 > Date.now();
  } catch { return false; }
}

function signOut() {
  const user = getUser();
  if (user?.email) window.google?.accounts?.id?.revoke(user.email, () => {});
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  renderAuthUI();
}

async function exchangeToken(id_token) {
  const res = await fetch(getAuthUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Auth error ${res.status}`);
  const { token, user } = await res.json();
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

// ── Auth UI in header ──────────────────────────────────────────────────────────

export function renderAuthUI() {
  const el = document.getElementById('auth-status');
  if (!el) return;
  const user = getUser();
  if (isLoggedIn() && user) {
    el.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        ${user.picture ? `<img src="${user.picture}" width="28" height="28" class="rounded-circle border" alt="">` : ''}
        <small class="text-muted d-none d-sm-inline text-truncate" style="max-width:150px">${user.email}</small>
        <button class="btn btn-sm btn-outline-secondary" id="sign-out-btn"><i class="bi bi-box-arrow-right"></i></button>
      </div>`;
    document.getElementById('sign-out-btn').addEventListener('click', signOut);
  } else {
    el.innerHTML = `<small class="text-muted"><i class="bi bi-cloud-lock me-1"></i>Sign in required for cloud run</small>`;
  }
}

// ── Login modal ────────────────────────────────────────────────────────────────

export function ensureLoggedIn(clientId) {
  if (isLoggedIn()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    // Build modal
    const existing = document.getElementById('auth-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="auth-modal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered" style="max-width:380px">
          <div class="modal-content">
            <div class="modal-header border-0">
              <h5 class="modal-title">Sign in to run on cloud</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body text-center pb-4">
              <p class="text-muted mb-4">Cloud execution requires a Google account.</p>
              <div id="auth-modal-btn"></div>
              <div id="auth-modal-error" class="alert alert-danger mt-3 d-none"></div>
            </div>
          </div>
        </div>
      </div>`);

    const modalEl = document.getElementById('auth-modal');
    const bsModal = new bootstrap.Modal(modalEl);

    modalEl.addEventListener('hidden.bs.modal', () => {
      if (!isLoggedIn()) reject(new Error('Login cancelled'));
    }, { once: true });

    bsModal.show();

    modalEl.addEventListener('shown.bs.modal', () => {
      if (!window.google?.accounts?.id) {
        document.getElementById('auth-modal-error').textContent = 'Google Sign-In failed to load. Refresh the page.';
        document.getElementById('auth-modal-error').classList.remove('d-none');
        return;
      }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          try {
            const user = await exchangeToken(credential);
            bsModal.hide();
            renderAuthUI();
            resolve(user);
          } catch (err) {
            const errEl = document.getElementById('auth-modal-error');
            errEl.textContent = err.message;
            errEl.classList.remove('d-none');
          }
        },
        ux_mode: 'popup',
      });
      window.google.accounts.id.renderButton(
        document.getElementById('auth-modal-btn'),
        { theme: 'outline', size: 'large', text: 'signin_with' }
      );
    }, { once: true });
  });
}
