(() => {
  const API_URL = "https://wassel-backend-ds3n.onrender.com";
  const params = new URLSearchParams(window.location.search);

  function selectedRole() {
    return document.querySelector(".role-card.selected")?.dataset.role || "client";
  }
  function replaceButton(button, handler) {
    const clone = button.cloneNode(true);
    button.replaceWith(clone);
    clone.addEventListener("click", handler);
    return clone;
  }
  function showAuthError(message) {
    const activeForm = document.querySelector("#login-form:not(.hidden), #register-form:not(.hidden)");
    const el = activeForm?.querySelector(".form-error");
    if (el) el.textContent = message;
    else alert(message);
  }
  function startProvider(provider) {
    const mode = document.querySelector("#login-form:not(.hidden)") ? "login" : "register";
    const role = mode === "register" ? selectedRole() : "client";
    if (mode === "register" && role === "client" && !document.querySelector(".role-card.selected")) {
      showAuthError("Choisissez votre rôle avant de continuer.");
      return;
    }
    window.location.href = `${API_URL}/auth/${provider}?mode=${mode}&role=${encodeURIComponent(role)}`;
  }
  function ensurePhonePanel() {
    if (document.getElementById("phone-auth-panel")) return document.getElementById("phone-auth-panel");
    const form = document.querySelector("#login-form");
    if (!form) return null;
    const panel = document.createElement("div");
    panel.id = "phone-auth-panel";
    panel.className = "phone-auth-panel hidden";
    panel.innerHTML = `
      <div class="phone-auth-title">Connexion par numéro</div>
      <label>Numéro de téléphone<input id="auth-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+216 XX XXX XXX"></label>
      <div class="phone-code-row hidden" id="phone-code-row"><label>Code SMS<input id="auth-phone-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="Code reçu par SMS"></label></div>
      <div class="phone-auth-actions"><button type="button" class="btn-primary" id="phone-send-code">Recevoir le code</button><button type="button" class="btn-ghost" id="phone-cancel">Annuler</button></div>
      <p class="form-error" id="phone-auth-error"></p>`;
    const oauth = form.querySelector(".oauth-row");
    oauth?.after(panel);
    panel.querySelector("#phone-cancel").addEventListener("click", () => panel.classList.add("hidden"));
    panel.querySelector("#phone-send-code").addEventListener("click", requestOrVerifyPhone);
    return panel;
  }
  async function requestOrVerifyPhone() {
    const panel = document.getElementById("phone-auth-panel");
    const phone = document.getElementById("auth-phone")?.value.trim() || "";
    const codeRow = document.getElementById("phone-code-row");
    const button = document.getElementById("phone-send-code");
    const error = document.getElementById("phone-auth-error");
    error.textContent = "";
    button.disabled = true;
    try {
      if (codeRow.classList.contains("hidden")) {
        const res = await fetch(`${API_URL}/auth/phone/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Impossible d'envoyer le code.");
        codeRow.classList.remove("hidden");
        button.textContent = "Vérifier le code";
        document.getElementById("auth-phone-code")?.focus();
      } else {
        const code = document.getElementById("auth-phone-code")?.value.trim() || "";
        const role = selectedRole();
        const res = await fetch(`${API_URL}/auth/phone/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code, role }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Code incorrect.");
        panel.classList.add("hidden");
        onLoggedIn(data.user, data.token);
      }
    } catch (err) { error.textContent = err.message; }
    finally { button.disabled = false; }
  }
  function setup() {
    document.querySelectorAll(".btn-oauth[data-provider]").forEach((button) => replaceButton(button, () => startProvider(button.dataset.provider.toLowerCase())));
    const loginForm = document.getElementById("login-form");
    if (loginForm && !loginForm.querySelector(".btn-phone-auth")) {
      const row = loginForm.querySelector(".oauth-row");
      const phoneButton = document.createElement("button");
      phoneButton.type = "button"; phoneButton.className = "btn-oauth btn-phone-auth"; phoneButton.innerHTML = '<span class="oauth-icon">+216</span> Continuer avec mon numéro';
      phoneButton.addEventListener("click", () => ensurePhonePanel()?.classList.remove("hidden"));
      row?.appendChild(phoneButton);
    }
    if (params.has("auth")) {
      const authParams = new URLSearchParams(params.get("auth"));
      const token = authParams.get("token");
      const error = authParams.get("error");
      if (token) {
        fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then((data) => { if (data.user) onLoggedIn(data.user, token); else showAuthError("Session d'authentification invalide."); }).catch(() => showAuthError("Impossible de restaurer la session."));
      } else if (error) showAuthError(error);
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup, { once: true }); else setup();
})();
