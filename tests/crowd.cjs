'use strict';
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),net=require('net'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),delay=ms=>new Promise(r=>setTimeout(r,ms));
const port=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
(async()=>{
 const wp=await port(),rp=await port(),origin='http://127.0.0.1:'+wp,state=fs.mkdtempSync(path.join(os.tmpdir(),'oldskool-crowd-'));
 const bin=process.env.OLDSKOOL_SERVER_BIN||path.join(root,'server/target/release/oldskool-server');
 const backend=cp.spawn(bin,[],{env:{...process.env,SONNET_BIND:'127.0.0.1:'+rp,SONNET_STATE:path.join(state,'profiles.json'),OLDSKOOL_COLLISION:path.join(root,'server/data/world_collision.json'),OLDSKOOL_ALLOWED_ORIGINS:origin,OLDSKOOL_RESIDENTS:'20',RUST_LOG:'error'},stdio:['ignore','ignore','pipe']});
 const server=http.createServer((q,res)=>{res.setHeader('content-type','text/html');res.end(fs.readFileSync(path.join(root,'dist/index.html')));});await new Promise(r=>server.listen(wp,'127.0.0.1',r));
 const browser=await chromium.launch(require('./browser-options.cjs')),page=await browser.newPage({viewport:{width:1440,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(origin);await page.waitForFunction(()=>App.mode==='login');await page.evaluate(ws=>{Online.endpoint=ws;startGame('CrowdQA','online');},'ws://127.0.0.1:'+rp+'/ws');await page.waitForFunction(()=>Online.ready&&Online.remotes.size>=20,{},{timeout:30000});
  const pop=await page.evaluate(()=>{const a=[...Online.remotes.values()],sim=a.filter(x=>x.simulated);return{sim:sim.length,safe:sim.filter(x=>x.netZone==='safe').length,pvp:sim.filter(x=>x.netZone==='pvp').length,blue:sim.every(x=>x.simulated),names:sim.map(x=>x.name)};});
  assert.equal(pop.sim,20);assert.ok(pop.safe>=8);assert.ok(pop.pvp>=8);assert.equal(new Set(pop.names).size,20);
  await page.waitForFunction(()=>G.msgs.some(x=>String(x.name||'').startsWith('[Sim]')),{},{timeout:30000});
  await page.waitForFunction(()=>G.projs.length>0||G.effects.length>0||[...Online.remotes.values()].some(x=>x.anim),{},{timeout:20000});
  await page.screenshot({path:path.join(root,'qa','crowd-ge.png')});
  await page.evaluate(()=>cmdWalk(48,36));await page.waitForFunction(()=>Online.zone==='pvp',{},{timeout:15000});await delay(5000);await page.screenshot({path:path.join(root,'qa','crowd-pvp.png')});
  const stateNow=await page.evaluate(()=>({sim:[...Online.remotes.values()].filter(x=>x.simulated).length,chat:G.msgs.filter(x=>String(x.name||'').startsWith('[Sim]')).length,errors:Online.diagnostics.errors,finite:DYN.p.every(Number.isFinite)&&BLD.p.every(Number.isFinite)}));
  assert.equal(stateNow.sim,20);assert.ok(stateNow.chat>0);assert.equal(stateNow.errors,0);assert.equal(stateNow.finite,true);assert.deepEqual(errors,[]);
  console.log('CROWD_TESTS_PASSED=6 '+JSON.stringify({pop,state:stateNow}));
 }finally{await browser.close();server.close();backend.kill('SIGTERM');await delay(1200);if(backend.exitCode===null)backend.kill('SIGKILL');fs.rmSync(state,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
