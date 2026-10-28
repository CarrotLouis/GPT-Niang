import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runUpdate} from '../runtime/update.mjs';

test('custom builds check new official releases without downloading or replacing local features',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gpt-niang-custom-update-'));
  const appDir=path.join(dir,'app'),dataDir=path.join(dir,'state'),agentDir=path.join(dir,'agent');
  for(const p of [appDir,dataDir,agentDir])fs.mkdirSync(p);
  fs.writeFileSync(path.join(appDir,'local-customization.json'),JSON.stringify({protectFromUpstreamOverwrite:true}));
  const version='1.3.6',base='https://github.com/T7moris/GPT-Niang/releases/download/v'+version+'/';
  const release={tag_name:'v'+version,assets:[{name:'gpt-niang-usage-widget-v'+version+'-windows.zip',size:123,url:'ignored',browser_download_url:base+'gpt-niang-usage-widget-v'+version+'-windows.zip'},{name:'SHA256SUMS.txt',size:123,browser_download_url:base+'SHA256SUMS.txt'}]};
  const requests=[];let installed=false;
  try {
    await runUpdate({appDir,dataDir,version:'1.3.5'},{agentDir,fetchBytes:async url=>{requests.push(url);return Buffer.from(JSON.stringify(release));},launch:async()=>{installed=true;}});
    const state=JSON.parse(fs.readFileSync(path.join(dataDir,'update-status.json'),'utf8'));
    assert.equal(state.phase,'available');assert.equal(state.version,version);assert.equal(installed,false);assert.equal(requests.length,1);
  } finally {assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
});
