(() => {
  const API_URL = "https://wassel-backend-ds3n.onrender.com";
  const params = new URLSearchParams(window.location.search);

  function injectStyles() {
    if (document.getElementById("velto-auth-social-styles")) return;
    const style = document.createElement("style"); style.id = "velto-auth-social-styles";
    style.textContent = `.oauth-row{grid-template-columns:1fr!important}.btn-oauth{min-height:52px;transition:transform .22s ease,filter .22s ease}.btn-oauth:hover{transform:translateY(-2px);filter:brightness(1.04)}.btn-oauth[data-provider="Apple"] .oauth-icon{display:inline-flex;align-items:center;justify-content:center;font-size:19px}.btn-oauth[data-provider="Apple"] .oauth-icon:after{content:""}.btn-phone-auth .oauth-icon{font-size:11px;font-weight:800;letter-spacing:-.4px}.phone-auth-panel{margin-top:12px;padding:16px;border-radius:24px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 14px 40px rgba(30,24,16,.08);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);animation:veltoPhoneIn .28s ease both}.phone-auth-title{font-weight:700;margin-bottom:10px}.phone-auth-actions{display:flex;gap:8px;margin-top:10px}.phone-auth-actions>*{flex:1}.phone-code-row{margin-top:8px}.phone-auth-panel .form-error{min-height:18px;margin:8px 0 0}@keyframes veltoPhoneIn{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}`;
    document.head.appendChild(style);
  }
  function selectedRole() { return document.querySelector(".role-card.selected")?.dataset.role || "client"; }
  function replaceButton(button, handler) { const clone = button.cloneNode(true); button.replaceWith(clone); clone.addEventListener("click", handler); return clone; }
  function showAuthError(message) { const activeForm = document.querySelector("#login-form:not(.hidden), #register-form:not(.hidden)"); const el = activeForm?.querySelector(".form-error"); if (el) el.textContent = message; else alert(message); }
  function startProvider(provider) { const mode = document.querySelector("#login-form:not(.hidden)") ? "login" : "register"; const role = mode === "register" ? selectedRole() : "client"; if (mode === "register" && !document.querySelector(".role-card.selected")) return showAuthError("Choisissez votre rôle avant de continuer."); window.location.href = `${API_URL}/auth/${provider}?mode=${mode}&role=${encodeURIComponent(role)}`; }
  function ensurePhonePanel() {
    if (document.getElementById("phone-auth-panel")) return document.getElementById("phone-auth-panel");
    const form = document.querySelector("#login-form"); if (!form) return null;
    const panel = document.createElement("div"); panel.id = "phone-auth-panel"; panel.className = "phone-auth-panel hidden";
    panel.innerHTML = `<div class="phone-auth-title">Connexion par numéro</div><label>Numéro de téléphone<input id="auth-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+216 XX XXX XXX"></label><div class="phone-code-row hidden" id="phone-code-row"><label>Code SMS<input id="auth-phone-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="Code reçu par SMS"></label></div><div class="phone-auth-actions"><button type="button" class="btn-primary" id="phone-send-code">Recevoir le code</button><button type="button" class="btn-ghost" id="phone-cancel">Annuler</button></div><p class="form-error" id="phone-auth-error"></p>`;
    form.querySelector(".oauth-row")?.after(panel);
    panel.querySelector("#phone-cancel").addEventListener("click", () => panel.classList.add("hidden"));
    panel.querySelector("#phone-send-code").addEventListener("click", requestOrVerifyPhone);
    return panel;
  }
  async function requestOrVerifyPhone() {
    const panel = document.getElementById("phone-auth-panel"), phone = document.getElementById("auth-phone")?.value.trim() || "", codeRow = document.getElementById("phone-code-row"), button = document.getElementById("phone-send-code"), error = document.getElementById("phone-auth-error");
    error.textContent = ""; button.disabled = true;
    try {
      if (codeRow.classList.contains("hidden")) {
        const res = await fetch(`${API_URL}/auth/phone/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) }); const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Impossible d'envoyer le code."); codeRow.classList.remove("hidden"); button.textContent = "Vérifier le code"; document.getElementById("auth-phone-code")?.focus();
      } else {
        const code = document.getElementById("auth-phone-code")?.value.trim() || ""; const res = await fetch(`${API_URL}/auth/phone/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code, role: selectedRole() }) }); const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Code incorrect."); panel.classList.add("hidden"); onLoggedIn(data.user, data.token);
      }
    } catch (err) { error.textContent = err.message; } finally { button.disabled = false; }
  }
  function setup() {
    injectStyles();
    document.querySelectorAll(".btn-oauth[data-provider]").forEach((button) => replaceButton(button, () => startProvider(button.dataset.provider.toLowerCase())));
    const loginForm = document.getElementById("login-form");
    if (loginForm && !loginForm.querySelector(".btn-phone-auth")) { const row = loginForm.querySelector(".oauth-row"); const phoneButton = document.createElement("button"); phoneButton.type = "button"; phoneButton.className = "btn-oauth btn-phone-auth"; phoneButton.innerHTML = '<span class="oauth-icon">+216</span> Continuer avec mon numéro'; phoneButton.addEventListener("click", () => ensurePhonePanel()?.classList.remove("hidden")); row?.appendChild(phoneButton); }
    if (params.has("auth")) {
      const authParams = new URLSearchParams(params.get("auth")), token = authParams.get("token"), error = authParams.get("error");
      if (token) fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then((data) => { if (data.user) onLoggedIn(data.user, token); else showAuthError("Session d'authentification invalide."); }).catch(() => showAuthError("Impossible de restaurer la session.")); else if (error) showAuthError(error);
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup, { once: true }); else setup();
})();
