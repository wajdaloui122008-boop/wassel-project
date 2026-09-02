(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  const token = () => localStorage.getItem("velto_token") || "";
  const auth = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  const json = async r => { try { return await r.json(); } catch { return {}; } };
  let config = null;
  let stripe = null;
  let elements = null;
  let activePayment = null;
  let scanInFlight = false;
  const scanAttempts = new Map();
  const SCAN_RETRY_COOLDOWN_MS = 20000;

  function ensureUi() {
    if (document.getElementById("velto-payment-modal")) return;
    const el = document.createElement("div");
    el.id = "velto-payment-modal";
    el.style.cssText = "display:none;position:fixed;inset:0;z-index:200000;background:rgba(10,8,6,.62);backdrop-filter:blur(10px);align-items:center;justify-content:center;padding:20px";
    el.innerHTML = `<div style="width:min(520px,100%);background:#fffaf2;color:#211d18;border-radius:24px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.35)"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><h2 style="margin:0 0 5px;font-family:Sora,Inter,sans-serif">Paiement sécurisé</h2><p id="velto-payment-summary" style="margin:0;color:#857a67;font-size:13px"></p></div><button id="velto-payment-close" type="button" class="btn-ghost">✕</button></div><div id="velto-payment-body" style="margin-top:20px"><p id="velto-payment-message" style="color:#857a67">Préparation du paiement…</p><div id="velto-payment-element"></div></div><p id="velto-payment-error" style="color:#b42318;font-size:13px"></p><button id="velto-payment-submit" type="button" class="btn-primary" style="width:100%;margin-top:12px;display:none">Payer maintenant</button></div>`;
    document.body.appendChild(el);
    document.getElementById("velto-payment-close").onclick = close;
    document.getElementById("velto-payment-submit").onclick = confirmStripePayment;
  }
  function close() { const el=document.getElementById("velto-payment-modal"); if(el) el.style.display="none"; activePayment=null; elements=null; }
  function open() { ensureUi(); document.getElementById("velto-payment-modal").style.display="flex"; }
  function setMessage(text) { const el=document.getElementById("velto-payment-message"); if(el) el.textContent=text; }
  function setError(text) { const el=document.getElementById("velto-payment-error"); if(el) el.textContent=text || ""; }
  function amountText(order) { return `${Number(order.fee || 0).toFixed(3)} ${String(order.currency || "TND").toUpperCase()}`; }

  async function loadStripe() {
    if (stripe) return stripe;
    if (!config?.stripePublishableKey) return null;
    await new Promise((resolve,reject)=>{ if(window.Stripe) return resolve(); const s=document.createElement("script"); s.src="https://js.stripe.com/v3/"; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); });
    stripe = window.Stripe(config.stripePublishableKey);
    return stripe;
  }

  async function startPayment(order) {
    if (!order?.id || !["carte","wallet"].includes(order.paymentMethod) || order.paymentStatus === "paid") return;
    const key = `velto_payment_${order.id}`;
    if (sessionStorage.getItem(key) === "done") return;
    open();
    activePayment = {...order, _orderId:String(order.id)};
    setError("");
    const mount=document.getElementById("velto-payment-element"); if(mount) mount.innerHTML="";
    document.getElementById("velto-payment-summary").textContent = `Commande #${String(order.id).slice(-5)} · ${amountText(order)}`;
    document.getElementById("velto-payment-submit").style.display="none";
    setMessage("Création de la transaction…");
    try {
      if (!config) { const cr=await fetch(`${API}/payments/config`); config=await json(cr); }
      const idempotency = `${order.id}_${order.paymentMethod}`;
      const r=await fetch(`${API}/payments`,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":idempotency,...auth()},body:JSON.stringify({orderId:order.id})});
      const d=await json(r);
      if(!r.ok) throw Error(d.error || "Impossible de créer le paiement");
      activePayment.payment=d.payment; activePayment.clientSecret=d.clientSecret || d.payment?.metadata?.clientSecret || null;
      if (d.payment?.status === "paid" || d.order?.paymentStatus === "paid") { sessionStorage.setItem(key,"done"); setMessage("Paiement confirmé."); setTimeout(close,1200); return; }
      if (config.provider === "stripe" && activePayment.clientSecret) {
        const s=await loadStripe();
        if(!s) throw Error("Stripe.js n'a pas pu être chargé.");
        elements=s.elements({clientSecret:activePayment.clientSecret,appearance:{theme:"stripe",variables:{colorPrimary:"#b78b3c",borderRadius:"12px"}}});
        const paymentElement=elements.create("payment");
        paymentElement.mount("#velto-payment-element");
        setMessage("Saisissez vos informations de paiement. Les données de carte sont traitées par Stripe.");
        document.getElementById("velto-payment-submit").style.display="block";
      } else {
        setMessage(config.provider === "mock" ? "Mode test actif : aucun paiement réel n'est débité. Configurez un fournisseur de paiement pour activer la carte." : "Le paiement en ligne n'est pas encore configuré.");
      }
    } catch(err) { setError(err.message || "Erreur paiement"); setMessage("Le paiement n'a pas pu être préparé."); }
  }

  async function confirmStripePayment() {
    if(!stripe || !elements || !activePayment?.clientSecret) return;
    const btn=document.getElementById("velto-payment-submit"); btn.disabled=true; btn.textContent="Confirmation…"; setError("");
    try {
      const result=await stripe.confirmPayment({elements,redirect:"if_required"});
      if(result.error) throw Error(result.error.message || "Paiement refusé");
      setMessage("Paiement envoyé. Confirmation en cours…");
      for(let i=0;i<8;i++){
        await new Promise(r=>setTimeout(r,1000));
        const r=await fetch(`${API}/payments/${activePayment._orderId}`,{headers:auth()}); const d=await json(r);
        if(r.ok && d.payment?.status === "paid") { sessionStorage.setItem(`velto_payment_${activePayment._orderId}`,"done"); setMessage("Paiement confirmé ✓"); window.__veltoRefreshOrders?.(); setTimeout(close,1200); return; }
        if(r.ok && d.payment?.status === "failed") throw Error("Le paiement a échoué.");
      }
      setMessage("Paiement envoyé. La confirmation finale arrivera après le webhook du fournisseur.");
    } catch(err) { setError(err.message || "Erreur de confirmation"); }
    finally { btn.disabled=false; btn.textContent="Payer maintenant"; }
  }

  async function scan() {
    if(!token() || scanInFlight || activePayment) return;
    scanInFlight=true;
    try {
      const r=await fetch(`${API}/orders`,{headers:auth()}); if(!r.ok) return; const data=await json(r); if(!Array.isArray(data)) return;
      const now=Date.now();
      for(const [id,at] of scanAttempts) if(now-at>SCAN_RETRY_COOLDOWN_MS) scanAttempts.delete(id);
      const pending=data
        .filter(o=>["carte","wallet"].includes(o.paymentMethod)&&o.paymentStatus!=="paid"&&o.status!=="annulee")
        .sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
      const candidate=pending.find(o=>sessionStorage.getItem(`velto_payment_${o.id}`)!=="done"&&!scanAttempts.has(String(o.id)));
      if(candidate) {
        scanAttempts.set(String(candidate.id),now);
        await startPayment(candidate);
      }
    } catch {} finally { scanInFlight=false; }
  }
  ensureUi();
  setTimeout(scan,2500);
  setInterval(scan,7000);
  window.addEventListener("velto:auth",()=>setTimeout(scan,250));
  window.addEventListener("velto:orders-updated",()=>setTimeout(scan,100));
  window.veltoStartPayment = startPayment;
})();
