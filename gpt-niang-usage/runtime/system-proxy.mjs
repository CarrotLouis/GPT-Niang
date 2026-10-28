import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import {spawnSync} from 'node:child_process';

export function parseProxy(value,scheme='https') {
  if(typeof value!=='string' || !value.trim())return null;
  let selected=value.trim();
  if(selected.includes('=')) {
    const entries=Object.fromEntries(selected.split(';').map(part=>part.trim().split('=',2)));
    selected=entries[scheme]??entries.http;
    if(!selected)return null;
  }
  try {
    const url=new URL(selected.includes('://')?selected:'http://'+selected);
    if(!['http:','https:'].includes(url.protocol) || !url.hostname || url.pathname!=='/' || url.search || url.hash)return null;
    return url;
  } catch {return null;}
}

export function discoverProxy({env=process.env,platform=process.platform,run=spawnSync}={}) {
  const explicit=env.HTTPS_PROXY??env.https_proxy??env.HTTP_PROXY??env.http_proxy;
  if(explicit)return parseProxy(explicit);
  if(platform!=='win32')return null;
  // Read the current user's existing manual proxy; never evaluate PAC scripts.
  const result=run('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],{encoding:'utf8',windowsHide:true,timeout:2000});
  if(result.status!==0 || !/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(result.stdout??''))return null;
  const match=/^\s*ProxyServer\s+REG_SZ\s+(.+)$/im.exec(result.stdout??'');
  return parseProxy(match?.[1]);
}

let cached,cacheAt=0;
function currentProxy() {
  if(Date.now()-cacheAt>60_000 || cacheAt===0){cached=discoverProxy();cacheAt=Date.now();}
  return cached;
}

export function proxyHttpsGet(url,options,callback) {
  const proxy=currentProxy();
  if(!proxy)return https.get(url,options,callback);
  const target=new URL(url);
  if(target.protocol!=='https:')throw new Error('HTTPS required');
  const agent=new https.Agent({keepAlive:false});
  agent.createConnection=(settings,done)=>{
    let settled=false,secure;
    const complete=(error,socket)=>{if(settled)return;settled=true;if(error){secure?.destroy();const code=/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'PROXY_CONNECTION_FAILED';const failure=new Error('System proxy connection failed ('+code+')');failure.code=code;done(failure);}else done(null,socket);};
    const headers={Host:target.hostname+':'+(target.port||443)};
    if(proxy.username || proxy.password)headers['Proxy-Authorization']='Basic '+Buffer.from(decodeURIComponent(proxy.username)+':'+decodeURIComponent(proxy.password)).toString('base64');
    const connect=(proxy.protocol==='https:'?https:http).request({hostname:proxy.hostname,port:proxy.port||(proxy.protocol==='https:'?443:80),method:'CONNECT',path:headers.Host,headers});
    connect.setTimeout(12_000,()=>connect.destroy(Object.assign(new Error('Proxy connection timed out'),{code:'ETIMEDOUT'})));
    connect.on('error',error=>complete(error));
    connect.on('connect',(response,socket,head)=>{
      if(response.statusCode!==200){socket.destroy();const error=new Error('Proxy refused connection');error.code='PROXY_HTTP_'+response.statusCode;complete(error);return;}
      if(head.length)socket.unshift(head);
      secure=tls.connect({socket,servername:target.hostname,rejectUnauthorized:true});
      secure.setTimeout(12_000,()=>secure.destroy(Object.assign(new Error('Proxy TLS connection timed out'),{code:'ETIMEDOUT'})));
      secure.once('error',error=>complete(error));
      secure.once('secureConnect',()=>{secure.setTimeout(0);complete(null,secure);});
    });
    connect.end();
  };
  // Proxy credentials appear only on CONNECT, never in origin request headers.
  const request=https.get(url,{...options,agent},callback);
  request.once('close',()=>agent.destroy());
  return request;
}
