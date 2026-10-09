// -*- coding: utf-8 -*-
// أوتو أويل — POS & Inventory front-end (vanilla JS)
// Part 1: helpers, icons, state, router, toast, modal
'use strict';

// ------------------------------ helpers ------------------------------
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LOW = 5;
const CATS = ['زيت محرك','زيت جيربوكس','زيت دفرنش','فلاتر','سوائل أخرى'];
const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

const fmt = n => new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(+n||0) + ' ج.م';

function fmtDate(s){
  const d = new Date(String(s).replace(' ','T'));
  if (isNaN(d)) return esc(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} • ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function api(path, method='GET', body){
  const opt = {method};
  if (method==='POST'){ opt.headers={'Content-Type':'application/json'}; opt.body=JSON.stringify(body||{}); }
  const r = await fetch(path, opt);
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(j.error || 'حدث خطأ غير متوقع');
  return j;
}

// ------------------------------ icons ------------------------------
const svg = p => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = {
  grid:  svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  cart:  svg('<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2 3h3l2.6 12.5a1.8 1.8 0 0 0 1.8 1.5h8.7a1.8 1.8 0 0 0 1.8-1.5L22 8H6"/>'),
  box:   svg('<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>'),
  plus:  svg('<path d="M12 5v14M5 12h14"/>'),
  truck: svg('<rect x="1" y="6" width="13" height="10" rx="1.5"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="M8 17v-6M13 17V7M18 17v-3"/>'),
  scan:  svg('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 9v6M12 9v6M16 9v6"/>'),
  search:svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  print: svg('<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>'),
  back:  svg('<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  edit:  svg('<path d="M17 3a2.8 2.8 0 1 1 4 4L7 21l-4 1 1-4L17 3z"/>'),
  coins: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/>'),
  alert: svg('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  trend: svg('<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>'),
  book:  svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  check: svg('<path d="M20 6L9 17l-5-5"/>'),
  chev:  svg('<path d="M15 18l-6-6 6-6"/>'),
  drop:  svg('<path d="M12 2s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>')
};
const icon = n => IC[n] || '';

// ------------------------------ state ------------------------------
const S = {
  view:'dashboard', cart:[], posQ:'', posCat:'الكل',
  invQ:'', invFilter:'all', products:[], suppliers:[],
  product:null, supplierId:null
};

// ------------------------------ toast / modal ------------------------------
let toastTimer;
function toast(msg, type='ok'){
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.className=''; }, 2800);
}
function openModal(html){
  $('#modalRoot').innerHTML =
    `<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
}
function closeModal(){ $('#modalRoot').innerHTML=''; }

// ------------------------------ barcode bars ------------------------------
function barcodeHTML(code){
  let s = '';
  const bar = (w,g) => s += `<span style="display:inline-block;width:${w}px;height:100%;background:${g?'transparent':'#111'}"></span>`;
  bar(2); bar(1,1);
  for (const ch of String(code||'000000')){
    const d = ch.charCodeAt(0);
    bar((d%3)+1); bar(((d>>1)%2)+1,1); bar((d%2)+1); bar(((d>>3)%2)+1,1);
  }
  bar(2);
  return `<div class="bars">${s}</div>`;
}

// ------------------------------ router ------------------------------
function go(view, arg){
  S.view = view;
  $$('.nav-btn').forEach(b => b.classList.toggle('active',
    b.dataset.view===view ||
    (view==='movements' && b.dataset.view==='inventory') ||
    (view==='item' && arg && b.dataset.view==='inventory') ||
    (view==='ledger' && b.dataset.view==='suppliers')));
  $$('.view').forEach(x => x.classList.remove('active'));
  $('#view-'+view).classList.add('active');
  const R = {
    dashboard: renderDashboard,
    pos: renderPOS,
    inventory: renderInventory,
    item: () => renderItemForm(arg||null),
    movements: () => renderMovements(arg),
    suppliers: renderSuppliers,
    ledger: () => renderLedger(arg),
    reports: renderReports
  };
  (R[view] || renderDashboard)();
  window.scrollTo({top:0});
}
function refreshCurrent(){
  const map = {
    dashboard: renderDashboard, pos: renderPOS, inventory: renderInventory,
    suppliers: renderSuppliers, reports: renderReports,
    movements: () => renderMovements(S.product),
    ledger: () => renderLedger(S.supplierId),
    item: () => renderItemForm(S.product)
  };
  (map[S.view] || renderDashboard)();
}

// ============================== DASHBOARD ==============================
async function renderDashboard(){
  const v = $('#view-dashboard');
  let d, prods;
  try { [d,prods] = await Promise.all([api('/api/dashboard'), api('/api/products')]); }
  catch(e){ return toast(e.message,'err'); }
  S.products = prods;
  const low = prods.filter(p=>p.stock<=LOW).sort((a,b)=>a.stock-b.stock).slice(0,5);
  const max = Math.max(...d.week.map(w=>w.sales), 1);
  const t = new Date();
  v.innerHTML = `
  <div class="page-head"><div>
    <h1>أهلاً بك 👋</h1>
    <p>${DAYS[t.getDay()]}، ${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()} — ملخص أداء المحطة</p>
  </div></div>
  <div class="kpis">
    <div class="kpi card"><div><div class="l">مبيعات اليوم</div><div class="v">${fmt(d.today_sales)}</div><div class="l">${d.today_count} فاتورة اليوم</div></div><div class="chip indigo">${icon('cart')}</div></div>
    <div class="kpi card"><div><div class="l">صافي ربح اليوم</div><div class="v" style="color:#047857">${fmt(d.today_profit)}</div></div><div class="chip green">${icon('trend')}</div></div>
    <div class="kpi card"><div><div class="l">مستحقات الموردين</div><div class="v" style="color:${d.liabilities>0?'#B91C1C':'#047857'}">${fmt(d.liabilities)}</div></div><div class="chip ${d.liabilities>0?'red':'green'}">${icon('coins')}</div></div>
    <div class="kpi card"><div><div class="l">حالة المخزون</div><div class="v">${d.products} صنف</div><div class="l">${d.low_stock} منخفض • ${d.out_stock} نفد</div></div><div class="chip amber">${icon('alert')}</div></div>
  </div>
  <div class="dash-grid">
    <div class="card pad">
      <div class="flex between" style="margin-bottom:4px"><h3 style="margin:0">مبيعات آخر 7 أيام</h3><span class="badge indigo">بالجنيه المصري</span></div>
      <div class="chart">${d.week.map((w,i)=>`
        <div class="cbar" title="${w.count} فاتورة — ${fmt(w.sales)}">
          <em>${w.sales>=1000?(w.sales/1000).toFixed(1)+'k':Math.round(w.sales)}</em>
          <span style="height:${Math.max(3,Math.round(w.sales/max*100))}%" class="${i===6?'today':''}"></span>
          <i>${DAYS[new Date(w.date+'T00:00:00').getDay()]}</i>
        </div>`).join('')}</div>
  </div>
    <div class="card pad"><h3 style="margin:0 0 10px">أصناف تحتاج توريد</h3>
      <div class="low-list">${low.length ? low.map(p=>`
        <div><div><b>${esc(p.name)}</b><div class="tsub">${esc(p.brand||'')} • ${esc(p.size||'')}</div></div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="badge ${p.stock===0?'red':'amber'}">${p.stock===0?'نفد':p.stock+' متبقي'}</span>
          <button class="btn sm" data-act="restock" data-id="${p.id}">توريد</button>
        </div></div>`).join('') : `<div class="empty">المخزون بحالة جيدة 👌</div>`}</div>
    </div>
  </div>
  <div class="nav-cards">
    <div class="ncard" data-go="reports"><div class="chip indigo">${icon('chart')}</div><div><b>تقارير المبيعات التفصيلية</b><p>عرض جميع الفواتير والأرباح والمرتجعات</p></div><span class="arr">${icon('chev')}</span></div>
    <div class="ncard" data-go="suppliers"><div class="chip amber">${icon('truck')}</div><div><b>حسابات الموردين</b><p>المستحقات وكشوف الحساب والدفعات</p></div><span class="arr">${icon('chev')}</span></div>
    <div class="ncard" data-go="inventory"><div class="chip green">${icon('box')}</div><div><b>إدارة المخزون والأصناف</b><p>الأصناف والتوريد وحركات المخزون</p></div><span class="arr">${icon('chev')}</span></div>
  </div>`;
}

// ============================== POS ==============================
async function renderPOS(){
  const v = $('#view-pos');
  try { S.products = await api('/api/products'); } catch(e){ return toast(e.message,'err'); }
  const cats = ['الكل', ...new Set(S.products.map(p=>p.category).filter(Boolean))];
  v.innerHTML = `
  <div class="page-head"><div><h1>نقطة البيع</h1><p>امسح باركود الصنف أو اختره من القائمة لإضافته للفاتورة</p></div></div>
  <div class="scan">${icon('scan')}<input id="scan" autocomplete="off" placeholder="امسح الباركود ثم اضغط Enter…"/></div>
  <div class="pos-wrap">
    <div style="min-width:0">
      <div class="toolbar">
        <div class="search">${icon('search')}<input id="posSearch" class="input" placeholder="بحث بالاسم أو الماركة…" value="${esc(S.posQ)}"/></div>
        <div class="pills" id="posCats">${cats.map(c=>`<button class="pill ${c===S.posCat?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      </div>
      <div id="posGrid" class="pos-grid"></div>
    </div>
    <aside class="card pos-cart">
      <div class="cart-head"><b>الفاتورة الحالية</b><span id="cartCount" class="badge indigo">0 صنف</span></div>
      <div id="cartItems" class="cart-items"></div>
      <div class="cart-foot">
        <div class="cart-sub"><span>عدد القطع</span><b id="cartUnits">0</b></div>
        <div class="cart-total"><span>الإجمالي المستحق</span><b id="cartTotal">0 ج.م</b></div>
        <button id="btnCheckout" class="btn blue xl">تأكيد البيع</button>
        <button id="btnClear" class="btn ghost" style="width:100%;margin-top:8px">تفريغ الفاتورة</button>
      </div>
    </aside>
  </div>`;
  renderGrid(); renderCart();
  $('#posSearch').addEventListener('input', e=>{ S.posQ=e.target.value; renderGrid(); });
  $('#scan').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); scanEnter(); } });
  $('#btnCheckout').onclick = checkout;
  $('#btnClear').onclick = () => { S.cart=[]; renderCart(); };
  $('#scan').focus();
}

