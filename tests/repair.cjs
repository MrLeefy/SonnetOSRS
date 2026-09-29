'use strict';
/* Real Rust + real rendered clients. Delays below buffer real incoming packets;
 * they are not a claim of physical handset or WAN testing. */
const {chromium,devices}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),results=[],delay=ms=>new Promise(r=>setTimeout(r,ms));
let browser,server,backend,ctx1,ctx2;
async function port(){return new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});}
async function test(name,fn){await fn();results.push(name);console.log('PASS '+name);}
(async()=>{
 const webPort=await port(),rustPort=await port(),origin='http://127.0.0.1:'+webPort,ws='ws://127.0.0.1:'+rustPort+'/ws',state=fs.mkdtempSync(path.join(os.tmpdir(),'oldskool-repair-'));
 const binary=process.env.OLDSKOOL_SERVER_BIN||path.join(root,'server/target/release/oldskool-server');
 backend=cp.spawn(binary,[],{env:{...process.env,SONNET_BIND:'127.0.0.1:'+rustPort,SONNET_STATE:path.join(state,'profiles.json'),OLDSKOOL_COLLISION:path.join(root,'server/data/world_collision.json'),OLDSKOOL_ALLOWED_ORIGINS:origin,RUST_LOG:'error'},stdio:['ignore','ignore','pipe']});
 backend.on('error',e=>{console.error(e);process.exitCode=1;});let stderr='';backend.stderr.on('data',b=>stderr+=b);
 server=http.createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(fs.readFileSync(path.join(root,'dist/index.html')));});await new Promise(r=>server.listen(webPort,'127.0.0.1',r));
 browser=await chromium.launch({headless:true});ctx1=await browser.newContext({...devices['Pixel 7'],viewport:{width:412,height:839},deviceScaleFactor:1});ctx2=await browser.newContext({viewport:{width:1440,height:800}});
 const a=await ctx1.newPage(),b=await ctx2.newPage(),errors=[];for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
 async function join(p,name){await p.goto(origin);await p.waitForFunction(()=>typeof App!=='undefined'&&App.mode==='login');await p.evaluate(({ws,name})=>{Online.endpoint=ws;startGame(name,'online');},{ws,name});await p.waitForFunction(()=>Online.ready,{},{timeout:10000});}
 async function go(p,x,y){await p.evaluate(([x,y])=>cmdWalk(x,y),[x,y]);await p.waitForFunction(([x,y])=>G.player.x===x&&G.player.y===y&&!G.player.path.length,[x,y],{timeout:22000});}
 try{
   await join(a,'RouteQA');await join(b,'ObserverQA');
   await test('collision grid in the rendered game exactly matches the Rust export',async()=>{const exported=JSON.parse(fs.readFileSync(path.join(root,'server/data/world_collision.json')));assert.deepEqual(await a.evaluate(()=>Array.from(WORLD.block)),exported.block);});
   await test('running around all four booths and the central counter completes without rejections',async()=>{
     for(const [x,y]of [[43,42],[43,54],[54,54],[54,42],[48,42]])await go(a,x,y);
     assert.equal(await a.evaluate(()=>Online.diagnostics.errors),0);
   });
   await test('clicking a blocked booth approaches it without entering its collision cell',async()=>{
     await a.evaluate(()=>cmdWalk(42,43));await a.waitForFunction(()=>!G.player.path.length&&Math.max(Math.abs(G.player.x-42),Math.abs(G.player.y-43))<=1);
     assert.ok(await a.evaluate(()=>passable(G.player.x,G.player.y)));assert.equal(await a.evaluate(()=>G.player.x===42&&G.player.y===43),false);
   });
   await test('click-to-bank works after a multi-turn server route',async()=>{
     await go(a,48,42);await a.getByRole('button',{name:'Bank',exact:true}).tap();await a.waitForFunction(()=>Client.panel==='bank',{},{timeout:14000});
     await a.screenshot({path:path.join(root,'qa','repair-bank.png')});await a.evaluate(()=>Client.close());
   });
   await test('two-leg running turns retain legal intermediate tiles in received motion',async()=>{
     await a.evaluate(()=>{window.badMotion=[];const receive=Online.applySnapshot;Online.applySnapshot=msg=>{for(const p of msg.players||[]){const m=p.motion||[];for(let i=1;i<m.length;i++){const x=m[i-1],y=m[i];if(!canStep(x.x,x.y,y.x-x.x,y.y-x.y))badMotion.push([x,y]);}}receive(msg);};});
     await go(a,48,58);await go(a,48,42);assert.deepEqual(await a.evaluate(()=>badMotion),[]);
   });
   await test('rapid retargeting is latest-command-wins rather than speed boosts or queued old routes',async()=>{
     await a.evaluate(()=>{for(const [x,y]of [[43,54],[54,42],[43,42],[54,54],[48,42]])cmdWalk(x,y);});
     await a.waitForFunction(()=>G.player.x===48&&G.player.y===42&&!G.player.path.length,{},{timeout:12000});
     assert.equal(await a.evaluate(()=>Online.diagnostics.errors),0);
   });
   await test('standing still and repeating a destination is an idempotent no-op',async()=>{
     await a.evaluate(()=>{for(let i=0;i<6;i++)cmdWalk(G.player.x,G.player.y);});await delay(1300);
     assert.equal(await a.evaluate(()=>Online.diagnostics.errors),0);assert.equal(await a.evaluate(()=>Online.isMoving(G.player)),false);
   });
   await test('one rejected legacy position packet does not cause a resend/chat flood',async()=>{
     const before=await a.evaluate(()=>({errors:Online.diagnostics.errors,sent:Online.diagnostics.sentWalks}));
     await a.evaluate(()=>Online.ws.send(JSON.stringify({type:'move',x:99.5,y:99.5,seq:9001})));
     await a.waitForFunction(n=>Online.diagnostics.errors===n+1,before.errors);await delay(1800);
     assert.equal(await a.evaluate(()=>Online.diagnostics.errors),before.errors+1);assert.equal(await a.evaluate(()=>Online.diagnostics.sentWalks),before.sent);
   });
   await test('stale snapshots cannot rewind the player',async()=>{
     const pos=await a.evaluate(()=>[G.player.x,G.player.y]);await a.evaluate(()=>Online.applySnapshot({tick:Online.lastTick-1,players:[{id:Online.id,x:80,y:80,hp:99,zone:'pvp'}]}));assert.deepEqual(await a.evaluate(()=>[G.player.x,G.player.y]),pos);
   });
   await test('ordered packet jitter does not cancel a route or send position corrections',async()=>{
     await a.evaluate(()=>{const receive=Online.handle;window.restoreReceive=receive;let q=Promise.resolve(),i=0;Online.handle=raw=>{const lag=[0,190,30,320,80][i++%5];q=q.then(()=>new Promise(done=>setTimeout(()=>{receive(raw);done();},lag)));};});
     await go(a,43,54);await go(a,48,42);await delay(1100);await a.evaluate(()=>Online.handle=restoreReceive);
     assert.equal(await a.evaluate(()=>Online.diagnostics.errors),1);
   });
   await test('the online world and interpolation continue while a settings window is open',async()=>{
     await a.evaluate(()=>{cmdWalk(43,54);Client.open('menu');});const tick=await a.evaluate(()=>G.now);
     await a.waitForFunction(()=>G.player.x===43&&G.player.y===54,{},{timeout:18000});assert.ok(await a.evaluate(()=>G.now)>tick);await a.evaluate(()=>Client.close());await go(a,48,42);
   });
   await test('reconnect restores server position without a queued walk or duplicate actor',async()=>{
     await go(a,43,42);const id=await a.evaluate(()=>Online.id);await a.evaluate(()=>Online.ws.close());await a.waitForFunction(id=>Online.ready&&Online.id!==id,id,{timeout:14000});
     assert.deepEqual(await a.evaluate(()=>[G.player.x,G.player.y]),[43,42]);assert.equal(await a.evaluate(()=>G.player.path.length),0);assert.equal(await b.evaluate(()=>Online.remotes.size),1);
   });
   await test('remote characters settle at their actual location instead of looping their last step',async()=>{
     await delay(1500);const remote=await b.evaluate(()=>{const a=[...Online.remotes.values()][0];return{x:a.x,y:a.y,moving:Online.isMoving(a),seg:a.seg.length};});assert.equal(remote.moving,false);assert.equal(remote.seg,0);assert.equal(remote.x,43);
   });
   await test('a second tab using an active resume token is rejected without creating a duplicate',async()=>{
     const dup=await ctx1.newPage();await dup.goto(origin);await dup.waitForFunction(()=>App.mode==='login');await dup.evaluate(ws=>{Online.endpoint=ws;startGame('RouteQA','online');},ws);
     await dup.waitForFunction(()=>Online.lastError?.code==='profile_in_use',{},{timeout:8000});assert.equal(await dup.evaluate(()=>Online.ready),false);await dup.close();
   });
   await test('online-to-offline switching preserves the prior offline inventory',async()=>{
     await a.evaluate(()=>{startGame('SaveQA','arena');addItem(G.player,'guardianSigil',3);Profiles.save();});const key=await a.evaluate(()=>Profiles.key());const before=await a.evaluate(key=>JSON.parse(localStorage.getItem(key)).player.inv,key);
     await a.evaluate(()=>startGame('SaveQA','online'));await a.waitForFunction(()=>Online.ready);await a.evaluate(()=>{Profiles.save();startGame('SaveQA','arena');});assert.deepEqual(await a.evaluate(()=>G.player.inv),before);
     await a.evaluate(()=>startGame('RouteQA','online'));await a.waitForFunction(()=>Online.ready);
   });
   await test('online scene geometry stays finite and the safe-zone label fits inside the viewport',async()=>{
     const result=await a.evaluate(()=>({finite:DYN.p.every(Number.isFinite)&&BLD.p.every(Number.isFinite),vertices:DYN.count,booths:WORLD.objs.filter(o=>o.kind==='bank').every(o=>o.h>1.8),badge:Client.zoneBadge,world:Client.L.world}));assert.equal(result.finite,true);assert.ok(result.vertices<220000);assert.equal(result.booths,true);assert.ok(result.badge.x+result.badge.w<=result.world.x+result.world.w);
   });
   await go(a,43,42);await a.evaluate(()=>{App.cam.yaw=.45;App.cam.pitch=.86;App.cam.dist=10;});await delay(600);await a.screenshot({path:path.join(root,'qa','repair-portrait.png')});
   await a.setViewportSize({width:839,height:412});await delay(600);await a.screenshot({path:path.join(root,'qa','repair-landscape.png')});
   await go(b,48,42);await b.evaluate(()=>{App.cam.yaw=.38;App.cam.dist=13;});await delay(600);await b.screenshot({path:path.join(root,'qa','repair-desktop.png')});
   await test('phone rotation and two-client rendering produce no unhandled browser errors',async()=>{assert.deepEqual(errors,[]);});
   fs.writeFileSync(path.join(root,'qa','repair-results.json'),JSON.stringify({tests:results.length,physicalDevice:false,results},null,2)+'\n');console.log('REPAIR_TESTS_PASSED='+results.length);
 }finally{
   await browser.close();server.close();backend.kill('SIGTERM');await Promise.race([new Promise(r=>backend.once('exit',r)),delay(5000)]);if(backend.exitCode===null)backend.kill('SIGKILL');fs.rmSync(state,{recursive:true,force:true});if(backend.exitCode&&backend.exitCode!==0)console.error(stderr);
 }
})().catch(e=>{console.error(e);process.exitCode=1;if(browser)browser.close();if(server)server.close();if(backend)backend.kill('SIGTERM');});
