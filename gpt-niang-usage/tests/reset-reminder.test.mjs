import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalize,advance,failed,beijing,sourceUrl,retryDelay,poll,MIN_POLL_MS,POLL_MS} from '../runtime/reset-reminder.mjs';
const now=Date.parse('2026-10-14T09:00:00Z');
const last='2026-10-13T05:03:51Z';
function inputs(at=last) {return [{updated_at:new Date(now).toISOString(),last_reset_at:at,official_signal:null,probabilities:{rounded_24h:99,rounded_48h:100}}, {events:[{id:'123456789',group:'reset',announcement_state:'announced',announced_at:at,url:'https://x.com/thsottiaux/status/123456789',summary:'Verified record'}]}];}
const initial=()=>advance(null,normalize(...inputs(),now),now);
const planned=()=>({tweet_id:'999999999',at:'2026-10-14T08:50:00Z',summary:'A reset is planned.',url:'https://x.com/thsottiaux/status/999999999',window:{end_at:'2026-10-14T09:12:00Z',label:'by the announced deadline'}});
test('first successful check is a quiet baseline, even with high prediction odds',()=>assert.equal(initial().notifications.length,0));
test('only a forward confirmed reset produces one alert; repeat and corrections are quiet',()=>{
  const first=initial();const args=inputs('2026-10-14T08:59:00Z');const second=advance(first,normalize(...args,now),now);
  assert.equal(second.notifications.length,1);assert.equal(second.notifications[0].kind,'reset');
  assert.equal(advance(second,normalize(...args,now),now).notifications.length,1);
  assert.equal(advance(second,normalize(...inputs(),now),now).notifications.length,1);
});
test('banked grants, unverified feed guesses and model odds never become reset alerts',()=>{
  const [f,t]=inputs();t.events.unshift({group:'reset',announcement_state:'none',announced_at:new Date(now).toISOString(),url:'https://x.com/thsottiaux/status/888888888',summary:'It is done'});
  t.events.unshift({group:'banked',announcement_state:'announced',announced_at:new Date(now).toISOString()});
  const data=normalize(f,t,now);assert.equal(data.event.summary,'Verified record');assert.equal(advance(initial(),data,now).notifications.length,0);
});
test('new explicit official plan produces a notice and a deduplicated 15 minute warning',()=>{
  const [f,t]=inputs();f.official_signal=planned();const second=advance(initial(),normalize(f,t,now),now);
  assert.deepEqual(second.notifications.map(n=>n.kind),['plan','soon']);
  assert.equal(advance(second,normalize(f,t,now),now).notifications.length,2);
});
test('initial future plan is shown quietly; deadline due notice never says reset is confirmed',()=>{
  const [f,t]=inputs();f.official_signal=planned();const first=advance(null,normalize(f,t,now),now);assert.equal(first.notifications.length,0);
  const due=now+12*60_000;f.updated_at=new Date(due).toISOString();const result=advance(first,normalize(f,t,due),due);
  assert.equal(result.notifications[0].kind,'due');assert.match(result.notifications[0].body,/尚不能/);
});
test('unknown official time is retained without inventing an alarm; historical windows are discarded',()=>{
  const [f,t]=inputs();f.official_signal=planned();delete f.official_signal.window;
  assert.equal(normalize(f,t,now).plan.deadlineAt,null);
  f.official_signal.window={end_at:'2026-10-14T08:00:00Z'};assert.equal(normalize(f,t,now).plan,null);
});
test('stale source cannot advance the notification baseline; HTTP failures keep good cached data',()=>{
  const [f,t]=inputs('2026-10-14T08:59:00Z');f.updated_at='2026-10-14T07:00:00Z';const state=advance(initial(),normalize(f,t,now),now);
  assert.equal(state.notifications.length,0);assert.equal(state.seenResetAt,new Date(last).toISOString());
  const error=failed(initial(),'HTTP_429',now,3600_000);assert.equal(error.lastResetAt,new Date(last).toISOString());assert.equal(error.nextAllowedAt,now+3600_000);assert.equal(error.stale,true);
});
test('invalid schema and future reset time fail safely; remote URLs cannot run arbitrary schemes',()=>{
  assert.throws(()=>normalize({}, {},now));assert.throws(()=>normalize(...inputs('2026-10-15T00:00:00Z'),now));
  for(const url of ['javascript:alert(1)','https://x.com.evil.test/thsottiaux/status/123','https://evil.test/','https://user@x.com/thsottiaux/status/123'])assert.equal(sourceUrl(url),null);
});
test('all reset times are Beijing time, including midnight rollover',()=>{
  assert.equal(beijing('2026-10-13T05:03:51Z'),'2026-10-13 13:03 北京时间');
  assert.equal(beijing('2026-10-14T23:30:00Z'),'2026-10-15 07:30 北京时间');
});
test('Retry-After supports both seconds and an HTTP date',()=>{
  assert.equal(retryDelay('120',now),120_000);assert.equal(retryDelay(new Date(now+120_000).toUTCString(),now),120_000);
});
test('polling honors five minute cadence, one minute manual limit, and persists failure without a false reset',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gpt-niang-reset-test-'));
  try {
    const cfg=path.join(dir,'installation.json');fs.writeFileSync(cfg,JSON.stringify({dataDir:dir}));let calls=0;
    const fetchJson=async url=>{calls++;return url.includes('/forecast')?inputs()[0]:inputs()[1];};
    await poll(cfg,{now,fetchJson});assert.equal(calls,2);
    await poll(cfg,{now:now+MIN_POLL_MS,fetchJson});assert.equal(calls,2);
    await poll(cfg,{now:now+1000,manual:true,fetchJson});assert.equal(calls,2);
    await poll(cfg,{now:now+MIN_POLL_MS,manual:true,fetchJson});assert.equal(calls,4);
    const state=await poll(cfg,{now:now+POLL_MS+MIN_POLL_MS,fetchJson:async()=>{throw new Error('offline');}});
    assert.equal(state.ok,false);assert.equal(state.notifications.length,0);assert.equal(state.lastResetAt,new Date(last).toISOString());
  } finally {assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
});
