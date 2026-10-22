import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/home/andreas/Projekt/avc_management_app/node_modules/.pnpm/ws@8.22.0/node_modules/ws/');
const WebSocket = require('ws');
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const PORT = 9239;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tokens = {};
for (const line of fs.readFileSync('/tmp/opencode/tokens.txt','utf8').trim().split('\n')) { const [e,t]=line.split(' '); tokens[e.split('@')[0]]=t; }
const chrome = spawn(CHROME,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${PORT}`,'--window-size=390,844','about:blank'],{stdio:'ignore'});
let id=0;
function send(ws,m,p={}){const i=++id;return new Promise((res,rej)=>{const h=(raw)=>{const x=JSON.parse(raw.toString());if(x.id===i){ws.off('message',h);x.error?rej(new Error(JSON.stringify(x.error))):res(x.result);}};ws.on('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}));});}
const ev=async(ws,e)=>{const r=await send(ws,'Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)return 'EXC: '+(r.exceptionDetails.exception?.description||'').split('\n')[0];return r.result.value;};
try{
  let v;for(let i=0;i<40;i++){try{v=await(await fetch(`http://localhost:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const t=await(await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent('http://localhost:5173/login')}`,{method:'PUT'})).json();
  const ws=new WebSocket(t.webSocketDebuggerUrl,{maxPayload:256*1024*1024});
  await new Promise(r=>ws.on('open',r));
  await send(ws,'Runtime.enable');await send(ws,'Page.enable');
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  const errs=[];ws.on('message',(raw)=>{const m=JSON.parse(raw.toString());if(m.method==='Runtime.exceptionThrown')errs.push('EXC '+(m.params.exceptionDetails.exception?.description||'').split('\n')[0]);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errs.push('ERR '+(m.params.args||[]).map(a=>a.value??a.description).join(' ').slice(0,150));});
  await send(ws,'Page.navigate',{url:'http://localhost:5173/login'});await sleep(1200);
  await ev(ws,`localStorage.setItem('accessToken', ${JSON.stringify(tokens.worker1)});localStorage.setItem('token_expires_at',(Date.now()+3600000).toString());localStorage.setItem('avc-auth', JSON.stringify({state:{user:{id:'x',email:'worker1@avc.local',full_name:'Anna',role:'worker'},accessToken:'x',refreshToken:'y'},version:0}));`);
  await send(ws,'Page.navigate',{url:'http://localhost:5173/dashboard'});await sleep(4000);
  console.log('mobile dashboard text:', (await ev(ws,`document.querySelector('main')?.innerText.replace(/\\s+/g,' ').slice(0,180)`)));
  console.log('horizontal overflow?', await ev(ws,`JSON.stringify({doc: document.documentElement.scrollWidth, vw: window.innerWidth})`));
  console.log('overflowing past 390:', await ev(ws, `(() => {
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > 392) out.push(el.tagName + '.' + String(el.className).slice(0, 44) + ' right=' + Math.round(r.right));
    });
    return out.slice(0, 10).join(' | ') || 'none';
  })()`));
  console.log('widest elements:', await ev(ws, `(() => {
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 400) out.push(el.tagName + '.' + String(el.className).slice(0, 50) + ' w=' + Math.round(r.width));
    });
    return out.slice(0, 12).join(' | ');
  })()`));
  const shot=await send(ws,'Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('/tmp/opencode/shot-mobile.png', Buffer.from(shot.data,'base64'));
  console.log('errors:', errs.length?errs.slice(0,3).join(' | '):'(none)');
  ws.close();
}catch(e){console.error('ERR',e.message);}finally{chrome.kill('SIGKILL');}
