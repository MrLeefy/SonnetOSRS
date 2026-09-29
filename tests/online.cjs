'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p));});});}
async function waitHealth(url,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){try{const r=await fetch(url);if(r.ok)return await r.json();}catch(_){}await wait(100);}throw new Error('backend health timeout');}
(async()=>{
  const staticPort=await freePort(),backendPort=await freePort(),origin='http://127.0.0.1:'+staticPort,httpUrl='http://127.0.0.1:'+backendPort,wsUrl='ws://127.0.0.1:'+backendPort+'/ws';
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'oldskool-online-')),stateFile=path.join(stateDir,'profiles.json');
  const bin=process.env.OLDSKOOL_SERVER_BIN||path.join(root,'server','target','release','oldskool-server');
  assert.ok(fs.existsSync(bin),'Rust backend binary missing; build it first');
  const backend=cp.spawn(bin,[],{cwd:root,env:{...process.env,SONNET_BIND:'127.0.0.1:'+backendPort,SONNET_STATE:stateFile,OLDSKOOL_COLLISION:path.join(root,'server','data','world_collision.json'),OLDSKOOL_ALLOWED_ORIGINS:origin,OLDSKOOL_RESIDENTS:'0',RUST_LOG:'oldskool_server=warn'},stdio:['ignore','pipe','pipe']});
  let backendErr='';backend.stderr.on('data',d=>backendErr+=d);
  const staticServer=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}res.setHeader('content-type','text/html');res.end(fs.readFileSync(path.join(root,'dist','index.html')));});
  await new Promise(r=>staticServer.listen(staticPort,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true});
  const results=[];const test=async(name,fn)=>{await fn();results.push(name);console.log('PASS '+name);};
  async function make(name){
    const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.waitForFunction(()=>typeof App!=='undefined'&&App.mode==='login');
    await page.evaluate(({name,wsUrl,httpUrl})=>{Online.endpoint=wsUrl;Online.healthEndpoint=httpUrl;startGame(name,'online');},{name,wsUrl,httpUrl});
    await page.waitForFunction(()=>Online.connected&&Online.id,{timeout:7000});
    return{context,page,errors};
  }
  try{
    const h=await waitHealth(httpUrl+'/health');
    await test('Rust backend health reports the 600 ms world tick',async()=>{assert.equal(h.status,'ok');assert.equal(h.tick_ms,600);});
    const a=await make('Alice'),b=await make('Bob');
    await test('two independent WebGL clients join the same Rust world',async()=>{await a.page.waitForFunction(()=>Online.remotes.size===1);await b.page.waitForFunction(()=>Online.remotes.size===1);assert.equal((await (await fetch(httpUrl+'/health')).json()).players,2);});
    const ids={a:await a.page.evaluate(()=>Online.id),b:await b.page.evaluate(()=>Online.id)};
    await test('both players initially receive authoritative GE safe-zone state',async()=>{assert.equal(await a.page.evaluate(()=>Online.zone),'safe');assert.equal(await b.page.evaluate(()=>Online.zone),'safe');});
    await test('server rejects a forged PvP attack while players are inside the GE boundary',async()=>{
      await a.page.evaluate(id=>{Online.lastError=null;Online.ws.send(JSON.stringify({type:'attack',target_id:id}));},ids.b);
      await a.page.waitForFunction(()=>Online.lastError&&Online.lastError.code==='safe_zone',{},{timeout:3000});
      assert.match(await a.page.evaluate(()=>Online.lastError.message),/Grand Exchange/i);
    });
    await a.page.evaluate(()=>cmdWalk(48,38));await b.page.evaluate(()=>cmdWalk(49,38));
    await test('crossing the stone boundary changes both clients to the PvP zone',async()=>{await a.page.waitForFunction(()=>Online.zone==='pvp',{},{timeout:8000});await b.page.waitForFunction(()=>Online.zone==='pvp',{},{timeout:8000});});
    await test('server-authoritative PvP resolves outside the boundary',async()=>{
      await a.page.evaluate(id=>{Online.lastCombat=null;Online.ws.send(JSON.stringify({type:'attack',target_id:id}));},ids.b);
      await a.page.waitForFunction(()=>Online.lastCombat&&Online.lastCombat.target_id,{},{timeout:3000});
      const c=await a.page.evaluate(()=>Online.lastCombat);assert.equal(c.attacker_id,ids.a);assert.equal(c.target_id,ids.b);assert.ok(c.damage>=0&&c.damage<=12);
    });
    await test('client-side Attack option is hidden again after returning to the safe zone',async()=>{
      await a.page.evaluate(()=>cmdWalk(48,42));
      await a.page.waitForFunction(()=>Online.zone==='safe',{},{timeout:8000});
      assert.equal(await a.page.evaluate(()=>Online.canAttack([...Online.remotes.values()][0])),false);
    });
    await test('backend rejects off-grid or wall-skipping movement even if sent directly',async()=>{
      await a.page.evaluate(()=>{Online.lastError=null;Online.ws.send(JSON.stringify({type:'move',x:48.5,y:42,seq:9999}));});
      await a.page.waitForFunction(()=>Online.lastError&&Online.lastError.code==='move_rejected',{},{timeout:3000});
    });
    await test('online client still renders the classic OLDSKOOL interface without browser errors',async()=>{assert.deepEqual(a.errors,[]);assert.equal(await a.page.evaluate(()=>Client.composed),true);await a.page.screenshot({path:path.join(root,'qa','oldskool-online-world.png')});});
    await a.context.close();await b.context.close();
    console.log('ONLINE_TESTS_PASSED='+results.length);
    fs.writeFileSync(path.join(root,'qa','oldskool-online-results.json'),JSON.stringify({tests:results.length,physicalDevice:false,server:'local Rust process',results},null,2)+'\n');
  } finally {
    await browser.close();staticServer.close();backend.kill('SIGTERM');await Promise.race([new Promise(r=>backend.once('exit',r)),wait(3000)]);if(!backend.killed)backend.kill('SIGKILL');
    fs.rmSync(stateDir,{recursive:true,force:true});
    if(backend.exitCode&&backend.exitCode!==0)console.error(backendErr);
  }
})().catch(e=>{console.error(e);process.exit(1)});