function renderGrid(){
  const q = S.posQ.trim().toLowerCase();
  const list = S.products.filter(p =>
    (S.posCat==='الكل' || p.category===S.posCat) &&
    (!q || [p.name,p.brand,p.sku,p.viscosity].join(' ').toLowerCase().includes(q)));
  $('#posGrid').innerHTML = list.length ? list.map(p=>`
    <div class="tile ${p.stock===0?'out':''}" data-id="${p.id}">
      <span class="t-visc">${esc(p.viscosity||'—')}</span>
      <div class="t-name">${esc(p.name)}</div>
      <div class="t-meta">${esc(p.brand||'')} • ${esc(p.size||'')}</div>
      <div class="t-price">${fmt(p.price)}</div>
      <span class="badge ${p.stock===0?'red':(p.stock<=LOW?'amber':'green')}">${p.stock===0?'نفد':p.stock+' بالمتجر'}</span>
    </div>`).join('') : `<p class="empty">لا توجد أصناف مطابقة</p>`;
}

function renderCart(){
  const box = $('#cartItems'); if(!box) return;
  const units = S.cart.reduce((a,c)=>a+c.qty,0);
  const total = S.cart.reduce((a,c)=>a+c.qty*c.price,0);
  $('#cartCount').textContent = S.cart.length + ' صنف';
  $('#cartUnits').textContent = units;
  $('#cartTotal').textContent = fmt(total);
  $('#btnCheckout').disabled = !S.cart.length;
  box.innerHTML = S.cart.length ? S.cart.map(c=>`
    <div class="cart-row">
      <div class="cr-info"><b>${esc(c.name)}</b><span class="cr-meta">${esc(c.viscosity||'')} ${esc(c.size||'')} • ${fmt(c.price)}</span></div>
      <div class="stepper"><button data-act="dec" data-id="${c.id}">−</button><b>${c.qty}</b><button data-act="inc" data-id="${c.id}">+</button></div>
      <b class="cr-sub">${fmt(c.price*c.qty)}</b>
      <button class="cr-del" data-act="del" data-id="${c.id}">✕</button>
    </div>`).join('') : `<div class="empty">لم تُضف أصناف بعد — امسح باركود أو اختر من القائمة</div>`;
}

