const STORAGE_KEY = "pukis.session";

let session = readSession();
let pendingSession = null;

export async function api(path, options = {}) {
  await ensureSession();
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${session.token}`
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    clearSession();
    await ensureSession();
    return api(path, options);
  }
  if (!response.ok) throw new Error(payload.error || "Error de API");
  return payload;
}

export async function ensureSession() {
  if (session?.token && session?.user) return session;
  if (!pendingSession) pendingSession = showLogin();
  session = await pendingSession;
  pendingSession = null;
  return session;
}

export function currentUser() {
  return session?.user || null;
}

export function renderSessionBadge(target = document.body) {
  const badge = document.createElement("button");
  badge.className = "session-badge";
  badge.type = "button";
  badge.textContent = session?.user ? session.user.name : "Ingresar";
  badge.addEventListener("click", async () => {
    clearSession();
    await ensureSession();
    badge.textContent = session.user.name;
    window.location.reload();
  });
  target.append(badge);
}

function showLogin() {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "pin-dialog";
    dialog.innerHTML = `
      <form class="pin-card" method="dialog">
        <img src="/assets/square-logo.png?v=20260508" alt="">
        <h2>Zonina</h2>
        <p>Ingresa tu PIN para identificarte.</p>
        <input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" placeholder="PIN" required>
        <button type="submit">Entrar</button>
        <small class="pin-error" aria-live="polite"></small>
      </form>
    `;
    document.body.append(dialog);
    const form = dialog.querySelector("form");
    const input = dialog.querySelector("input");
    const error = dialog.querySelector(".pin-error");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      try {
        const nextSession = await login(input.value);
        saveSession(nextSession);
        session = nextSession;
        dialog.close();
        dialog.remove();
        resolve(nextSession);
      } catch (loginError) {
        error.textContent = loginError.message;
        input.select();
      }
    });

    dialog.showModal();
    input.focus();
  });
}

async function login(pin) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No pude iniciar sesion.");
  return payload;
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function clearSession() {
  session = null;
  localStorage.removeItem(STORAGE_KEY);
}
