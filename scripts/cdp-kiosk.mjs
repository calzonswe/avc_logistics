import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/home/andreas/Projekt/avc_management_app/node_modules/.pnpm/ws@8.22.0/node_modules/ws/');
const WebSocket = require('ws');
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const PORT = 9238;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tokens = {};
for (const line of fs.readFileSync('/tmp/opencode/tokens.txt','utf8').trim().split('\n')) { const [e,t]=line.split(' '); tokens[e.split('@')[0]]=t; }
const chrome = spawn(CHROME,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${PORT}`,'--window-size=1920,1080','about:blank'],{stdio:'ignore'});
let id=0;
function send(ws,m,p={}){const i=++id;return new Promise((res,rej)=>{const h=(raw)=>{const x=JSON.parse(raw.toString());if(x.id===i){ws.off('message',h);x.error?rej(new Error(JSON.stringify(x.error))):res(x.result);}};ws.on('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}));});}
const ev=async(ws,e)=>{const r=await send(ws,'Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)return 'EXC: '+(r.exceptionDetails.exception?.description||'').split('\n')[0];return r.result.value;};
try{
  let v;for(let i=0;i<40;i++){try{v=await(await fetch(`http://localhost:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const t=await(await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent('http://localhost:5173/login')}`,{method:'PUT'})).json();
  const ws=new WebSocket(t.webSocketDebuggerUrl,{maxPayload:256*1024*1024});
  await new Promise(r=>ws.on('open',r));
  await send(ws,'Runtime.enable');await send(ws,'Page.enable');
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  const errs=[];ws.on('message',(raw)=>{const m=JSON.parse(raw.toString());if(m.method==='Runtime.exceptionThrown')errs.push('EXC '+(m.params.exceptionDetails.exception?.description||'').split('\n')[0]);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errs.push('ERR '+(m.params.args||[]).map(a=>a.value??a.description).join(' ').slice(0,150));});
  await send(ws,'Page.navigate',{url:'http://localhost:5173/login'});await sleep(1200);
  await ev(ws,`localStorage.setItem('accessToken', ${JSON.stringify(tokens.admin)});localStorage.setItem('token_expires_at',(Date.now()+3600000).toString());localStorage.setItem('avc-auth', JSON.stringify({state:{user:{id:'x',email:'admin@avc.local',full_name:'Admin',role:'admin'},accessToken:'x',refreshToken:'y'},version:0}));`);
  const me = await (await fetch('http://localhost:3000/api/v1/sites', { headers: { authorization: `Bearer ${tokens.admin}` } })).json();
  const site = me.data[0];
  await send(ws,'Page.navigate',{url:`http://localhost:5173/dashboard/${site.id}?kiosk=1`});await sleep(4000);
  console.log('kiosk visible text:', (await ev(ws,`document.body.innerText.replace(/\\s+/g,' ').slice(0,300)`)));
  console.log('has sidebar?', await ev(ws,`!!document.querySelector('aside')`));
  console.log('scrollable? docHeight vs vh:', await ev(ws,`JSON.stringify({h: document.documentElement.scrollHeight, vh: window.innerHeight, overflow: getComputedStyle(document.documentElement).overflow})`));
  console.log('markers on map:', await ev(ws,`document.querySelectorAll('[title*="Fyllnadsgrad"]').length`));
  console.log('zones drawn:', await ev(ws,`document.querySelectorAll('svg polygon').length`));
  const shot=await send(ws,'Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('/tmp/opencode/shot-kiosk.png', Buffer.from(shot.data,'base64'));
  console.log('errors:', errs.length?errs.slice(0,3).join(' | '):'(none)');
  ws.close();
}catch(e){console.error('ERR',e.message);}finally{chrome.kill('SIGKILL');}