function addToCart(id){
  const p = S.products.find(x=>x.id===id); if(!p) return;
  const c = S.cart.find(x=>x.id===id);
  const q = (c?c.qty:0)+1;
  if (q > p.stock) return toast('لا يوجد مخزون كافٍ لهذا الصنف','err');
  if (c) c.qty = q;
  else S.cart.push({id:p.id, name:p.name, price:p.price, viscosity:p.viscosity, size:p.size, stock:p.stock, qty:1});
  renderCart();
}
function setQty(id, d){
  const c = S.cart.find(x=>x.id===id); if(!c) return;
  const q = c.qty + d;
  if (q < 1) return removeFromCart(id);
  if (q > c.stock) return toast('لا يوجد مخزون كافٍ','err');
  c.qty = q; renderCart();
}
function removeFromCart(id){ S.cart = S.cart.filter(c=>c.id!==id); renderCart(); }

function scanEnter(){
  const code = $('#scan').value.trim(); if(!code) return;
  const p = S.products.find(x=>x.sku===code) ||
            S.products.find(x=>code.length>=4 && x.sku.startsWith(code)) ||
            S.products.find(x=>x.name===code);
  if (!p) return toast('لا يوجد صنف بهذا الباركود','err');
  addToCart(p.id);
  $('#scan').value=''; $('#scan').focus();
}

async function checkout(){
  if (!S.cart.length) return toast('الفاتورة فارغة','err');
  const btn = $('#btnCheckout'); btn.disabled = true;
  try {
    const sale = await api('/api/sales','POST',{items:S.cart.map(c=>({product_id:c.id, qty:c.qty}))});
    const det  = await api('/api/sales/'+sale.id);
    S.cart = [];
    S.products = await api('/api/products');
    renderGrid(); renderCart();
    receiptModal(det.sale, det.items);
  } catch(e){ toast(e.message,'err'); }
  btn.disabled = false;
}

function receiptModal(sale, items){
  openModal(`<h3>${icon('check')} تم إتمام البيع بنجاح</h3>
  <p class="sub">فاتورة رقم #${sale.id} — ${fmtDate(sale.created_at)}</p>
  <table class="tbl"><thead><tr><th>الصنف</th><th>كمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
  <tbody>${items.map(i=>`<tr><td>${esc(i.product_name)}</td><td>${i.qty}</td><td>${fmt(i.unit_price)}</td><td>${fmt(i.subtotal)}</td></tr>`).join('')}</tbody></table>
  <div class="cart-total" style="margin-top:14px"><span>الإجمالي المدفوع</span><b>${fmt(sale.total)}</b></div>
  <div class="m-actions">
    <button class="btn outline" id="mPrint">${icon('print')} طباعة الفاتورة</button>
    <button class="btn" id="mDone">بيع جديد</button>
  </div>`);
  $('#mPrint').onclick = () => printReceipt(sale, items);
  $('#mDone').onclick = closeModal;
}

// ============================== INVENTORY ==============================
async function renderInventory(){
  const v = $('#view-inventory');
  v.innerHTML = `
  <div class="page-head"><div>
    <h1>المخزون والأصناف</h1><p>إدارة أصناف الزيوت والمستلزمات ومتابعة المخزون</p>
  </div>
  <button class="btn" data-act="new">${icon('plus')} إضافة صنف جديد</button></div>
  <div class="toolbar">
    <div class="search">${icon('search')}<input id="invSearch" class="input" placeholder="بحث بالاسم أو الماركة أو الباركود…" value="${esc(S.invQ)}"/></div>
    <div class="pills">${[['all','الكل'],['low','مخزون منخفض'],['out','نفد المخزون']].map(([k,l])=>
      `<button class="pill ${S.invFilter===k?'active':''}" data-filter="${k}">${l}</button>`).join('')}</div>
  </div>
  <div class="card tbl-wrap"><table class="tbl"><thead><tr>
    <th>الصنف واللزوجة</th><th>الماركة</th><th>العبوة</th><th>المخزون</th><th>سعر البيع</th><th>ربح/وحدة</th><th>إجراءات</th>
  </tr></thead><tbody id="invBody"></tbody></table></div>`;
  $('#invSearch').addEventListener('input', e=>{ S.invQ=e.target.value; loadInvRows(); });
  await loadInvRows();
}
async function loadInvRows(){
  try { S.products = await api('/api/products?search='+encodeURIComponent(S.invQ)+'&filter='+S.invFilter); }
  catch(e){ return toast(e.message,'err'); }
  const body = $('#invBody'); if(!body) return;
  body.innerHTML = S.products.length ? S.products.map(p=>{
    const st = p.stock===0 ? ['red','نفد المخزون'] : (p.stock<=LOW ? ['amber', p.stock+' — منخفض'] : ['green', p.stock+' بالمتجر']);
    const m = p.price - p.cost;
    return `<tr>
      <td><b>${esc(p.name)}</b><div class="tsub">${esc(p.viscosity||'—')} • ${esc(p.category||'')}</div></td>
      <td>${esc(p.brand||'—')}</td>
      <td>${esc(p.size||'—')}</td>
      <td><span class="badge ${st[0]}">${st[1]}</span></td>
      <td><b>${fmt(p.price)}</b></td>
      <td>${m>0?`<span class="pos-num">+${fmt(m)}</span>`:'—'}</td>
      <td><div class="acts">
        <button class="btn sm outline" data-act="mov" data-id="${p.id}">${icon('clock')} الحركة</button>
        <button class="btn sm" data-act="restock" data-id="${p.id}">${icon('plus')} توريد</button>
        <button class="btn sm ghost" data-act="adjust" data-id="${p.id}">تسوية</button>
        <button class="btn sm ghost" data-act="edit" data-id="${p.id}">${icon('edit')}</button>
      </div></td></tr>`;
  }).join('') : `<tr><td colspan="7"><div class="empty">لا توجد أصناف مطابقة</div></td></tr>`;
}

