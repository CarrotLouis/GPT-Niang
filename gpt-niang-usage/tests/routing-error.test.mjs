import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {readUsage} from '../runtime/usage.mjs';

function server(error) {
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};
  child.stdin.on('data',chunk=>{for(const line of chunk.toString().trim().split('\n')){
    const message=JSON.parse(line);
    if(message.id===1)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:1,result:{}})+'\n'));
    if(message.id===2)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:2,error})+'\n'));
  }});
  return ()=>child;
}
test('routing failures remain retryable and clear unverified account snapshots',async()=>{
  const result=await readUsage('fake',{spawnProcess:server({code:-32603,message:'workspace routing discovery timed out'})});
  assert.equal(result.errorCode,'WORKSPACE_ROUTING_UNAVAILABLE');assert.equal(result.retryable,true);assert.equal(result.clearPrevious,true);assert.equal(result.accountKey,null);assert.deepEqual(result.windows,[]);
  assert.doesNotMatch(result.error,/登录状态/);
});
test('raw server details and account addresses never escape failure normalization',async()=>{
  const result=await readUsage('fake',{spawnProcess:server({code:-32603,message:'private-user@example.test access failed'})});
  assert.equal(result.errorCode,'ACCOUNT_READ_FAILED');assert.doesNotMatch(JSON.stringify(result),/private-user|example\.test/);
});
