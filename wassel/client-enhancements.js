(() => {
  const $ = (s) => document.querySelector(s);
  let filter = "all";
  function addStyles(){
    if($("#client-enhance-style")) return;
    const s=document.createElement("style");s.id="client-enhance-style";s.textContent=`.ce-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px}.ce-tab{border:1px solid rgba(36,28,16,.12);background:white;border-radius:999px;padding:8px 12px;cursor:pointer;font-weight:700}.ce-tab.active{background:#211d18;color:#fff}.ce-meta{font-size:12px;color:#857a67;margin:6px 0}.ce-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.ce-action{border:1px solid rgba(36,28,16,.12);background:white;border-radius:10px;padding:8px 11px;cursor:pointer;font-weight:700}`;document.head.appendChild(s);
  }
  function setup(){
    if(!window.currentUser || window.currentUser.role!=="client") return;
    const host=$("#client-orders"); if(!host||$("#ce-tabs")) return;
    const tabs=document.createElement("div");tabs.id="ce-tabs";tabs.className="ce-tabs";tabs.innerHTML=`<button class="ce-tab active" data-f="all">Toutes</button><button class="ce-tab" data-f="active">Actives</button><button class="ce-tab" data-f="livree">Livrées</button><button class="ce-tab" data-f="annulee">Annulées</button>`;host.parentNode.insertBefore(tabs,host);
    tabs.querySelectorAll(".ce-tab").forEach(b=>b.onclick=()=>{tabs.querySelectorAll(".ce-tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");filter=b.dataset.f;render()});
  }
  function list(){const os=Array.isArray(window.orders)?window.orders:[];return os.filter(o=>filter==="all"?true:filter==="active"?["nouvelle","acceptee","route"].includes(o.status):o.status===filter).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)}
  function render(){
    if(!window.currentUser||window.currentUser.role!=="client")return;setup();const host=$("#client-orders");if(!host||typeof window.renderList!=="function")return;
    window.renderList("client-orders",list(),"Aucune commande dans cette catégorie.",()=>[]);
    host.querySelectorAll(".order-card").forEach(card=>{const id=(card.querySelector(".order-id")?.textContent||"").replace(/^#/,'');const o=list().find(x=>String(x.id).endsWith(id));if(!o)return;const meta=document.createElement("div");meta.className="ce-meta";meta.textContent=o.status==="annulee"?`Annulée · ${o.cancellationReason||"Aucune raison indiquée"}`:`Créée le ${o.createdAt?new Date(o.createdAt).toLocaleString("fr-TN"):"—"}`;card.appendChild(meta);if(o.status==="livree"){const actions=document.createElement("div");actions.className="ce-actions";const btn=document.createElement("button");btn.className="ce-action";btn.textContent="↻ Refaire cette commande";btn.onclick=()=>{const p=document.querySelector("#pickup"),d=document.querySelector("#dropoff"),pkg=document.querySelector("#package");if(p)p.value=o.pickup||"";if(d)d.value=o.dropoff||"";if(pkg)pkg.value=o.pkg||"";document.querySelector('[data-category="colis"]')?.click();window.scrollTo({top:0,behavior:"smooth"})};actions.appendChild(btn);card.appendChild(actions)}});
  }
  function boot(){addStyles();const original=window.renderClientOrders;if(typeof original!=="function")return;window.renderClientOrders=()=>render();if(window.currentUser?.role==="client")render();}
  setTimeout(boot,800);setInterval(()=>{if(window.currentUser?.role==="client")setup()},1500);
})();