// ============================== ITEM FORM ==============================
async function renderItemForm(p){
  const v = $('#view-item'); S.product = p;
  let sku = p ? p.sku : '';
  if (!p){ try{ sku = (await api('/api/sku')).sku; }catch(e){} }
  v.innerHTML = `
  <div class="page-head"><div>
    <h1>${p?'تعديل الصنف':'إضافة صنف جديد'}</h1>
    <p>بيانات الصنف ومعاينة ملصق الباركود الحراري 50×30 مم</p>
  </div></div>
  <div class="item-grid">
    <div class="label-prev">
      <div class="lbl" id="labelPrev"></div>
      <p class="hint-c">معاينة الملصق الحراري — مقاس 50×30 مم</p>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;justify-content:center">
        <button class="btn outline" data-act="print">${icon('print')} طباعة تجريبية</button>
        <button class="btn ghost" data-act="gensku">توليد باركود جديد</button>
      </div>
    </div>
    <div class="card pad">
      <div class="form-grid" id="itemForm">
        <div class="field" style="grid-column:1/-1"><label>اسم الصنف *</label>
          <input id="itName" placeholder="مثال: كاسترول ماجناتك" value="${esc(p?p.name:'')}"/></div>
        <div class="field"><label>الماركة</label><input id="itBrand" placeholder="Castrol" value="${esc(p?p.brand:'')}"/></div>
        <div class="field"><label>الفئة / النوع</label>
          <select id="itCat">${CATS.map(c=>`<option ${p&&p.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>اللزوجة</label><input id="itVisc" placeholder="5W-30" value="${esc(p?p.viscosity:'')}"/></div>
        <div class="field"><label>حجم العبوة</label><input id="itSize" placeholder="4 لتر" value="${esc(p?p.size:'')}"/></div>
        <div class="field"><label>سعر التكلفة (ج.م)</label><input id="itCost" type="number" step="0.01" min="0" value="${p?p.cost:''}"/></div>
        <div class="field"><label>سعر البيع — شامل الضريبة (ج.م) *</label><input id="itPrice" type="number" step="0.01" min="0" value="${p?p.price:''}"/></div>
        <div class="field" style="grid-column:1/-1"><label>الباركود / SKU</label>
          <div style="display:flex;gap:8px">
            <input id="itSku" dir="ltr" value="${esc(sku)}"/>
            <button class="btn outline sm" data-act="gensku" style="white-space:nowrap">توليد</button>
          </div>
          <span class="hint">يبدأ بـ 622 (بادئة GS1 مصر)</span></div>
        ${p?'':`<div class="field" style="grid-column:1/-1"><label>المخزون الافتتاحي</label>
          <input id="itStock" type="number" min="0" value="0"/><span class="hint">يُسجل كحركة توريد افتتاحية في سجل الصنف</span></div>`}
      </div>
      <div class="m-actions">
        <button class="btn" data-act="save">${icon('check')} حفظ الصنف</button>
        <button class="btn ghost" data-act="cancel">إلغاء</button>
      </div>
    </div>
  </div>`;
  ['itName','itPrice','itSku'].forEach(id => $('#'+id).addEventListener('input', updateLabel));
  updateLabel();
}
function formProduct(){
  return {
    name: $('#itName').value.trim(), brand: $('#itBrand').value.trim(),
    category: $('#itCat').value, viscosity: $('#itVisc').value.trim(), size: $('#itSize').value.trim(),
    cost: +$('#itCost').value||0, price: +$('#itPrice').value||0, sku: $('#itSku').value.trim(),
    stock: +(($('#itStock')||{}).value||0)
  };
}
function updateLabel(){
  if (!$('#labelPrev')) return;
  const p = { name: $('#itName').value || 'اسم الصنف', price: +$('#itPrice').value||0, sku: $('#itSku').value || '------' };
  $('#labelPrev').innerHTML = labelHTML(p);
}
function labelHTML(p){
  return `<div class="shop">أوتو أويل — زيوت ومستلزمات صيانة السيارات</div>
    <div class="nm">${esc(p.name)}</div>
    <div class="pr">${fmt(p.price)}</div>
    ${barcodeHTML(p.sku)}
    <div class="sku">${esc(p.sku)}</div>`;
}
async function saveItem(){
  const d = formProduct();
  if (!d.name) return toast('اسم الصنف مطلوب','err');
  if (!(d.price>0)) return toast('أدخل سعر بيع صحيحاً','err');
  if (!d.sku.trim()) return toast('أدخل الباركود أو اضغط توليد','err');
  try {
    if (S.product) await api('/api/products/'+S.product.id,'POST',d);
    else await api('/api/products','POST',d);
    toast(S.product?'تم تحديث الصنف بنجاح':'تم حفظ الصنف بنجاح');
    go('inventory');
  } catch(e){ toast(e.message,'err'); }
}

// ============================== MOVEMENTS ==============================
async function renderMovements(p){
  if (!p) return go('inventory');
  S.product = p;
  const v = $('#view-movements');
  let rows;
  try { rows = await api('/api/movements?product_id='+p.id); } catch(e){ return toast(e.message,'err'); }
  const TM = {supply:['توريد','green'], sale:['بيع نقدي','blue'], return:['مرتجع بيع','amber'], adjust:['تسوية يدوية','gray']};
  v.innerHTML = `
  <div class="page-head"><div>
    <button class="btn ghost sm" data-act="back">${icon('back')} رجوع للمخزون</button>
    <h1 style="margin-top:10px">حركة الصنف: ${esc(p.name)}</h1>
    <p>${esc(p.brand||'')} • ${esc(p.size||'')} • باركود: <bdi>${esc(p.sku)}</bdi></p>
  </div></div>
  <div class="kpis">
    <div class="kpi card"><div><div class="l">الرصيد المتاح حالياً</div><div class="v">${p.stock} وحدة</div></div><div class="chip indigo">${icon('box')}</div></div>
    <div class="kpi card" style="gap:10px">
      <button class="btn" data-act="restock">${icon('plus')} توريد مخزون</button>
      <button class="btn outline" data-act="adjust">تسوية يدوية</button>
    </div>
  </div>
  <div class="card tbl-wrap"><table class="tbl"><thead><tr>
    <th>التاريخ والوقت</th><th>نوع الحركة</th><th>الكمية</th><th>الرصيد بعد الحركة</th><th>البيان</th>
  </tr></thead><tbody>${rows.length?rows.map(t=>`
    <tr><td>${fmtDate(t.created_at)}</td>
    <td><span class="badge ${TM[t.type][1]}">${TM[t.type][0]}</span></td>
    <td class="${t.qty>=0?'pos-num':'neg-num'}">${t.qty>0?'+':''}${t.qty}</td>
    <td><b>${t.balance}</b></td>
    <td class="muted" style="white-space:normal">${esc(t.note||'')}</td></tr>`).join('')
    : `<tr><td colspan="5"><div class="empty">لا توجد حركات مسجلة</div></td></tr>`}</tbody></table></div>`;
}

// ============================== SUPPLIERS ==============================
async function renderSuppliers(){
  const v = $('#view-suppliers');
  let list;
  try { list = await api('/api/suppliers'); } catch(e){ return toast(e.message,'err'); }
  S.suppliers = list;
  v.innerHTML = `
  <div class="page-head"><div>
    <h1>الموردون</h1><p>متابعة أرصدة التوريد والمدفوعات لكل مورد</p>
  </div>
  <button class="btn" data-act="add">${icon('plus')} إضافة مورد</button></div>
  <div class="card tbl-wrap"><table class="tbl"><thead><tr>
    <th>المورد</th><th>الهاتف</th><th>الرصيد المستحق</th><th>إجراءات</th>
  </tr></thead><tbody>${list.length?list.map(s=>`
    <tr><td><b>${esc(s.name)}</b></td>
    <td dir="ltr">${esc(s.phone||'—')}</td>
    <td>${s.outstanding>0?`<span class="badge red">${fmt(s.outstanding)}</span>`:`<span class="badge green">مسدد بالكامل</span>`}</td>
    <td><div class="acts">
      <button class="btn sm outline" data-act="ledger" data-id="${s.id}">${icon('book')} كشف الحساب</button>
      <button class="btn sm green" data-act="pay" data-id="${s.id}">تسجيل دفعة</button>
    </div></td></tr>`).join('')
    : `<tr><td colspan="4"><div class="empty">لا يوجد موردون بعد</div></td></tr>`}</tbody></table></div>`;
}

// ============================== SUPPLIER LEDGER ==============================
async function renderLedger(sid){
  if (!sid) return go('suppliers');
  S.supplierId = sid;
  const v = $('#view-ledger');
  let d;
  try { d = await api('/api/suppliers/'+sid); } catch(e){ return toast(e.message,'err'); }
  const asc = [...d.tx].reverse(); let bal = 0;
  asc.forEach(t=>{ bal += (t.type==='invoice') ? t.amount : -t.amount; t.bal = bal; });
  const TM = {invoice:['فاتورة توريد','amber'], payment_cash:['دفعة نقدية','green'], payment_bank:['تحويل بنكي','blue']};
  v.innerHTML = `
  <div class="page-head"><div>
    <button class="btn ghost sm" data-act="back">${icon('back')} رجوع للموردين</button>
    <h1 style="margin-top:10px">كشف حساب: ${esc(d.supplier.name)}</h1>
    <p dir="ltr" style="text-align:right">${esc(d.supplier.phone||'')}</p>
  </div></div>
  <div class="kpis">
    <div class="kpi card"><div><div class="l">الرصيد المستحق (حتى الآن)</div>
      <div class="v">${d.outstanding>0?`<span class="neg-num">${fmt(d.outstanding)}</span>`:'<span class="pos-num">مسدد بالكامل</span>'}</div></div>
      <div class="chip ${d.outstanding>0?'red':'green'}">${icon('coins')}</div></div>
    <div class="kpi card" style="gap:10px">
      <button class="btn outline" data-act="invoice">${icon('plus')} فاتورة توريد</button>
      <button class="btn green" data-act="pay">تسجيل دفعة</button>
    </div>
  </div>
  <div class="card tbl-wrap"><table class="tbl"><thead><tr>
    <th>التاريخ والوقت</th><th>نوع الحركة</th><th>المبلغ</th><th>الرصيد بعد الحركة</th><th>البيان</th>
  </tr></thead><tbody>${d.tx.length?d.tx.map(t=>`
    <tr><td>${fmtDate(t.created_at)}</td>
    <td><span class="badge ${TM[t.type][1]}">${TM[t.type][0]}</span></td>
    <td class="${t.type==='invoice'?'neg-num':'pos-num'}">${t.type==='invoice'?'+':'−'} ${fmt(t.amount)}</td>
    <td><b>${fmt(Math.max(t.bal,0))}</b></td>
    <td class="muted" style="white-space:normal">${esc(t.note||'')}</td></tr>`).join('')
    : `<tr><td colspan="5"><div class="empty">لا توجد حركات مسجلة</div></td></tr>`}</tbody></table></div>`;
}

// ============================== REPORTS ==============================
async function renderReports(){
  const v = $('#view-reports');
  let d, sales;
  try { [d,sales] = await Promise.all([api('/api/dashboard'), api('/api/sales')]); }
  catch(e){ return toast(e.message,'err'); }
  v.innerHTML = `
  <div class="page-head"><div><h1>تقارير المبيعات</h1><p>سجل الفواتير والأرباح اليومية</p></div></div>
  <div class="kpis">
    <div class="kpi card"><div><div class="l">مبيعات اليوم</div><div class="v">${fmt(d.today_sales)}</div></div><div class="chip indigo">${icon('cart')}</div></div>
    <div class="kpi card"><div><div class="l">صافي ربح اليوم</div><div class="v" style="color:#047857">${fmt(d.today_profit)}</div></div><div class="chip green">${icon('trend')}</div></div>
    <div class="kpi card"><div><div class="l">عدد فواتير اليوم</div><div class="v">${d.today_count}</div></div><div class="chip amber">${icon('receipt')}</div></div>
  </div>
  <div class="card tbl-wrap"><table class="tbl"><thead><tr>
    <th>رقم الفاتورة</th><th>التاريخ والوقت</th><th>عدد القطع</th><th>الإجمالي</th><th>الربح</th><th>الحالة</th><th>إجراءات</th>
  </tr></thead><tbody>${sales.length?sales.map(s=>`
    <tr class="${s.returned?'row-dim':''}">
      <td><b>#${s.id}</b></td><td>${fmtDate(s.created_at)}</td><td>${s.items_count}</td>
      <td><b>${fmt(s.total)}</b></td><td class="pos-num">${fmt(s.profit)}</td>
      <td>${s.returned?'<span class="badge amber">مرتجعة</span>':'<span class="badge green">مكتملة</span>'}</td>
      <td><div class="acts">
        <button class="btn sm outline" data-act="view" data-id="${s.id}">عرض</button>
        ${s.returned?'':`<button class="btn sm ghost" data-act="ret" data-id="${s.id}">مرتجع</button>`}
      </div></td></tr>`).join('')
    : `<tr><td colspan="7"><div class="empty">لا توجد مبيعات بعد</div></td></tr>`}</tbody></table></div>`;
}

// ============================== MODALS ==============================
async function openRestock(p){
  let sups = [];
  try { sups = await api('/api/suppliers'); } catch(e){}
  openModal(`<h3>${icon('box')} توريد مخزون — ${esc(p.name)}</h3>
  <p class="sub">الرصيد الحالي: ${p.stock} وحدة</p>
  <div class="form-grid">
    <div class="field"><label>الكمية الموردة *</label><input id="rsQty" type="number" min="1" placeholder="مثال: 24"/></div>
    <div class="field"><label>سعر التكلفة للوحدة (ج.م)</label><input id="rsCost" type="number" step="0.01" min="0" value="${p.cost}"/></div>
    <div class="field" style="grid-column:1/-1"><label>المورد</label>
      <select id="rsSup"><option value="0">بدون فاتورة على مورد</option>
      ${sups.map(s=>`<option value="${s.id}">${esc(s.name)}${s.outstanding>0?` — مستحق: ${fmt(s.outstanding)}`:''}</option>`).join('')}</select></div>
    <label class="check" style="grid-column:1/-1"><input id="rsUpd" type="checkbox" checked/> تحديث سعر تكلفة الصنف بهذا السعر</label>
    <p class="hint" style="grid-column:1/-1">سيُسجل على حساب المورد فاتورة بقيمة (الكمية × التكلفة) وتظهر في كشف حسابه.</p>
  </div>
  <div class="m-actions"><button class="btn ghost" onclick="closeModal()">إلغاء</button><button class="btn" id="rsSave">تأكيد التوريد</button></div>`);
  $('#rsSave').onclick = async () => {
    const qty = +$('#rsQty').value;
    if (!(qty>0)) return toast('أدخل كمية صحيحة','err');
    try {
      const r = await api('/api/products/'+p.id+'/restock','POST',
        {qty, cost:+$('#rsCost').value||p.cost, supplier_id:+$('#rsSup').value, update_cost:$('#rsUpd').checked});
      closeModal();
      toast(`تم توريد ${qty} وحدة — الرصيد الآن ${r.stock} وحدة`);
      if (S.product && S.product.id===p.id) S.product.stock = r.stock;
      refreshCurrent();
    } catch(e){ toast(e.message,'err'); }
  };
}
function openAdjust(p){
  openModal(`<h3>تسوية مخزون يدوية</h3><p class="sub">${esc(p.name)} — الرصيد الحالي: ${p.stock} وحدة</p>
  <div class="field" style="margin-bottom:14px"><label>نوع التسوية</label>
    <select id="adjDir"><option value="1">زيادة (إضافة للمخزون)</option><option value="-1">نقصان (خصم من المخزون)</option></select></div>
  <div class="field" style="margin-bottom:14px"><label>الكمية *</label><input id="adjQty" type="number" min="1" value="1"/></div>
  <div class="field" style="margin-bottom:14px"><label>البيان / السبب</label><input id="adjNote" placeholder="مثال: تالف / جرد / تصحيح"/></div>
  <div class="m-actions"><button class="btn ghost" onclick="closeModal()">إلغاء</button><button class="btn" id="adjSave">تسجيل التسوية</button></div>`);
  $('#adjSave').onclick = async () => {
    const delta = (+$('#adjDir').value) * (+$('#adjQty').value||0);
    if (!delta) return toast('أدخل كمية صحيحة','err');
    try {
      const r = await api('/api/products/'+p.id+'/adjust','POST',{delta, note:$('#adjNote').value});
      closeModal(); toast(`تمت التسوية — الرصيد الآن ${r.stock} وحدة`);
      if (S.product && S.product.id===p.id) S.product.stock = r.stock;
      refreshCurrent();
    } catch(e){ toast(e.message,'err'); }
  };
}
function openAddSupplier(){
  openModal(`<h3>${icon('truck')} إضافة مورد جديد</h3>
  <div class="field" style="margin-bottom:14px"><label>اسم المورد *</label><input id="spName" placeholder="مثال: شركة النيل لتوزيع الزيوت"/></div>
  <div class="field" style="margin-bottom:14px"><label>رقم الهاتف</label><input id="spPhone" dir="ltr" placeholder="01xxxxxxxxx"/></div>
  <div class="m-actions"><button class="btn ghost" onclick="closeModal()">إلغاء</button><button class="btn" id="spSave">حفظ المورد</button></div>`);
  $('#spSave').onclick = async () => {
    const name = $('#spName').value.trim();
    if (!name) return toast('اسم المورد مطلوب','err');
    try {
      await api('/api/suppliers','POST',{name, phone:$('#spPhone').value.trim()});
      closeModal(); toast('تم حفظ المورد'); renderSuppliers();
    } catch(e){ toast(e.message,'err'); }
  };
}
function openSupTx(sup, mode){
  const isInv = mode==='invoice';
  openModal(`<h3>${isInv?'فاتورة توريد جديدة':'تسجيل دفعة للمورد'}</h3>
  <p class="sub">${esc(sup.name)}</p>
  <div class="field" style="margin-bottom:14px"><label>المبلغ (ج.م) *</label>
    <input id="txAmount" type="number" step="0.01" min="0" placeholder="0.00"/></div>
  ${isInv?'':`<div class="field" style="margin-bottom:14px"><label>طريقة الدفع</label>
    <select id="txType"><option value="payment_cash">دفعة نقدية</option><option value="payment_bank">تحويل بنكي</option></select></div>`}
  <div class="field" style="margin-bottom:14px"><label>البيان</label>
    <input id="txNote" placeholder="${isInv?'فاتورة توريد رقم…':'دفعة على الحساب'}"/></div>
  <div class="m-actions"><button class="btn ghost" onclick="closeModal()">إلغاء</button>
  <button class="btn ${isInv?'':'green'}" id="txSave">${isInv?'تسجيل الفاتورة':'تأكيد الدفعة'}</button></div>`);
  $('#txSave').onclick = async () => {
    const amount = +$('#txAmount').value;
    if (!(amount>0)) return toast('أدخل مبلغاً صحيحاً','err');
    const type = isInv ? 'invoice' : $('#txType').value;
    try {
      await api('/api/suppliers/'+sup.id+'/tx','POST',{type, amount, note:$('#txNote').value.trim()});
      closeModal(); toast(isInv?'تم تسجيل فاتورة التوريد':'تم تسجيل الدفعة');
      renderLedger(sup.id);
    } catch(e){ toast(e.message,'err'); }
  };
}
async function openSale(id){
  try {
    const d = await api('/api/sales/'+id);
    openModal(`<h3>فاتورة #${d.sale.id} ${d.sale.returned?'<span class="badge amber">مرتجعة</span>':''}</h3>
    <p class="sub">${fmtDate(d.sale.created_at)}</p>
    <table class="tbl"><thead><tr><th>الصنف</th><th>كمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
    <tbody>${d.items.map(i=>`<tr><td>${esc(i.product_name)}</td><td>${i.qty}</td><td>${fmt(i.unit_price)}</td><td>${fmt(i.subtotal)}</td></tr>`).join('')}</tbody></table>
    <div class="cart-total" style="margin-top:14px"><span>الإجمالي</span><b>${fmt(d.sale.total)}</b></div>
    <div class="m-actions"><button class="btn outline" id="prReceipt">${icon('print')} طباعة</button>
    <button class="btn" onclick="closeModal()">إغلاق</button></div>`);
    $('#prReceipt').onclick = () => printReceipt(d.sale, d.items);
  } catch(e){ toast(e.message,'err'); }
}
async function confirmReturn(id){
  if (!confirm('تأكيد إرجاع الفاتورة رقم #'+id+'؟ سيتم إعادة الكميات للمخزون.')) return;
  try {
    await api('/api/sales/'+id+'/return','POST',{});
    toast('تم إرجاع الفاتورة وإعادة الكميات للمخزون');
    renderReports();
  } catch(e){ toast(e.message,'err'); }
}

// ============================== PRINT ==============================
function printLabel(p){
  const w = window.open('','_blank','width=480,height=420');
  if (!w) return toast('منع المتصفح فتح نافذة الطباعة','err');
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>ملصق باركود</title>
  <style>
    @page{size:50mm 30mm;margin:0}
    body{margin:0}
    .lbl{width:50mm;height:30mm;box-sizing:border-box;padding:1.5mm 2mm;display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center;font-family:Tahoma,Arial,sans-serif;color:#000;gap:1px}
    .lbl .shop{font-size:6.5pt;font-weight:700;white-space:nowrap}
    .lbl .nm{font-size:8pt;font-weight:700;max-width:100%;white-space:nowrap;overflow:hidden}
    .lbl .pr{font-size:12pt;font-weight:800;line-height:1.1}
    .lbl .sku{font-size:6.5pt;letter-spacing:1.5px;direction:ltr}
    .lbl .bars{height:8mm;width:100%}
    .bars{display:flex;align-items:stretch;justify-content:center}
    .bars span{display:inline-block;height:100%}
  </style></head><body><div class="lbl">${labelHTML(p)}</div></body></html>`);
  w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); w.close(); }, 400);
}
function printReceipt(sale, items){
  const w = window.open('','_blank','width=420,height=680');
  if (!w) return toast('منع المتصفح فتح نافذة الطباعة','err');
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>فاتورة #${sale.id}</title>
  <style>
    @page{size:80mm auto;margin:3mm}
    body{margin:0;font-family:Tahoma,Arial,sans-serif;color:#000}
    .rc{width:74mm;font-size:10pt}
    .head{text-align:center;padding-bottom:8px;border-bottom:2px dashed #000;margin-bottom:8px}
    .head b{font-size:16pt;display:block}
    .head span{font-size:8.5pt}
    .meta{font-size:9pt;display:flex;justify-content:space-between;margin:4px 0 8px}
    table{width:100%;border-collapse:collapse;font-size:9.5pt}
    th,td{padding:4px 2px;text-align:right;border-bottom:1px dashed #ccc}
    th{font-size:8.5pt;border-bottom:1px solid #000}
    .tot{border-top:2px dashed #000;margin-top:8px;padding-top:8px;text-align:center}
    .tot b{font-size:14pt}
    .foot{text-align:center;font-size:8.5pt;margin-top:10px}
  </style></head><body><div class="rc">
    <div class="head"><b>أوتو أويل</b><span>زيوت ومستلزمات صيانة السيارات</span><br/><span>0100 123 4567</span></div>
    <div class="meta"><span>فاتورة #${sale.id}</span><span>${fmtDate(sale.created_at)}</span></div>
    <table><thead><tr><th>الصنف</th><th>كمية</th><th>السعر</th><th>إجمالي</th></tr></thead>
    <tbody>${items.map(i=>`<tr><td>${esc(i.product_name)}</td><td>${i.qty}</td><td>${i.unit_price}</td><td>${i.subtotal}</td></tr>`).join('')}</tbody></table>
    <div class="tot">الإجمالي المطلوب<br/><b>${fmt(sale.total)}</b><br/>عدد القطع: ${sale.items_count}</div>
    <div class="foot">الأسعار شاملة ضريبة القيمة المضافة<br/>شكراً لثقتكم — أوتو أويل</div>
  </div></body></html>`);
  w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); w.close(); }, 400);
}

// ============================== EVENT WIRING ==============================
document.addEventListener('click', e=>{
  const nav = e.target.closest('.nav-btn');
  if (nav) return go(nav.dataset.view);
});

// dashboard
$('#view-dashboard').addEventListener('click', e=>{
  const g = e.target.closest('[data-go]');
  if (g) return go(g.dataset.go);
  const b = e.target.closest('[data-act="restock"]');
  if (b){ const p = S.products.find(x=>x.id===+b.dataset.id); if(p) openRestock(p); }
});

// pos
$('#view-pos').addEventListener('click', e=>{
  const tile = e.target.closest('.tile');
  if (tile) return addToCart(+tile.dataset.id);
  const b = e.target.closest('[data-act]');
  if (b){
    const id = +b.dataset.id;
    if (b.dataset.act==='inc') setQty(id, 1);
    else if (b.dataset.act==='dec') setQty(id, -1);
    else if (b.dataset.act==='del') removeFromCart(id);
    return;
  }
  const p = e.target.closest('.pill[data-cat]');
  if (p){
    S.posCat = p.dataset.cat;
    $$('#view-pos .pill[data-cat]').forEach(x=>x.classList.toggle('active', x===p));
    renderGrid();
  }
});

// inventory
$('#view-inventory').addEventListener('click', e=>{
  if (e.target.closest('[data-act="new"]')) return go('item', null);
  const f = e.target.closest('.pill[data-filter]');
  if (f){
    S.invFilter = f.dataset.filter;
    $$('#view-inventory .pill[data-filter]').forEach(x=>x.classList.toggle('active', x===f));
    return loadInvRows();
  }
  const b = e.target.closest('[data-act]'); if(!b) return;
  const p = S.products.find(x=>x.id===+b.dataset.id); if(!p) return;
  const act = b.dataset.act;
  if (act==='mov') go('movements', p);
  else if (act==='restock') openRestock(p);
  else if (act==='adjust') openAdjust(p);
  else if (act==='edit') go('item', p);
});

// item form
$('#view-item').addEventListener('click', e=>{
  const b = e.target.closest('[data-act]'); if(!b) return;
  const act = b.dataset.act;
  if (act==='cancel') go('inventory');
  else if (act==='gensku') api('/api/sku').then(r=>{ $('#itSku').value=r.sku; updateLabel(); }).catch(err=>toast(err.message,'err'));
  else if (act==='print') printLabel(formProduct());
  else if (act==='save') saveItem();
});

// movements
$('#view-movements').addEventListener('click', e=>{
  const b = e.target.closest('[data-act]'); if(!b) return;
  const act = b.dataset.act;
  if (act==='back') go('inventory');
  else if (act==='restock') openRestock(S.product);
  else if (act==='adjust') openAdjust(S.product);
});

// suppliers
$('#view-suppliers').addEventListener('click', e=>{
  const b = e.target.closest('[data-act]'); if(!b) return;
  const s = S.suppliers.find(x=>x.id===+b.dataset.id);
  const act = b.dataset.act;
  if (act==='add') openAddSupplier();
  else if (act==='ledger') go('ledger', +b.dataset.id);
  else if (act==='pay' && s) openSupTx(s, 'payment');
});

// ledger
$('#view-ledger').addEventListener('click', e=>{
  const b = e.target.closest('[data-act]'); if(!b) return;
  const act = b.dataset.act;
  const sup = S.suppliers.find(x=>x.id===S.supplierId) || {id:S.supplierId, name:'المورد'};
  if (act==='back') go('suppliers');
  else if (act==='invoice') openSupTx(sup, 'invoice');
  else if (act==='pay') openSupTx(sup, 'payment');
});

// reports
$('#view-reports').addEventListener('click', e=>{
  const b = e.target.closest('[data-act]'); if(!b) return;
  if (b.dataset.act==='view') openSale(+b.dataset.id);
  else if (b.dataset.act==='ret') confirmReturn(+b.dataset.id);
});

// ESC closes modal
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

// init
$$('[data-ic]').forEach(el=>{ el.outerHTML = icon(el.dataset.ic); });
go('dashboard');
