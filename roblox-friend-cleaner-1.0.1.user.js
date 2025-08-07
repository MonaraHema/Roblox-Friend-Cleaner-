// ==UserScript==
// @name         Roblox Friend Cleaner
// @namespace    https://monarahema.github.io/
// @version      1.0.1
// @description  Easily unfriend old Roblox friends in bulk
// @author       MonaraHema
// @match        https://www.roblox.com/*friends*
// @match        https://www.roblox.com/users/*/friends*
// @grant        none
// @downloadURL  https://github.com/MonaraHema/Roblox-Friend-Cleaner-/releases/download/v1.0.0/roblox-friend-cleaner.user.js
// @updateURL    https://github.com/MonaraHema/Roblox-Friend-Cleaner-/releases/download/v1.0.0/roblox-friend-cleaner.user.js
// ==/UserScript==

(() => {
  'use strict';

  /* ========= Config ========= */
  const SELECT_BY_CARD = false;
  const BATCH_DELAY_MS = 700;
  const MAX_CONCURRENT = 1;

  /* ========= Styles ========= */
  const style = document.createElement('style');
  style.textContent = `
    ul[class*="avatar-cards"] > li { position: relative; overflow: visible !important; }

    .rfb-sel-dot {
      position:absolute; top:8px; right:8px; z-index:10;
      width:18px; height:18px; border-radius:50%;
      border:2px solid #8b5cf6; background:#1b1d22;
      cursor:pointer; opacity:.9; transition:transform .08s ease, box-shadow .12s ease, background .12s ease;
      box-shadow:0 0 0 0 rgba(139,92,246,0);
    }
    .rfb-sel-dot:hover { transform: scale(1.08); box-shadow:0 0 0 3px rgba(139,92,246,.20); }
    .rfb-sel-dot.rfb-selected { background:#8b5cf6; }

    .rfb-card-selected { box-shadow: inset 0 0 0 2px rgba(139,92,246,.45) !important; border-radius:8px; }

    .rfb-sidebar {
      position:fixed; top:72px; right:16px; bottom:96px; width:260px; z-index:9999;
      background:#0f1115; border:1px solid #25272d; border-radius:12px;
      display:flex; flex-direction:column; gap:10px; padding:12px;
      box-shadow: 0 10px 28px rgba(0,0,0,.45);
    }
    .rfb-sidebar h3 { margin:0; font-size:14px; color:#e5e7eb; font-weight:600; }
    .rfb-list {
      flex:1 1 auto; overflow:auto; border:1px solid #1e2026; border-radius:10px; padding:6px;
      background:#12141a;
    }
    .rfb-item { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 8px; border-radius:8px; color:#d1d5db; font-size:12px; }
    .rfb-item + .rfb-item { margin-top:4px; }
    .rfb-meta { display:flex; flex-direction:column; min-width:0; }
    .rfb-name { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rfb-user { color:#9ca3af; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rfb-remove { border:1px solid #2a2d33; background:#1a1c22; color:#e5e7eb; border-radius:8px; cursor:pointer; padding:3px 6px; font-size:11px; }
    .rfb-remove:hover { background:#23262c; }

    .rfb-actions { display:flex; gap:8px; }
    .rfb-btn {
      flex:1 1 auto; border-radius:10px; padding:8px 10px; cursor:pointer; font-size:12px;
      border:1px solid #30333a; background:#1b1e24; color:#e5e7eb;
      transition: filter .12s ease, background .12s ease, border-color .12s ease;
    }
    .rfb-btn:hover { filter: brightness(1.08); }
    .rfb-btn-danger { background:#3a1214; border-color:#ef4444; color:#ffecec; }
    .rfb-btn-danger:hover { background:#521517; border-color:#f87171; }
    .rfb-status { margin-left:6px; font-size:11px; color:#9ca3af; }
    .rfb-ok { color:#86efac; }
    .rfb-fail { color:#fca5a5; }

    @media (max-width: 1400px) { .rfb-sidebar { width:220px; } }
  `;
  document.documentElement.appendChild(style);

  /* ========= API ========= */
  let csrf = null;
  async function getCsrf() {
    if (csrf) return csrf;
    const r = await fetch('https://auth.roblox.com/v2/logout', { method:'POST', credentials:'include' });
    csrf = r.headers.get('x-csrf-token');
    return csrf;
  }
  async function unfriend(userId) {
    const t = await getCsrf();
    const r = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
      method:'POST', credentials:'include',
      headers:{ 'x-csrf-token': t, 'content-type':'application/json' }
    });
    if (r.status === 403) { csrf = null; return unfriend(userId); }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  }

  /* ========= DOM helpers ========= */
  const selGrid = 'ul.list.avatar-cards, ul.avatar-cards, ul[class*="avatar-cards"]';
  function getGrids(){ return [...document.querySelectorAll(selGrid)]; }
  function getCards(grid){
    return [...grid.children].filter(li =>
      li.tagName === 'LI' && (li.className.includes('avatar-card') || li.className.includes('list-item'))
    );
  }
  function getUserDataFromCard(card){
    const a = card.querySelector('a[href*="/users/"][href*="/profile"]');
    const m = a && a.href.match(/\/users\/(\d+)\/profile/i);
    if (!m) return null;
    const id = m[1];

    const nameEl = card.querySelector('.avatar-name-container, .text-overflow, .avatar-card-caption a, .avatar-card-caption div');
    const labels = card.querySelectorAll('.avatar-card-label, .avatar-card-caption span');
    const displayName = (nameEl?.textContent || '').trim();
    let username = '';
    for (const el of labels) {
      const t = (el.textContent || '').trim();
      if (t.startsWith('@')) { username = t.slice(1); break; }
    }
    return { id, displayName, username };
  }
  function stripAvatarOverlay(card){
    const avatar = card.querySelector('[data-testid="avatar-card-container"], .avatar-card-fullbody, .thumbnail-2d-container, .avatar-card-container');
    if (!avatar) return;
    avatar.querySelectorAll('button').forEach(b=>{
      const t = (b.getAttribute('title') || b.textContent || '').toLowerCase();
      if (t.includes('unfriend')) b.remove();
    });
  }

  /* ========= Sidebar UI ========= */
  let sidebar, listEl, confirmBtn, cancelBtn;
  const selection = new Map();

  function ensureSidebar(){
    if (sidebar) return;
    sidebar = document.createElement('div');
    sidebar.className = 'rfb-sidebar';

    const title = document.createElement('h3');
    title.textContent = 'Selected to Remove'; // no counter

    listEl = document.createElement('div');
    listEl.className = 'rfb-list';

    const actions = document.createElement('div');
    actions.className = 'rfb-actions';

    cancelBtn = document.createElement('button');
    cancelBtn.className = 'rfb-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', clearSelection);

    confirmBtn = document.createElement('button');
    confirmBtn.className = 'rfb-btn rfb-btn-danger';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.addEventListener('click', runBatch);

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    sidebar.appendChild(title);
    sidebar.appendChild(listEl);
    sidebar.appendChild(actions);
    document.body.appendChild(sidebar);
    updateConfirmEnabled();
  }

  function updateConfirmEnabled(){
    if (confirmBtn) confirmBtn.disabled = selection.size === 0;
  }

  function addToSidebar(data){
    if (data.itemEl && data.itemEl.isConnected) return;

    const row = document.createElement('div');
    row.className = 'rfb-item';
    row.dataset.rfbId = data.id;

    const meta = document.createElement('div');
    meta.className = 'rfb-meta';
    const nm = document.createElement('div');
    nm.className = 'rfb-name';
    nm.textContent = data.displayName || data.username || `id:${data.id}`;
    const un = document.createElement('div');
    un.className = 'rfb-user';
    un.textContent = data.username ? `@${data.username}` : `id:${data.id}`;
    meta.appendChild(nm); meta.appendChild(un);

    const status = document.createElement('span');
    status.className = 'rfb-status';

    const rm = document.createElement('button');
    rm.className = 'rfb-remove';
    rm.textContent = 'Remove';
    rm.addEventListener('click', () => toggleSelect(data.card, false));

    row.appendChild(meta);
    row.appendChild(status);
    row.appendChild(rm);

    listEl.appendChild(row);
    data.itemEl = row;
    data.statusEl = status;
    updateConfirmEnabled();
  }

  function removeFromSidebar(id){
    const data = selection.get(id);
    if (data && data.itemEl) {
      data.itemEl.remove();
      data.itemEl = null;
      data.statusEl = null;
    } else {
      const row = listEl.querySelector(`.rfb-item[data-rfb-id="${CSS.escape(id)}"]`);
      if (row) row.remove();
    }
    updateConfirmEnabled();
  }

  function clearSelection(){
    selection.forEach(d => {
      d.card.classList.remove('rfb-card-selected');
      const dot = d.card.querySelector('.rfb-sel-dot');
      if (dot) dot.classList.remove('rfb-selected');
      if (d.itemEl) d.itemEl.remove();
      d.itemEl = null; d.statusEl = null;
    });
    selection.clear();
    listEl.innerHTML = '';
    updateConfirmEnabled();
  }

  /* ========= Selection / Card enhancement ========= */
  function toggleSelect(card, forceState){
    const info = getUserDataFromCard(card);
    if (!info) return;
    const id = info.id;
    const isSelected = selection.has(id);
    const want = forceState !== undefined ? forceState : !isSelected;

    const dot = card.querySelector('.rfb-sel-dot');

    if (want) {
      if (!isSelected) {
        const data = { ...info, card, itemEl: null, statusEl: null };
        selection.set(id, data);
        card.classList.add('rfb-card-selected');
        dot?.classList.add('rfb-selected');
        addToSidebar(data);
      } else {
        addToSidebar(selection.get(id));
      }
    } else {
      if (isSelected) {
        removeFromSidebar(id);
        selection.delete(id);
        card.classList.remove('rfb-card-selected');
        dot?.classList.remove('rfb-selected');
      }
    }
  }

  function enhanceCard(card){
    if (card.__rfbEnhanced) return;
    const info = getUserDataFromCard(card);
    if (!info) { card.__rfbEnhanced = true; return; }

    card.dataset.rfbId = info.id;

    stripAvatarOverlay(card);
    new MutationObserver(()=>stripAvatarOverlay(card)).observe(card,{childList:true,subtree:true});

    const dot = document.createElement('div');
    dot.className = 'rfb-sel-dot';
    dot.title = 'Select';
    dot.addEventListener('click', (e)=>{ e.stopPropagation(); toggleSelect(card); });
    card.appendChild(dot);

    if (SELECT_BY_CARD) {
      card.addEventListener('click', (e)=>{
        const t = e.target;
        if (t.closest('a') || t.closest('button')) return;
        toggleSelect(card);
      });
    }

    card.__rfbEnhanced = true;
  }

  /* ========= Batch Unfriend ========= */
  async function runBatch(){
    if (selection.size === 0) return;

    confirmBtn.disabled = true; cancelBtn.disabled = true;

    const queue = [...selection.values()];
    let index = 0, running = 0;

    async function next(){
      if (index >= queue.length) return;
      while (running < MAX_CONCURRENT && index < queue.length) {
        const item = queue[index++];
        running++;
        (async () => {
          try {
            if (item.statusEl) item.statusEl.textContent = '…';
            await unfriend(item.id);
            if (item.statusEl) { item.statusEl.textContent = 'Done'; item.statusEl.classList.add('rfb-ok'); }
            item.card.style.opacity = '0.6';
          } catch {
            if (item.statusEl) { item.statusEl.textContent = 'Failed'; item.statusEl.classList.add('rfb-fail'); }
          } finally {
            running--;
            setTimeout(next, BATCH_DELAY_MS);
          }
        })();
      }
    }
    await next();

    const drain = setInterval(()=>{
      if (running === 0 && index >= queue.length) {
        clearInterval(drain);
        clearSelection();
        confirmBtn.disabled = false; cancelBtn.disabled = false;
      }
    }, 200);
  }

  /* ========= Boot ========= */
  function scan(){ getGrids().forEach(g=>getCards(g).forEach(enhanceCard)); }

  function start(){
    ensureSidebar();
    const iv = setInterval(()=>{
      const grids = getGrids();
      if (grids.length){
        clearInterval(iv);
        scan();
        grids.forEach(grid=>{
          new MutationObserver(scan).observe(grid,{childList:true,subtree:true});
        });
      }
    },200);
    const mo = new MutationObserver(()=>{ if (getGrids().length) scan(); });
    mo.observe(document.documentElement,{childList:true,subtree:true});
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
