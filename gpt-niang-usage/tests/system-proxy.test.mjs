import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoverProxy,parseProxy} from '../runtime/system-proxy.mjs';
import {EventEmitter} from 'node:events';
import {download,RELEASE_API} from '../runtime/update.mjs';

test('explicit process proxy takes priority without querying the Windows registry',()=>{
  const result=discoverProxy({env:{HTTPS_PROXY:'http://127.0.0.1:7890'},platform:'win32',run:()=>{throw new Error('must not query');}});
  assert.equal(result.href,'http://127.0.0.1:7890/');
});
test('enabled Windows manual proxy accepts protocol-specific syntax',()=>{
  const run=()=>({status:0,stdout:'    ProxyEnable    REG_DWORD    0x1\n    ProxyServer    REG_SZ    http=127.0.0.1:7890;https=127.0.0.1:7891\n'});
  assert.equal(discoverProxy({env:{},platform:'win32',run}).port,'7891');
});
test('disabled registry proxy and unsupported schemes are ignored',()=>{
  const run=()=>({status:0,stdout:'ProxyEnable REG_DWORD 0x0\nProxyServer REG_SZ 127.0.0.1:7890'});
  assert.equal(discoverProxy({env:{},platform:'win32',run}),null);
  for(const value of ['file:///tmp/proxy','javascript:alert(1)','socks5://localhost:1080','http://localhost:123/path'])assert.equal(parseProxy(value),null);
});
test('non-Windows environments do not invoke a registry process',()=>{
  assert.equal(discoverProxy({env:{},platform:'darwin',run:()=>{throw new Error('must not query');}}),null);
});
test('transient connection errors retry only once',async()=>{
  let calls=0;const request=()=>{calls++;const req=new EventEmitter();req.setTimeout=()=>{};queueMicrotask(()=>req.emit('error',Object.assign(new Error('reset'),{code:'ECONNRESET'})));return req;};
  await assert.rejects(download(RELEASE_API,{api:true,request}),/reset/);assert.equal(calls,2);
});
test('certificate failures are not retried or bypassed',async()=>{
  let calls=0;const request=()=>{calls++;const req=new EventEmitter();req.setTimeout=()=>{};queueMicrotask(()=>req.emit('error',Object.assign(new Error('certificate'),{code:'CERT_HAS_EXPIRED'})));return req;};
  await assert.rejects(download(RELEASE_API,{api:true,request}),/certificate/);assert.equal(calls,1);
});
