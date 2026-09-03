(() => {
  const API_URL = "https://wassel-backend-ds3n.onrender.com";
  const TOKEN_KEY = "velto_token";

  function currentRole() {
    const selected = document.querySelector(".role-card.selected");
    return selected?.dataset.role || "client";
  }

  function showAuthError(message) {
    const activeForm = document.querySelector("#login-form:not(.hidden), #register-form:not(.hidden)");
    const error = activeForm?.querySelector(".form-error");
    if (error) error.textContent = message;
    else window.alert(message);
  }

  function cleanAuthQuery() {
    const params = new URLSearchParams(window.location.search);
    params.delete("auth");
    const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  function finishOAuth() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("auth");
    if (!raw) return false;

    const auth = new URLSearchParams(raw);
    const token = auth.get("token");
    const error = auth.get("error");
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      cleanAuthQuery();
      window.location.reload();
      return true;
    }
    if (error) {
      cleanAuthQuery();
      showAuthError(error);
      return true;
    }
    cleanAuthQuery();
    return false;
  }

  function bindProviderButton(button) {
    if (button.dataset.socialAuthBound === "1") return;
    button.dataset.socialAuthBound = "1";
    button.addEventListener("click", (event) => {
      const provider = String(button.dataset.provider || "").toLowerCase();
      if (provider !== "google" && provider !== "apple") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const role = encodeURIComponent(currentRole());
      button.disabled = true;
      window.location.assign(`${API_URL}/auth/${provider}?role=${role}`);
    }, true);
  }

  function bind() {
    document.querySelectorAll(".btn-oauth[data-provider]").forEach(bindProviderButton);
    finishOAuth();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
