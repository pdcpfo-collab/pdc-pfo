const COORDINATORS = {
  Handoko: { name: 'HANDOKO', phone: '6282255033886' },
  Mustangin: { name: 'MUSTANGIN', phone: '6282278155926' }
};
const SESSION_DAYS = 7;
const RESET_MINUTES = 30;
const json = (data, status=200, extra={}) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8', ...extra}});
const now = () => new Date().toISOString();
const id = (p='') => p + crypto.randomUUID();
const bytes = n => crypto.getRandomValues(new Uint8Array(n));
const hex = b => [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
function arrayBufferToBase64(buf){let s='';const b=new Uint8Array(buf);const chunk=0x8000;for(let i=0;i<b.length;i+=chunk)s+=String.fromCharCode(...b.subarray(i,Math.min(i+chunk,b.length)));return btoa(s);}
async function sha256(s){ const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)); return hex(new Uint8Array(d)); }
async function passwordHash(password, saltHex){
  const salt = Uint8Array.from(saltHex.match(/.{2}/g).map(x=>parseInt(x,16)));
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:120000,hash:'SHA-256'},key,256);
  return hex(new Uint8Array(bits));
}
function cookie(name,value,maxAge){ return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`; }
function readCookie(req,name){ const c=req.headers.get('Cookie')||''; const m=c.match(new RegExp('(?:^|;\\s*)'+name.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')+'=([^;]+)')); return m?decodeURIComponent(m[1]):null; }
async function auth(req,env){
  const token=readCookie(req,'pfo_session'); if(!token) return null;
  const th=await sha256(token);
  const r=await env.DB.prepare(`SELECT a.id,a.email,a.name,s.id session_id FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>?`).bind(th,now()).first();
  return r||null;
}
async function sendEmail(env,to,subject,html){
  if(!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY belum dikonfigurasi');
  const from=env.FROM_EMAIL||'PDC–PFO <onboarding@resend.dev>';
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject,html})});
  if(!r.ok) throw new Error('Gagal mengirim email');
}
function validateReport(o){
  const allowedCats=['AC / HVAC','Listrik & Penerangan','Plumbing / Air','Civil / Bangunan','Pengecatan','Pintu & Jendela','Furniture & Interior','Atap & Plafon','Drainase & Area','Housekeeping / Kebersihan','Taman & Landscape','Fasilitas Umum','Lainnya'];
  const allowedLoc=['Lab','Portacamp','Admin','Warehouse','Project Office','Klinik','Mess VIP','Rechall','Kantin A','Kantin B','Laundry A','Laundry B','Masjid','Akomodasi A','Akomodasi B','Fire Shelter'];
  if(!o.reporter||!o.location||!allowedLoc.includes(o.location)||!allowedCats.includes(o.category)||!['Low','Medium','High'].includes(o.priority)||!o.description) throw new Error('Data laporan tidak lengkap atau tidak valid');
  if(['Akomodasi A','Akomodasi B','Mess VIP'].includes(o.location) && !o.room) throw new Error('Nomor wajib untuk lokasi tersebut');
}
async function api(req,env,url){
  const method=req.method;
  if(url.pathname==='/api/config' && method==='GET'){
    const s=await env.DB.prepare(`SELECT value FROM settings WHERE key='duty'`).first();
    const duty=s?.value||'Handoko';
    return json({duty,coordinators:COORDINATORS});
  }
  if(url.pathname==='/api/auth/register' && method==='POST'){
    const body=await req.json();
    if(env.ADMIN_REGISTRATION_CODE && body.code!==env.ADMIN_REGISTRATION_CODE) return json({error:'Kode pendaftaran admin salah'},403);
    const email=String(body.email||'').trim().toLowerCase(), password=String(body.password||'');
    if(!/^\S+@\S+\.\S+$/.test(email)||password.length<8) return json({error:'Email valid dan password minimal 8 karakter diperlukan'},400);
    const exists=await env.DB.prepare('SELECT id FROM admins WHERE email=?').bind(email).first(); if(exists) return json({error:'Email admin sudah terdaftar'},409);
    const salt=hex(bytes(16)), hash=await passwordHash(password,salt);
    await env.DB.prepare('INSERT INTO admins(id,email,password_hash,password_salt,name,created_at) VALUES(?,?,?,?,?,?)').bind(id('adm_'),email,hash,salt,'Administrator',now()).run();
    return json({ok:true,message:'Admin berhasil didaftarkan. Silakan login.'},201);
  }
  if(url.pathname==='/api/auth/login' && method==='POST'){
    const b=await req.json(); const email=String(b.email||'').trim().toLowerCase(), password=String(b.password||'');
    const a=await env.DB.prepare('SELECT * FROM admins WHERE email=?').bind(email).first(); if(!a) return json({error:'Email atau password salah'},401);
    const h=await passwordHash(password,a.password_salt); if(h!==a.password_hash) return json({error:'Email atau password salah'},401);
    const raw=crypto.randomUUID()+crypto.randomUUID(), th=await sha256(raw), exp=new Date(Date.now()+SESSION_DAYS*864e5).toISOString();
    await env.DB.prepare('INSERT INTO sessions(id,admin_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').bind(id('ses_'),a.id,th,exp,now()).run();
    return json({ok:true,email:a.email,name:a.name},{headers:{'content-type':'application/json; charset=utf-8','Set-Cookie':cookie('pfo_session',raw,SESSION_DAYS*86400)}});
  }
  if(url.pathname==='/api/auth/logout' && method==='POST'){
    const t=readCookie(req,'pfo_session'); if(t) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(t)).run();
    return json({ok:true},{headers:{'content-type':'application/json; charset=utf-8','Set-Cookie':cookie('pfo_session','',0)}});
  }
  if(url.pathname==='/api/auth/me' && method==='GET'){
    const a=await auth(req,env); return a?json({ok:true,admin:{email:a.email,name:a.name}}):json({ok:false},401);
  }
  if(url.pathname==='/api/auth/reset-request' && method==='POST'){
    const b=await req.json(); const email=String(b.email||'').trim().toLowerCase(); const a=await env.DB.prepare('SELECT * FROM admins WHERE email=?').bind(email).first();
    // Do not reveal whether an account exists.
    if(a){ const raw=crypto.randomUUID()+crypto.randomUUID(), th=await sha256(raw), exp=new Date(Date.now()+RESET_MINUTES*60000).toISOString(); await env.DB.prepare('INSERT INTO reset_tokens(id,admin_id,token_hash,expires_at,used,created_at) VALUES(?,?,?,?,0,?)').bind(id('rst_'),a.id,th,exp,now()).run(); const link=`${env.APP_ORIGIN||new URL(req.url).origin}/admin.html?reset=${encodeURIComponent(raw)}`; try{await sendEmail(env,email,'Reset Password PDC–PFO',`<p>Gunakan tautan berikut untuk membuat password baru. Berlaku ${RESET_MINUTES} menit.</p><p><a href="${link}">Reset Password</a></p>`);}catch(e){return json({error:e.message},500);} }
    return json({ok:true,message:'Jika email terdaftar, tautan reset telah dikirim.'});
  }
  if(url.pathname==='/api/auth/reset' && method==='POST'){
    const b=await req.json(); const raw=String(b.token||''), password=String(b.password||''); if(raw.length<20||password.length<8) return json({error:'Token atau password tidak valid'},400);
    const r=await env.DB.prepare(`SELECT r.*,a.id admin_id FROM reset_tokens r JOIN admins a ON a.id=r.admin_id WHERE r.token_hash=? AND r.used=0 AND r.expires_at>?`).bind(await sha256(raw),now()).first(); if(!r) return json({error:'Tautan reset tidak valid atau sudah kedaluwarsa'},400);
    const salt=hex(bytes(16)), hash=await passwordHash(password,salt); await env.DB.batch([env.DB.prepare('UPDATE admins SET password_hash=?,password_salt=? WHERE id=?').bind(hash,salt,r.admin_id),env.DB.prepare('UPDATE reset_tokens SET used=1 WHERE id=?').bind(r.id),env.DB.prepare('DELETE FROM sessions WHERE admin_id=?').bind(r.admin_id)]); return json({ok:true,message:'Password berhasil diubah.'});
  }
  if(url.pathname==='/api/reports' && method==='POST'){
    const form=await req.formData(); const o={reporter:String(form.get('reporter')||'').trim(),location:String(form.get('location')||''),category:String(form.get('category')||''),priority:String(form.get('priority')||''),description:String(form.get('description')||'').trim(),room:String(form.get('room')||'').trim()};
    try{validateReport(o)}catch(e){return json({error:e.message},400)}
    const img=form.get('image'); if(!(img instanceof File)||!img.type.startsWith('image/')) return json({error:'Gambar laporan wajib diunggah'},400);
    if(img.size>750*1024) return json({error:'Gambar laporan terlalu besar. Maksimal 750 KB. Silakan kirim ulang foto.'},413);
    const rid='PFO-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+crypto.randomUUID().slice(0,8).toUpperCase();
    const s=await env.DB.prepare(`SELECT value FROM settings WHERE key='duty'`).first(); const duty=s?.value||'Handoko';
    const imageData='data:image/jpeg;base64,'+arrayBufferToBase64(await img.arrayBuffer());
    const imageUrl=`${env.APP_ORIGIN||new URL(req.url).origin}/laporan/${rid}.jpg`; const t=now();
    await env.DB.prepare(`INSERT INTO reports(id,reporter,location,category,priority,description,room,duty,status,image_key,image_url,created_at,updated_at,image_data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(rid,o.reporter,o.location,o.category,o.priority,o.description,o.room||null,duty,'Belum Dikerjakan','',imageUrl,t,t,imageData).run();
    return json({ok:true,id:rid,imageUrl,duty,coordinator:COORDINATORS[duty]},201);
  }
  const m=url.pathname.match(/^\/api\/reports\/([^/]+)$/); if(m){
    const a=await auth(req,env); if(!a) return json({error:'Unauthorized'},401); const rid=decodeURIComponent(m[1]);
    if(method==='PATCH'){const b=await req.json(); const fields=[]; const vals=[]; if(['Belum Dikerjakan','Sedang Dikerjakan','Selesai','Arsip'].includes(b.status)){fields.push('status=?');vals.push(b.status)} if(COORDINATORS[b.duty]){fields.push('duty=?');vals.push(b.duty)} if(fields.length){fields.push('updated_at=?');vals.push(now(),rid);await env.DB.prepare(`UPDATE reports SET ${fields.join(',')} WHERE id=?`).bind(...vals).run()} return json({ok:true});}
    if(method==='DELETE'){const r=await env.DB.prepare('SELECT id FROM reports WHERE id=?').bind(rid).first(); if(!r) return json({error:'Laporan tidak ditemukan'},404); await env.DB.prepare('DELETE FROM reports WHERE id=?').bind(rid).run(); return json({ok:true});}
  }
  if(url.pathname==='/api/reports' && method==='GET'){
    const a=await auth(req,env); if(!a) return json({error:'Unauthorized'},401); const {results}=await env.DB.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 500').all(); return json({reports:results});
  }
  if(url.pathname==='/api/duty' && method==='POST'){
    const a=await auth(req,env); if(!a) return json({error:'Unauthorized'},401); const b=await req.json(); if(!COORDINATORS[b.duty]) return json({error:'Petugas tidak valid'},400); await env.DB.prepare("INSERT INTO settings(key,value) VALUES('duty',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(b.duty).run(); return json({ok:true,duty:b.duty});
  }
  if(url.pathname.match(/^\/api\/reports\/[^/]+\/after$/) && method==='POST'){
    const a=await auth(req,env); if(!a) return json({error:'Unauthorized'},401); const rid=url.pathname.split('/')[3]; const f=await req.formData(); const img=f.get('image'); if(!(img instanceof File)||!img.type.startsWith('image/')) return json({error:'Foto after wajib'},400); if(img.size>750*1024)return json({error:'Foto after maksimal 750 KB'},413); const data='data:image/jpeg;base64,'+arrayBufferToBase64(await img.arrayBuffer()); const u=`${env.APP_ORIGIN||new URL(req.url).origin}/laporan/${rid}-after.jpg`; await env.DB.prepare('UPDATE reports SET after_image_key=?,after_image_url=?,after_image_data=?,updated_at=? WHERE id=?').bind('',u,data,now(),rid).run(); return json({ok:true,url:u});
  }
  return json({error:'Not found'},404);
}
export default { async fetch(req,env){ try{ const u=new URL(req.url); if(u.pathname.startsWith('/api/')) return await api(req,env,u); if(u.pathname.startsWith('/laporan/')){const key=u.pathname.slice('/laporan/'.length); const after=key.endsWith('-after.jpg'); const rid=key.replace(/-after\.jpg$/,'').replace(/\.jpg$/,''); const r=await env.DB.prepare('SELECT image_data,after_image_data FROM reports WHERE id=?').bind(rid).first(); const data=after?r?.after_image_data:r?.image_data; if(!data) return new Response('Not found',{status:404}); const b64=data.split(',')[1]||''; const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); return new Response(bin,{headers:{'content-type':'image/jpeg','cache-control':'public, max-age=31536000'}});} return env.ASSETS.fetch(req); }catch(e){ console.error(e); return json({error:'Server error',detail:e.message},500); } }};
