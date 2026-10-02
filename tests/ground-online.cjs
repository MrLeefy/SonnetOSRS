'use strict';
/* Two real Chromium clients against an isolated release Rust server.
 * Verifies server-owned ground items: intent-only Drop/Take, owner-only
 * visibility, and PvP death piles. No mocked network or fake game state. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),delay=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
let backend,web,browser;
async function port(){return new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p));});});}
async function test(name,fn){await fn();results.push(name);console.log('PASS '+name);}
async function go(page,x,y){await page.evaluate(([x,y])=>cmdWalk(x,y),[x,y]);await page.waitForFunction(([x,y])=>G.player.x===x&&G.player.y===y&&!G.player.path.length,[x,y],{timeout:30000});}
(async()=>{
 const webPort=await port(),rustPort=await port(),origin='http://127.0.0.1:'+webPort,ws='ws://127.0.0.1:'+rustPort+'/ws';
 const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'oldskool-ground-')),stateFile=path.join(stateDir,'profiles.json'),binary=process.env.OLDSKOOL_SERVER_BIN||path.join(root,'server/target/release/oldskool-server');
 backend=cp.spawn(binary,[],{cwd:root,env:{...process.env,SONNET_BIND:'127.0.0.1:'+rustPort,SONNET_STATE:stateFile,OLDSKOOL_COLLISION:path.join(root,'server/data/world_collision.json'),OLDSKOOL_ALLOWED_ORIGINS:origin,OLDSKOOL_RESIDENTS:'0',RUST_LOG:'oldskool_server=warn'},stdio:['ignore','ignore','pipe']});
 let stderr='';backend.stderr.on('data',b=>stderr+=b);
 web=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}res.setHeader('content-type','text/html');res.end(fs.readFileSync(path.join(root,'dist/index.html')));});await new Promise(r=>web.listen(webPort,'127.0.0.1',r));
 browser=await chromium.launch(require('./browser-options.cjs'));
 const ctxA=await browser.newContext({viewport:{width:1280,height:720}}),ctxB=await browser.newContext({viewport:{width:839,height:412}});
 const a=await ctxA.newPage(),b=await ctxB.newPage(),errors=[];for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
 async function join(page,name){await page.goto(origin);await page.waitForFunction(()=>typeof App!=='undefined'&&App.mode==='login');await page.evaluate(({ws,name})=>{Online.endpoint=ws;startGame(name,'online');},{ws,name});await page.waitForFunction(()=>Online.ready&&Online.account.bank.length>0,{},{timeout:10000});}
 const invCount=p=>p.evaluate(()=>G.player.inv.filter(Boolean).length+Object.keys(G.player.eq).length);
 try{
  await join(a,'LootAlice');await join(b,'LootBob');
  await test('Drop menu entry exists online and is intent-only until Rust creates the ground item',async()=>{
    const r=await a.evaluate(()=>{
      const i=G.player.inv.findIndex(x=>x?.id==='shark'),entries=itemMenu(G.player,i),drop=entries.find(e=>stripTags(e.text).startsWith('Drop '));
      if(!drop)return{hasDrop:false};
      drop.fn();
      return{hasDrop:true,i,immediateInv:G.player.inv[i]?.id,immediateGround:G.ground.length};
    });
    assert.equal(r.hasDrop,true);assert.equal(r.immediateInv,'shark','browser must not remove the item itself');assert.equal(r.immediateGround,0,'browser must not create a ground item itself');
    await a.waitForFunction(i=>!G.player.inv[i]&&G.ground.length===1,r.i,{timeout:4000});
    const g=await a.evaluate(()=>({...G.ground[0]}));
    assert.equal(g.id,'shark');assert.ok(Number.isInteger(g.uid)&&g.uid>0);assert.equal(g.mine,true);
  });
  await test('another player cannot see or take an owner-private drop',async()=>{
    await delay(1500);
    assert.equal(await b.evaluate(()=>G.ground.length),0,'private item must not be replicated to other players');
    const uid=await a.evaluate(()=>G.ground[0].uid);
    await b.evaluate(uid=>{Online.lastError=null;Online.ws.send(JSON.stringify({type:'pickup',uid}));},uid);
    await b.waitForFunction(()=>Online.lastError?.code==='pickup',{},{timeout:4000});
    assert.equal(await b.evaluate(()=>countItem(G.player,'shark')),13);
  });
  await test('Take walks to the item and sends a pickup intent; Rust returns it to the inventory',async()=>{
    const before=await a.evaluate(()=>countItem(G.player,'shark'));
    await a.evaluate(()=>cmdTake(G.ground[0]));
    await a.waitForFunction(()=>G.ground.length===0&&countItem(G.player,'shark')===13,{},{timeout:8000});
    assert.equal(before,12);
  });
  await test('drops survive reconnect because Rust owns and persists them',async()=>{
    await a.evaluate(()=>{const i=G.player.inv.findIndex(x=>x?.id==='shark');itemMenu(G.player,i).find(e=>stripTags(e.text).startsWith('Drop ')).fn();});
    await a.waitForFunction(()=>G.ground.length===1,{},{timeout:4000});
    // Forget the local list so it can only come back from a fresh Rust ground_items message on a NEW socket.
    await a.evaluate(()=>{window.__oldWs=Online.ws;G.ground=[];Online.ws.close();});
    await a.waitForFunction(()=>Online.ws&&Online.ws!==window.__oldWs&&Online.ws.readyState===1&&Online.ready&&G.ground.length===1,{},{timeout:20000});
  });
  await test('PvP death sends the victim only their protected items and gives the killer a server-owned pile',async()=>{
    // Make room, then fight outside the safe zone.
    await a.evaluate(()=>{const slots=G.player.inv.map((x,i)=>x?.id==='shark'?i:-1).filter(i=>i>=0).slice(0,4);for(const i of slots)itemMenu(G.player,i).find(e=>stripTags(e.text).startsWith('Drop ')).fn();});
    await a.waitForFunction(()=>countItem(G.player,'shark')<=9,{},{timeout:10000});
    await go(a,48,26);await go(b,48,25);
    const victimBefore=await invCount(b);
    assert.ok(victimBefore>=20);
    await a.evaluate(()=>{const r=[...Online.remotes.values()][0];cmdAttack(r);});
    await b.waitForFunction(()=>G.player.hp<G.player.maxHp,{},{timeout:30000});
    await b.waitForFunction(()=>G.player.inv.filter(Boolean).length+Object.keys(G.player.eq).length<=3,{},{timeout:120000});
    const left=await invCount(b);assert.ok(left<=3,'victim keeps at most three items, kept '+left);
    // Killer sees the pile; the victim (not the owner) does not, for 60 s.
    await a.waitForFunction(()=>G.ground.some(g=>g.mine&&g.id!=='shark')||G.ground.length>2,{},{timeout:8000});
    assert.equal(await b.evaluate(()=>G.ground.filter(g=>g.mine).length),0);
    const pile=await a.evaluate(()=>G.ground.filter(g=>g.mine).length);assert.ok(pile>=5,'expected a death pile, saw '+pile);
    // Victim respawned by Rust at the Grand Exchange (explicit epoch discontinuity).
    await b.waitForFunction(()=>Math.hypot(G.player.x-48,G.player.y-42)<8,{},{timeout:8000});
  });
  assert.deepEqual(errors,[],'unhandled browser errors: '+errors.join('\n'));
  assert.equal(stderr.includes('panicked'),false,stderr);
  console.log('Ground item tests passed: '+results.length);
 }finally{
  await browser?.close();await new Promise(r=>web?web.close(r):r());backend?.kill('SIGTERM');
 }
})().catch(e=>{console.error(e);try{backend?.kill('SIGKILL');}catch(_){}process.exit(1);});
