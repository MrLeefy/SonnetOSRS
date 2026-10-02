'use strict';
/* Two real Chromium clients against an isolated release Rust server.
 * Exercises World 1 account authority; no mocked network or fake game state. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),delay=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
let backend,web,browser;
async function port(){return new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p));});});}
async function test(name,fn){await fn();results.push(name);console.log('PASS '+name);}
async function go(page,x,y){await page.evaluate(([x,y])=>cmdWalk(x,y),[x,y]);await page.waitForFunction(([x,y])=>G.player.x===x&&G.player.y===y&&!G.player.path.length,[x,y],{timeout:22000});}
(async()=>{
 const webPort=await port(),rustPort=await port(),origin='http://127.0.0.1:'+webPort,ws='ws://127.0.0.1:'+rustPort+'/ws';
 const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'oldskool-economy-')),stateFile=path.join(stateDir,'profiles.json'),binary=process.env.OLDSKOOL_SERVER_BIN||path.join(root,'server/target/release/oldskool-server');
 backend=cp.spawn(binary,[],{cwd:root,env:{...process.env,SONNET_BIND:'127.0.0.1:'+rustPort,SONNET_STATE:stateFile,OLDSKOOL_COLLISION:path.join(root,'server/data/world_collision.json'),OLDSKOOL_ALLOWED_ORIGINS:origin,OLDSKOOL_RESIDENTS:'0',RUST_LOG:'oldskool_server=warn'},stdio:['ignore','ignore','pipe']});
 let stderr='';backend.stderr.on('data',b=>stderr+=b);
 web=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}res.setHeader('content-type','text/html');res.end(fs.readFileSync(path.join(root,'dist/index.html')));});await new Promise(r=>web.listen(webPort,'127.0.0.1',r));
 browser=await chromium.launch(require('./browser-options.cjs'));
 const ctxA=await browser.newContext({viewport:{width:1280,height:720}}),ctxB=await browser.newContext({viewport:{width:839,height:412}});
 const a=await ctxA.newPage(),b=await ctxB.newPage(),errors=[];for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
 async function join(page,name){await page.goto(origin);await page.waitForFunction(()=>typeof App!=='undefined'&&App.mode==='login');await page.evaluate(({ws,name})=>{Online.endpoint=ws;startGame(name,'online');},{ws,name});await page.waitForFunction(()=>Online.ready&&Online.account.bank.length>0,{},{timeout:10000});}
 try{
  await join(a,'MarketAlice');await join(b,'MarketBob');
  await test('new World 1 characters receive authoritative 28-slot inventory, equipment, appearance and bank',async()=>{
    for(const p of[a,b]){
      const state=await p.evaluate(()=>({inv:G.player.inv.length,whip:G.player.eq.weapon?.id,bank:Online.account.bank.find(x=>x.id==='coins')?.quantity,style:G.player.kit.hairStyle}));
      assert.deepEqual(state,{inv:28,whip:'whip',bank:250000,style:Number(state.style)});assert.ok(state.style>=0&&state.style<=2);
    }
  });
  await test('online potion drinking is intent-only until the Rust account state returns',async()=>{
    const immediate=await a.evaluate(()=>{
      const i=G.player.inv.findIndex(x=>x?.id==='supstr'),before=G.player.inv[i].n;
      drinkPotion(G.player,i);
      return {i,before,after:G.player.inv[i].n,str:G.player.cur.str};
    });
    assert.ok(immediate.before>1);assert.equal(immediate.after,immediate.before);assert.equal(immediate.str,99);
    await a.waitForFunction(({i,expected})=>G.player.inv[i]?.n===expected&&G.player.cur.str>99,{i:immediate.i,expected:immediate.before-1},{timeout:4000});
  });
  await test('online prayer toggle is server-owned and client cannot spoof an overhead through combat_state',async()=>{
    const immediate=await a.evaluate(()=>{const before=G.player.prayers.has('pmelee');togglePrayer(G.player,'pmelee');return{before,after:G.player.prayers.has('pmelee')};});
    assert.equal(immediate.before,false);assert.equal(immediate.after,false);
    await a.waitForFunction(()=>G.player.prayers.has('pmelee')&&G.player.overhead==='pmelee',{},{timeout:4000});
    await a.evaluate(()=>Online.ws.send(JSON.stringify({type:'combat_state',weapon:G.player.eq.weapon?.id||'unarmed',style:'melee',spell:null,special:false,overhead:'pmagic'})));
    await delay(800);
    assert.deepEqual(await a.evaluate(()=>({p:[...G.player.prayers],o:G.player.overhead})),{p:['pmelee'],o:'pmelee'});
    await a.evaluate(()=>togglePrayer(G.player,'pmelee'));
    await a.waitForFunction(()=>!G.player.prayers.has('pmelee')&&!G.player.overhead,{},{timeout:4000});
  });
  await test('inventory drag sends a reorder intent and waits for server account state',async()=>{
    const state=await a.evaluate(()=>{
      const from=G.player.inv.findIndex(x=>x?.id==='dscim'),to=G.player.inv.findIndex(x=>x?.id==='dds');
      const before=[G.player.inv[from]?.id,G.player.inv[to]?.id];
      const r=invSlotRect(to),pt=Client.fromGame(r.x+r.w/2,r.y+r.h/2);
      UI.drag={from,active:true,sx:r.x,sy:r.y};
      onUp({clientX:pt.x,clientY:pt.y,button:0});
      return {from,to,before,immediate:[G.player.inv[from]?.id,G.player.inv[to]?.id]};
    });
    assert.deepEqual(state.immediate,state.before);
    await a.waitForFunction(({from,to})=>G.player.inv[from]?.id==='dds'&&G.player.inv[to]?.id==='dscim',{from:state.from,to:state.to},{timeout:4000});
  });
  await test('bank UI is server-authoritative and withdraw-all changes actual World 1 inventory',async()=>{
    await go(b,43,42);await b.evaluate(()=>Online.openBank());await b.waitForFunction(()=>Client.panel==='bank');
    await b.locator('.client-items').first().getByRole('button',{name:/Shark/}).first().click();
    await b.waitForFunction(()=>countItem(G.player,'shark')===12);
    const select=b.getByRole('combobox',{name:'Bank quantity'});await select.selectOption('all');
    await b.locator('.client-items').nth(1).getByRole('button',{name:/Coins/}).click();
    await b.waitForFunction(()=>countItem(G.player,'coins')===250000);
    assert.equal(await b.evaluate(()=>Online.account.bank.some(x=>x.id==='coins')),false);
    await b.keyboard.press('Escape');
  });
  await test('equipment ownership is server-side and unequipping puts the exact item in inventory',async()=>{
    await go(a,43,42);await a.evaluate(()=>Online.openBank());await a.waitForFunction(()=>Client.panel==='bank');
    await a.locator('.client-items').first().getByRole('button',{name:/Shark/}).first().click();await a.waitForFunction(()=>countItem(G.player,'shark')===12);await a.keyboard.press('Escape');
    await a.evaluate(()=>Online.unequip('weapon'));await a.waitForFunction(()=>!G.player.eq.weapon&&G.player.inv.some(x=>x?.id==='whip'));
    await a.evaluate(()=>Online.equip(G.player.inv.findIndex(x=>x?.id==='whip')));await a.waitForFunction(()=>G.player.eq.weapon?.id==='whip');
    await a.evaluate(()=>Online.unequip('weapon'));await a.waitForFunction(()=>!G.player.eq.weapon&&G.player.inv.some(x=>x?.id==='whip'));
  });
  await go(a,48,42);await go(b,48,42);
  await test('Grand Exchange exposes six live offer slots and a real trade catalog',async()=>{
    await a.evaluate(()=>Online.openGe());await a.waitForFunction(()=>Client.panel==='ge');
    assert.equal(await a.locator('.client-card h2').filter({hasText:/^Offer slot [1-6]$/}).count(),6);
    assert.ok(await a.evaluate(()=>Online.account.catalog.some(x=>x.id==='whip')));
    await a.keyboard.press('Escape');
  });
  await test('two players match at the older offer price with buyer refund held for collection',async()=>{
    await a.evaluate(()=>Online.gePlace(0,true,'whip',1,100000));await a.waitForFunction(()=>Online.account.offers.some(o=>o.slot===0&&o.item==='whip'));
    await b.evaluate(()=>Online.gePlace(0,false,'whip',1,120000));await b.waitForFunction(()=>Online.account.offers.some(o=>o.slot===0&&o.state==='completed'));
    const bo=await b.evaluate(()=>Online.account.offers.find(o=>o.slot===0));assert.equal(bo.collected_items,1);assert.equal(bo.collected_coins,20000);
    await a.evaluate(()=>Online.openGe());await a.waitForFunction(()=>Online.account.offers.some(o=>o.slot===0&&o.state==='completed'));
    const ao=await a.evaluate(()=>Online.account.offers.find(o=>o.slot===0));assert.equal(ao.collected_coins,100000);
  });
  await test('GE collections return matched items/coins atomically to each player',async()=>{
    await a.evaluate(()=>Online.geCollect(0));await a.waitForFunction(()=>countItem(G.player,'coins')===100000);
    await b.evaluate(()=>Online.geCollect(0,true));await b.waitForFunction(()=>Online.account.bank.some(x=>x.id==='whip'&&x.quantity===1)&&Online.account.bank.some(x=>x.id==='coins'&&x.quantity===20000));
    assert.equal(await b.evaluate(()=>countItem(G.player,'coins')),130000);
    assert.equal(await a.evaluate(()=>Online.account.offers.some(o=>o.slot===0)),false);
    assert.equal(await b.evaluate(()=>Online.account.offers.some(o=>o.slot===0)),false);
  });
  await test('server-persisted appearance replicates to the other client',async()=>{
    const aid=await a.evaluate(()=>Online.id);await b.waitForFunction(id=>Online.remotes.has(id),aid);
    await a.evaluate(()=>Online.setAppearance({...G.player.kit,shirt:0x9a2c2c,hairStyle:2}));await a.waitForFunction(()=>G.player.kit.shirt===0x9a2c2c&&G.player.kit.hairStyle===2);
    await b.waitForFunction(id=>Online.remotes.get(id)?.kit?.shirt===0x9a2c2c&&Online.remotes.get(id)?.kit?.hairStyle===2,aid,{timeout:3000});
  });
  await test('combat pursuit stops at the GE boundary when the target enters safety, without a large client correction',async()=>{
    await go(a,58,48);await go(b,57,48);
    const bid=await b.evaluate(()=>Online.id);await a.evaluate(id=>Online.attack(Online.remotes.get(id)),bid);
    await b.evaluate(()=>cmdWalk(56,48));await b.waitForFunction(()=>Online.zone==='safe'&&G.player.x===56);
    await delay(900);
    const state=await a.evaluate(()=>({x:G.player.x,y:G.player.y,target:G.player.target?.netId||null,large:Online.diagnostics.largeCorrections}));
    assert.equal(state.x,58);assert.equal(state.y,48);assert.equal(state.target,null);assert.equal(state.large,0);
  });
  await test('ordinary authority mismatch is visually corrected while explicit position epoch still hard-snaps',async()=>{
    const before=await a.evaluate(()=>Online.diagnostics.corrections);
    await a.evaluate(()=>{
      const p={id:Online.id,name:G.player.name,x:G.player.x+1,y:G.player.y,hp:G.player.hp,kills:0,deaths:0,zone:Online.zone,motion:[],motion_tick:Online.lastTick+1,position_epoch:G.player.netPositionEpoch,command_seq:Online.seq,destination:null,moving:false,run:G.player.run,attack_target:null,simulated:false,loadout:'main',weapon:G.player.eq.weapon?.id||'unarmed',combat_style:'melee',spell:null,overhead:null,spec:100,level:126,equipment:{},appearance:{skin:G.player.kit.skin,hair:G.player.kit.hair,shirt:G.player.kit.shirt,pants:G.player.kit.pants,boots:G.player.kit.boots,hair_style:G.player.kit.hairStyle}};
      Online.applySnapshot({tick:Online.lastTick+1,players:[p,...[...Online.remotes.values()].map(r=>({id:r.netId,name:r.name,x:r.x,y:r.y,hp:r.hp,kills:0,deaths:0,zone:r.netZone,motion:[],motion_tick:Online.lastTick+1,position_epoch:r.netPositionEpoch||0,command_seq:0,destination:null,moving:false,run:r.run,attack_target:null,simulated:r.simulated,loadout:'main',weapon:r.eq.weapon?.id||'unarmed',combat_style:'melee',spell:null,overhead:null,spec:100,level:r.level,equipment:{},appearance:{skin:r.kit.skin,hair:r.kit.hair,shirt:r.kit.shirt,pants:r.kit.pants,boots:r.kit.boots,hair_style:r.kit.hairStyle}}))]});
    });
    assert.ok(await a.evaluate(n=>Online.diagnostics.corrections>n,before));
    const hard=await a.evaluate(()=>{const e=G.player.netPositionEpoch;Online.applySnapshot({tick:Online.lastTick+1,players:[{id:Online.id,name:G.player.name,x:48,y:42,hp:99,kills:0,deaths:0,zone:'safe',motion:[{x:48,y:42}],motion_tick:Online.lastTick+1,position_epoch:e+1,command_seq:Online.seq,destination:null,moving:false,run:100,attack_target:null,simulated:false,loadout:'main',weapon:'unarmed',combat_style:'melee',spell:null,overhead:null,spec:100,level:126,equipment:{},appearance:{skin:G.player.kit.skin,hair:G.player.kit.hair,shirt:G.player.kit.shirt,pants:G.player.kit.pants,boots:G.player.kit.boots,hair_style:G.player.kit.hairStyle}}]});return Online.sampleMotion(G.player).moving;});assert.equal(hard,false);
  });
  await test('reconnect retains World 1 inventory, GE proceeds and appearance through server persistence',async()=>{
    await b.evaluate(()=>Online.ws.close());const old=await b.evaluate(()=>Online.id);await b.waitForFunction(id=>Online.ready&&Online.id!==id,old,{timeout:14000});
    const state=await b.evaluate(()=>({coins:countItem(G.player,'coins'),bankWhip:Online.account.bank.find(x=>x.id==='whip')?.quantity||0,bankCoins:Online.account.bank.find(x=>x.id==='coins')?.quantity||0,shirt:G.player.kit.shirt,offers:Online.account.offers.length}));
    assert.deepEqual(state,{coins:130000,bankWhip:1,bankCoins:20000,shirt:Number(state.shirt),offers:0});assert.equal(state.shirt,await b.evaluate(()=>G.player.kit.shirt));
  });
  await test('account and GE actions created no unhandled browser errors',async()=>assert.deepEqual(errors,[]));
  fs.writeFileSync(path.join(root,'qa','economy-online-results.json'),JSON.stringify({tests:results.length,physicalDevice:false,server:'isolated Rust release process',results},null,2)+'\n');
  console.log('ECONOMY_ONLINE_TESTS_PASSED='+results.length);
 }finally{
  await browser.close();web.close();backend.kill('SIGTERM');await Promise.race([new Promise(r=>backend.once('exit',r)),delay(5000)]);if(backend.exitCode===null)backend.kill('SIGKILL');
  fs.rmSync(stateDir,{recursive:true,force:true});if(backend.exitCode&&backend.exitCode!==0)console.error(stderr);
 }
})().catch(e=>{console.error(e);process.exitCode=1;if(browser)browser.close();if(web)web.close();if(backend)backend.kill('SIGTERM');});
