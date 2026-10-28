import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const SOURCE = 'https://codex-reset.com/';
export const POLL_MS = 300_000;
export const MIN_POLL_MS = 60_000;
const MAX_AGE = 20 * 60_000;
const UA = 'GPTNiang-ResetReminder/1.0 (+https://github.com/T7moris/GPT-Niang; local customization)';
const iso = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const text = value => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,1800) : '';
export function sourceUrl(value) {
  try {const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password && !u.port && ['x.com','twitter.com'].includes(u.hostname) && /^\/thsottiaux\/status\/\d+$/.test(u.pathname) ? u.origin+u.pathname : null;} catch {return null;}
}
export function beijing(value) {
  const date=iso(value); if(!date)return '尚未公布';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(date));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} 北京时间`;
}
export function normalize(forecast,timeline,now=Date.now()) {
  if(!forecast || !iso(forecast.updated_at) || !Array.isArray(timeline?.events))throw new Error('INVALID_SOURCE_DATA');
  const fresh=now-Date.parse(forecast.updated_at)<=MAX_AGE && Date.parse(forecast.updated_at)<=now+MIN_POLL_MS;
  const resetAt=iso(forecast.last_reset_at);
  if(forecast.last_reset_at!=null && (!resetAt || Date.parse(resetAt)>now+MIN_POLL_MS))throw new Error('INVALID_RESET_TIME');
  const events=timeline.events.filter(e=>e?.group==='reset' && e.announcement_state==='announced' && iso(e.announced_at) && Date.parse(e.announced_at)<=now && sourceUrl(e.url)).sort((a,b)=>Date.parse(b.announced_at)-Date.parse(a.announced_at));
  const event=events[0];
  let plan=null;
  const signal=forecast.official_signal;
  if(signal && signal.active!==false && iso(signal.at) && Date.parse(signal.at)<=now && text(signal.summary) && sourceUrl(signal.url) && (!resetAt || Date.parse(signal.at)>Date.parse(resetAt))) {
    const deadline=iso(signal.window?.end_at);
    if(!deadline || now-Date.parse(deadline)<POLL_MS) {
      plan={id:String(signal.tweet_id??signal.url)+':'+(deadline??'unspecified'),at:iso(signal.at),summary:text(signal.localized_summary??signal.summary),url:sourceUrl(signal.url),deadlineAt:deadline,deadlineBeijing:deadline?beijing(deadline):'公告尚未明确时间',label:text(signal.window?.localized_label??signal.window?.label)};
    }
  }
  return {source:SOURCE,sourceLabel:'Data: codex-reset.com（第三方）',sourceUpdatedAt:iso(forecast.updated_at),stale:!fresh,lastResetAt:resetAt,lastResetBeijing:resetAt?beijing(resetAt):'暂无已核实记录',event:event?{id:String(event.id),at:iso(event.announced_at),summary:text(event.localized_summary??event.summary_zh??event.summary),url:sourceUrl(event.url)}:null,plan};
}
export function advance(previous,data,now=Date.now()) {
  const old=previous??{};
  const notices=Array.isArray(old.notifications)?old.notifications.slice(-24):[];
  const seenPlans=Array.isArray(old.seenPlans)?old.seenPlans.slice(-99):[];
  let seenReset=iso(old.seenResetAt);
  const initialized=old.initialized===true;
  const push=(id,kind,title,body,url)=>{if(!notices.some(n=>n.id===id))notices.push({id,kind,title,body,url,at:now,source:SOURCE});};
  if(!data.stale) {
    if(data.lastResetAt && (!seenReset || Date.parse(data.lastResetAt)>Date.parse(seenReset))) {
      if(initialized)push('reset:'+data.lastResetAt,'reset','Codex 全局额度重置已核实',data.lastResetBeijing+'。请刷新当前账号额度确认到账。',data.event?.url??SOURCE+'zh/');
      seenReset=data.lastResetAt;
    }
    if(data.plan) {
      const key='plan:'+data.plan.id;
      if(!seenPlans.includes(key)) {
        if(initialized)push(key,'plan','Tibo 发布了新的重置公告',data.plan.deadlineAt?'公告目标：'+data.plan.deadlineBeijing+'；实际到账待确认。':'公告尚未明确重置时间，查看原帖了解进展。',data.plan.url);
        seenPlans.push(key);
      }
      if(data.plan.deadlineAt && initialized) {
        const remaining=Date.parse(data.plan.deadlineAt)-now;
        if(remaining>0 && remaining<=15*60_000)push('soon:'+data.plan.id,'soon','重置公告目标将在 15 分钟内到达',data.plan.deadlineBeijing+'。这是公告目标，实际重置仍待确认。',data.plan.url);
        if(remaining<=0 && remaining>-POLL_MS)push('due:'+data.plan.id,'due','重置公告目标时间已到', '请查看公告或刷新账号额度，尚不能据此确认已经重置。',data.plan.url);
      }
    }
  }
  return {...old,...data,schema:1,ok:true,error:null,initialized:initialized||!data.stale,checkedAt:now,attemptedAt:now,nextCheckAt:now+POLL_MS,nextAllowedAt:now+MIN_POLL_MS,seenResetAt:seenReset,seenPlans:seenPlans.slice(-100),notifications:notices.slice(-32)};
}
export function failed(previous,error,now=Date.now(),retryAfter=0) {
  return {...(previous??{}),schema:1,source:SOURCE,ok:false,stale:true,error,attemptedAt:now,nextCheckAt:now+Math.max(POLL_MS,retryAfter),nextAllowedAt:now+Math.max(MIN_POLL_MS,retryAfter)};
}
function read(file) {try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return null;}}
function write(file,value) {fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,file);}finally{try{fs.unlinkSync(temp);}catch{}}}
function proxyUrl() {
  const configured=process.env.HTTPS_PROXY??process.env.https_proxy??process.env.HTTP_PROXY??process.env.http_proxy;
  if(configured)return configured;
  const result=spawnSync('git',['config','--get','http.proxy'],{encoding:'utf8',windowsHide:true,timeout:2000});
  return result.status===0?result.stdout.trim():null;
}
export function retryDelay(value,now=Date.now()) {
  if(/^\d+$/.test(value??''))return Number(value)*1000;
  const date=Date.parse(value??'');return Number.isFinite(date)?Math.max(0,date-now):0;
}
// CONNECT carries only public GET requests. Codex credentials never enter this module.
export function getJson(url,proxy=proxyUrl()) {
  return new Promise((resolve,reject)=>{
    const target=new URL(url);
    if(target.origin!==new URL(SOURCE).origin){reject(new Error('UNTRUSTED_SOURCE'));return;}
    let connection,request,transport,settled=false;
    const timer=setTimeout(()=>finish(new Error('NETWORK_TIMEOUT')),12_000);
    function finish(error,value) {if(settled)return;settled=true;clearTimeout(timer);if(error){request?.destroy();connection?.destroy();transport?.destroy();reject(error);}else{connection?.destroy();transport?.destroy();resolve(value);}}
    function receive(response) {
      const code=response.statusCode;
      if(code!==200){response.resume();const e=new Error(code===429?'HTTP_429':'HTTP_ERROR');e.retryAfter=retryDelay(response.headers['retry-after']);finish(e);return;}
      let bytes=0;const chunks=[];
      response.on('data',chunk=>{bytes+=chunk.length;if(bytes>2*1024*1024){finish(new Error('RESPONSE_TOO_LARGE'));return;}chunks.push(chunk);});
      response.on('error',()=>finish(new Error('NETWORK_ERROR')));
      response.on('end',()=>{try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish(new Error('INVALID_SOURCE_DATA'));}});
    }
    const options={hostname:target.hostname,path:target.pathname+target.search,method:'GET',headers:{'User-Agent':UA,Accept:'application/json'},agent:false};
    if(!proxy){request=https.request(options,receive);request.on('error',()=>finish(new Error('NETWORK_ERROR')));request.end();return;}
    let p;try{p=new URL(proxy);}catch{finish(new Error('INVALID_PROXY'));return;}
    if(!['http:','https:'].includes(p.protocol)){finish(new Error('INVALID_PROXY'));return;}
    const headers={Host:target.hostname+':443'};
    if(p.username||p.password)headers['Proxy-Authorization']='Basic '+Buffer.from(decodeURIComponent(p.username)+':'+decodeURIComponent(p.password)).toString('base64');
    transport=(p.protocol==='https:'?https:http).request({hostname:p.hostname,port:p.port||(p.protocol==='https:'?443:80),method:'CONNECT',path:target.hostname+':443',headers});
    transport.on('error',()=>finish(new Error('NETWORK_ERROR')));
    transport.on('connect',(response,socket,head)=>{
      connection=socket;if(response.statusCode!==200){finish(new Error('PROXY_ERROR'));return;}
      if(head.length)socket.unshift(head);
      const secure=tls.connect({socket,servername:target.hostname});connection=secure;
      secure.on('error',()=>finish(new Error('NETWORK_ERROR')));
      secure.once('secureConnect',()=>{if(settled){secure.destroy();return;}const agent=new https.Agent({keepAlive:false});agent.createConnection=()=>secure;request=https.request({...options,agent},receive);request.on('error',()=>finish(new Error('NETWORK_ERROR')));request.end();});
    });
    transport.end();
  });
}
export async function poll(configPath,{manual=false,now=Date.now(),fetchJson=getJson}={}) {
  const config=read(configPath);
  if(!config || !path.isAbsolute(config.dataDir??''))throw new Error('INVALID_LOCAL_CONFIGURATION');
  const file=path.join(config.dataDir,'reset-reminder.json');const previous=read(file);
  if(now<(previous?.nextAllowedAt??0) || (!manual && now<(previous?.nextCheckAt??0)))return previous;
  let state;
  try {
    const [forecast,timeline]=await Promise.all([fetchJson(SOURCE+'api/forecast?tz=Asia%2FShanghai'),fetchJson(SOURCE+'api/timeline?locale=zh')]);
    state=advance(previous,normalize(forecast,timeline,now),now);
  } catch(error) {state=failed(previous,['HTTP_429','INVALID_SOURCE_DATA','INVALID_RESET_TIME','NETWORK_TIMEOUT','RESPONSE_TOO_LARGE'].includes(error.message)?error.message:'NETWORK_ERROR',now,error.retryAfter??0);}
  write(file,state);return state;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {await poll(process.argv[2],{manual:process.argv.includes('--manual')});}catch{process.exitCode=1;}
}
