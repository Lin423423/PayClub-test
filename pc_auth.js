// PayClub shared utilities — Firebase 版本
// 資料結構（Firebase Realtime Database）：
//   /users/{uid}/profile          → {email, name, uid}
//   /events/{eventId}             → 活動資料
//   /joinRequests/{eventId}/{key} → 加入申請
//   /notifications/{uid}/{key}    → 通知
//   /blocklist/{eventId}/{key}    → 封鎖名單
//   /payMethods/{uid}             → 繳費方式
//   /emailUsers/{uid}             → Email 帳號

import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged,
         ref, set, get, update, remove, push }
  from './firebase-config.js';

// ── Auth 狀態 ──
let _currentUser = null;
let _authReady = false;
let _authCallbacks = [];

onAuthStateChanged(auth, async (fbUser) => {
  if (fbUser) {
    _currentUser = { uid: fbUser.uid, email: fbUser.email, name: fbUser.displayName || fbUser.email.split('@')[0] };
    await set(ref(db, `users/${fbUser.uid}/profile`), _currentUser);
  } else {
    // 檢查 email 登入
    const sess = sessionStorage.getItem('pc_email_user');
    _currentUser = sess ? JSON.parse(sess) : null;
  }
  _authReady = true;
  _authCallbacks.forEach(cb => cb(_currentUser));
  _authCallbacks = [];
});

export function PC_waitAuth() {
  return new Promise(r => { if (_authReady) return r(_currentUser); _authCallbacks.push(r); });
}

export function PC_getUser() { return _currentUser; }
export function PC_isLoggedIn() { return !!_currentUser; }

export async function PC_requireLogin() {
  const u = await PC_waitAuth();
  if (!u) { location.href = 'login.html?next=' + encodeURIComponent(location.href); return null; }
  return u;
}

export async function PC_logout() {
  sessionStorage.removeItem('pc_email_user');
  _currentUser = null;
  if (auth.currentUser) await signOut(auth);
  location.href = 'login.html';
}

export async function PC_loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function PC_loginEmail(email, pwd) {
  const snap = await get(ref(db, 'emailUsers'));
  if (!snap.exists()) throw new Error('帳號不存在');
  const found = Object.values(snap.val()).find(u => u.email === email && u.pwd === pwd);
  if (!found) throw new Error('Email 或密碼錯誤');
  _currentUser = { uid: found.uid, email: found.email, name: found.name };
  sessionStorage.setItem('pc_email_user', JSON.stringify(_currentUser));
  return _currentUser;
}

export async function PC_registerEmail(name, email, pwd) {
  const snap = await get(ref(db, 'emailUsers'));
  if (snap.exists() && Object.values(snap.val()).find(u => u.email === email)) throw new Error('此 Email 已被使用');
  const uid = 'eu_' + Date.now().toString(36);
  await set(ref(db, `emailUsers/${uid}`), { uid, name, email, pwd });
  await set(ref(db, `users/${uid}/profile`), { uid, name, email });
  _currentUser = { uid, email, name };
  sessionStorage.setItem('pc_email_user', JSON.stringify(_currentUser));
  return _currentUser;
}

// ── 活動 ──
export function PC_genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
export function PC_genInviteCode() {
  const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s='';
  for(let i=0;i<8;i++) s+=c[Math.floor(Math.random()*c.length)]; return s;
}

export async function PC_getEvents() {
  const u = PC_getUser(); if(!u) return [];
  const snap = await get(ref(db,'events')); if(!snap.exists()) return [];
  return Object.values(snap.val()).filter(e=>e.ownerUid===u.uid||e.ownerEmail===u.email);
}

export async function PC_saveEvent(evt) { await set(ref(db,`events/${evt.id}`), evt); }
export async function PC_deleteEvent(id) { await remove(ref(db,`events/${id}`)); }
export async function PC_getEvent(id) { const s=await get(ref(db,`events/${id}`)); return s.exists()?s.val():null; }

export async function PC_updateEvent(eventId, fn) {
  const evt = await PC_getEvent(eventId); if(!evt) return false;
  fn(evt); await set(ref(db,`events/${eventId}`), evt); return true;
}

export async function PC_findEventByCode(code) {
  const upper = code.toUpperCase().trim();
  const s = await get(ref(db,'events')); if(!s.exists()) return null;
  return Object.values(s.val()).find(e=>e.inviteCode&&e.inviteCode.toUpperCase()===upper)||null;
}

export async function PC_findEventById(id) { return await PC_getEvent(id); }

export async function PC_getAllMyEvents() {
  const u = PC_getUser(); if(!u) return [];
  const s = await get(ref(db,'events')); if(!s.exists()) return [];
  const results=[];
  Object.values(s.val()).forEach(e=>{
    const isOwner = e.ownerUid===u.uid||e.ownerEmail===u.email;
    const myMember = (e.members||[]).find(m=>m.email===u.email||m.uid===u.uid);
    if(isOwner||myMember) results.push({...e,_isOwner:isOwner,_myMember:myMember||null});
  });
  return results;
}

// ── 加入申請 ──
export async function PC_getJoinRequests(eventId) {
  const s=await get(ref(db,`joinRequests/${eventId}`)); if(!s.exists()) return [];
  return Object.entries(s.val()).map(([k,v])=>({...v,_key:k}));
}

export async function PC_saveJoinRequests(eventId, reqs) {
  await remove(ref(db,`joinRequests/${eventId}`));
  for(const req of reqs){
    const k=req._key||PC_genId(); const d={...req}; delete d._key;
    await set(ref(db,`joinRequests/${eventId}/${k}`),d);
  }
}

// ── 通知 ──
export async function PC_sendNotify(toEmail, title, content, type='info') {
  // 找 uid
  let toUid = null;
  const s1=await get(ref(db,'users'));
  if(s1.exists()) { const f=Object.entries(s1.val()).find(([,u])=>u.profile?.email===toEmail); if(f) toUid=f[0]; }
  if(!toUid){ const s2=await get(ref(db,'emailUsers')); if(s2.exists()){const f=Object.entries(s2.val()).find(([,u])=>u.email===toEmail);if(f)toUid=f[0];} }
  if(!toUid) toUid='eb_'+btoa(toEmail).replace(/[^a-zA-Z0-9]/g,'_');
  await push(ref(db,`notifications/${toUid}`),{id:Date.now(),title,content,type,read:false,time:new Date().toISOString()});
}

export async function PC_getNotifications() {
  const u=PC_getUser(); if(!u) return [];
  const s=await get(ref(db,`notifications/${u.uid}`)); if(!s.exists()) return [];
  return Object.entries(s.val()).map(([k,v])=>({...v,_key:k})).sort((a,b)=>b.id-a.id).slice(0,50);
}

export async function PC_getUnreadCount() {
  const n=await PC_getNotifications(); return n.filter(x=>!x.read).length;
}

export async function PC_markNotifRead(key) {
  const u=PC_getUser(); if(!u) return;
  await update(ref(db,`notifications/${u.uid}/${key}`),{read:true});
}

export async function PC_clearNotifications() {
  const u=PC_getUser(); if(!u) return;
  await remove(ref(db,`notifications/${u.uid}`));
}

// ── 封鎖名單 ──
export async function PC_getBlocklist(eventId) {
  const s=await get(ref(db,`blocklist/${eventId}`)); if(!s.exists()) return [];
  return Object.entries(s.val()).map(([k,v])=>({...v,_key:k}));
}
export async function PC_addToBlocklist(eventId, entry) { await push(ref(db,`blocklist/${eventId}`),entry); }
export async function PC_removeFromBlocklist(eventId, email) {
  const s=await get(ref(db,`blocklist/${eventId}`)); if(!s.exists()) return;
  for(const [k,v] of Object.entries(s.val())) if(v.email===email) await remove(ref(db,`blocklist/${eventId}/${k}`));
}

// ── 繳費方式 ──
export const DEFAULT_PAY_METHODS=[
  {id:'linepay',icon:'💚',name:'LINE Pay',active:true,isDefault:true},
  {id:'jkopay',icon:'🔵',name:'街口支付',active:true,isDefault:true},
  {id:'credit',icon:'💳',name:'信用卡',active:true,isDefault:true},
  {id:'atm',icon:'🏧',name:'ATM 轉帳',active:false,isDefault:true}
];
export async function PC_getPayMethods() {
  const u=PC_getUser(); if(!u) return DEFAULT_PAY_METHODS;
  const s=await get(ref(db,`payMethods/${u.uid}`)); return s.exists()?s.val():DEFAULT_PAY_METHODS;
}
export async function PC_savePayMethods(m) { const u=PC_getUser(); if(!u) return; await set(ref(db,`payMethods/${u.uid}`),m); }

// ── Financial helpers ──
export function PC_getPayers(event){
  return (event.members||[]).filter(m=>{
    const roles=Array.isArray(m.roles)?m.roles:(m.role?[m.role]:[]);
    return roles.includes('payer')&&m.status!=='exited'&&m.status!=='pending_invite';
  });
}
export function PC_getExpectedAmount(event,member){
  const roles=Array.isArray(member.roles)?member.roles:(member.role?[member.role]:[]);
  if(!member||!roles.includes('payer')) return 0;
  if(member.customAmount!=null) return Number(member.customAmount)||0;
  return Number(event.amount)||0;
}
export function PC_getCollected(event){
  return (event.members||[]).reduce((s,m)=>{
    return s+(m.txHistory||[]).reduce((ss,tx)=>ss+(Number(tx.amount)||0),0);
  },0);
}
export function PC_getExpected(event){ return PC_getPayers(event).reduce((s,m)=>s+PC_getExpectedAmount(event,m),0); }

// ── UI helpers ──
export async function PC_fillSidebarUser(){
  const u=PC_getUser(); if(!u) return;
  const dn=u.name||u.email||'使用者';
  const n=document.getElementById('userName'); if(n) n.textContent=dn;
  const a=document.getElementById('avatarInitial'); if(a) a.textContent=dn.slice(0,1).toUpperCase();
  const r=document.getElementById('userEmail'); if(r) r.textContent=u.email||'';
  const unread=await PC_getUnreadCount();
  const badge=document.getElementById('notifBadge');
  if(badge){badge.textContent=unread>0?unread:'';badge.style.display=unread>0?'inline-block':'none';}
}

export function PC_toast(msg,duration=2500){
  let t=document.getElementById('toast');
  if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t);}
  t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),duration);
}
export function PC_nowStr(){const n=new Date();return(n.getMonth()+1).toString().padStart(2,'0')+'/'+(n.getDate()).toString().padStart(2,'0')+' '+n.getHours().toString().padStart(2,'0')+':'+n.getMinutes().toString().padStart(2,'0');}
export function PC_genTxId(){return 'PC'+Date.now().toString(36).toUpperCase();}
export function PC_copyText(text,msg){navigator.clipboard.writeText(text).then(()=>PC_toast(msg||'✅ 已複製')).catch(()=>{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');PC_toast(msg||'✅ 已複製');}catch(e){}document.body.removeChild(ta);});}

export const ROLE_LABELS={admin:'管理員',payer:'成員',observer:'觀察者',counter:'統計者'};
export const ROLE_BADGE={admin:'badge-admin',payer:'badge-blue',observer:'badge-gray',counter:'badge-orange'};
