/* End-to-end checks in Chromium. Touch/pinch includes Chromium's real touch
 * injection; cancellation events are explicitly dispatched to exercise the
 * browser interruption path, not misreported as physical-device testing. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {chromium,devices}=require('playwright');
const root=path.resolve(__dirname,'..'),results=[];let server,browser,base;
async function check(name,fn){const t=Date.now();await fn();results.push({name,passed:true,durationMs:Date.now()-t});console.log('PASS '+name);}
async function create(options={}){
 const context=await browser.newContext(options),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base+'/?auto=1&mode=expedition&profile=BrowserQA');
 await page.waitForFunction(()=>typeof App!=='undefined'&&(App.mode==='game'||App.error));
 const error=await page.evaluate(()=>App.error&&String(App.error));assert.equal(error,null);
 await page.waitForTimeout(200);
 return {context,page,errors};
}
async function point(page,gx,gy){return page.evaluate(({gx,gy})=>{
 if(Client.composed || Client.mobile)return Client.fromGame(gx,gy);
 const r=INP.canvas.getBoundingClientRect();return{x:r.left+gx*r.width/W,y:r.top+gy*r.height/H};
},{gx,gy});}
async function tap(page,p){await page.touchscreen.tap(p.x,p.y);await page.waitForTimeout(90);}
async function dispatch(page,type,id,p,primary=true){await page.evaluate(({type,id,p,primary})=>{
 const target=type==='pointerdown'?(Client.composed || Client.mobile?Client.surface:INP.canvas):window;
 target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:primary,clientX:p.x,clientY:p.y,button:0,buttons:/up|cancel/.test(type)?0:1}));
},{type,id,p,primary});}
async function screenshot(page,name){await page.screenshot({path:path.join(root,'qa',name+'.png')});}
async function main(){
 server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const f=path.join(root,pathname==='/'?'dist/index.html':pathname.replace(/^\//,''));
  if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(f));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch(require('./browser-options.cjs'));fs.mkdirSync(path.join(root,'qa'),{recursive:true});
 const desktop=await create({viewport:{width:1280,height:800}}),p=desktop.page;
 await check('desktop expedition boots the existing renderer and full world',async()=>{
  const s=await p.evaluate(()=>({ready:WORLD.ready,nodes:Expedition.nodes.length,monsters:G.actors.filter(a=>a.monster).length,mode:App.mode}));
  assert.deepEqual(s,{ready:true,nodes:10,monsters:6,mode:'game'});
 });
 await check('all gathering stations and monster homes are reachable in the actual map',async()=>{
  const failures=await p.evaluate(()=>{
   const start=G.player,out=[];for(const o of [...Expedition.nodes,...G.actors.filter(a=>a.monster)]){
    const result=findPath(start.x,start.y,(x,y)=>dist2(x,y,o.x,o.y)<=1,null,9216);
    if(!result)out.push(o.name);
   }return out;
  });assert.deepEqual(failures,[]);
 });
 await check('welcome screen accepts a profile without asking for a password',async()=>{
  await p.locator('#client-bar button').filter({hasText:'Menu'}).click();
  assert.equal(await p.locator('input[type="password"]').count(),0);
  await p.locator('#profile-name').fill('PlayTester');
  await p.locator('[data-mode="expedition"]').click();
  await p.waitForFunction(()=>G.player.name==='PlayTester'&&!Client.panel);
  assert.equal(await p.evaluate(()=>Expedition.active),true);
 });
 await check('opening a modal pauses simulation and animation time',async()=>{
  await p.locator('#client-bar button').filter({hasText:'Journal'}).click();
  const t=await p.evaluate(()=>[G.tick,G.now]);await p.waitForTimeout(850);assert.deepEqual(await p.evaluate(()=>[G.tick,G.now]),t);
  await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>Client.panel),null);
 });
 await check('native settings inputs do not leak keystrokes into game chat',async()=>{
  await p.locator('#client-bar button').filter({hasText:'Menu'}).click();await p.locator('#profile-name').fill('TypingTest');await p.locator('#profile-name').press('ArrowLeft');
  assert.equal(await p.evaluate(()=>UI.chatInput),'');assert.equal(await p.evaluate(()=>!!INP.keys.ArrowLeft),false);await p.keyboard.press('Escape');
 });
 await check('gathering uses the normal world click, path and tick loop',async()=>{
  const screen=await p.evaluate(()=>{
   const o=Expedition.nodes.find(o=>o.skill==='mining');G.player.x=o.x-1;G.player.y=o.y;G.player.path=[];G.player.seg=[];Polish.snapCamera=true;
   return{o:{x:o.x,y:o.y}};
  });await p.waitForTimeout(180);
  const screenPos=await p.evaluate(({o})=>{const s=App.cam.project(o.x+.5,groundH(o.x+.5,o.y+.5)+.35,-(o.y+.5));return{x:s[0]+VX,y:s[1]+VY};},screen);
  const at=await point(p,screenPos.x,screenPos.y);await p.mouse.click(at.x,at.y);
  await p.waitForFunction(()=>Expedition.gather!==null,{},{timeout:4000});
  await p.waitForFunction(()=>countItem(G.player,'ironOre')>=1,{},{timeout:5000});
  assert.ok(await p.evaluate(()=>Expedition.xp.mining)>=25);
  await p.evaluate(()=>{cmdWalk(G.player.x-1,G.player.y);});assert.equal(await p.evaluate(()=>Expedition.gather),null);
 });
 await check('native bank deposits and withdraws an actual inventory item',async()=>{
  await p.evaluate(()=>{Expedition.cancelGather();const b=WORLD.objs.find(o=>o.kind==='bank');G.player.x=b.x-1;G.player.y=b.y;G.player.target=null;G.player.path=[];G.player.seg=[];G.player.lastHitTick=-999;});
  await p.locator('#client-bar button').filter({hasText:'Bank'}).click();await p.waitForFunction(()=>Client.panel==='bank');
  await p.locator('.client-items').first().locator('button').filter({hasText:'Trail pickaxe'}).click();
  assert.equal(await p.evaluate(()=>countItem(G.player,'trailPick')),0);
  await p.locator('.client-items').nth(1).locator('button').filter({hasText:'Trail pickaxe'}).click();
  assert.equal(await p.evaluate(()=>countItem(G.player,'trailPick')),1);await p.keyboard.press('Escape');
 });
 await check('forge UI completes a real recipe and awards XP',async()=>{
  await p.evaluate(()=>{
   const o=Expedition.nodes.find(o=>o.station==='forge');G.player.x=o.x-1;G.player.y=o.y;G.player.target=null;G.player.path=[];G.player.seg=[];G.player.lastHitTick=-999;
   addItem(G.player,'ironOre',2);Client.open('craft');
  });
  const before=await p.evaluate(()=>countItem(G.player,'ironBar'));
  await p.locator('.client-card').filter({hasText:'Smelt iron bar'}).locator('button').click();
  assert.equal(await p.evaluate(()=>countItem(G.player,'ironBar')),before+1);assert.ok(await p.evaluate(()=>Expedition.xp.smithing)>=45);await p.keyboard.press('Escape');
 });
 await check('contract reward UI records exactly one claim',async()=>{
  await p.evaluate(()=>{Expedition.progress.ore=6;Client.open('journal');});
  await p.locator('.client-card').filter({hasText:'Prospector'}).locator('button').click();
  assert.equal(await p.evaluate(()=>Expedition.claimed.ore),true);
  assert.equal(await p.locator('.client-card').filter({hasText:'Prospector'}).locator('button').isDisabled(),true);await screenshot(p,'journal');await p.keyboard.press('Escape');
 });
 await check('save and page reload retain equipment, bank, XP and claims',async()=>{
  await p.evaluate(()=>{G.player.x=48;G.player.y=34;G.player.path=[];G.player.seg=[];Expedition.bank.push({id:'brew',n:2,qty:3});Profiles.save();});
  const before=await p.evaluate(()=>({name:G.player.name,xp:Expedition.xp,claim:Expedition.claimed.ore,bank:Expedition.bank,inv:G.player.inv,eq:G.player.eq}));
  await p.goto(base+'/?auto=1&mode=expedition&profile=PlayTester');await p.waitForFunction(()=>App.mode==='game');
  const after=await p.evaluate(()=>({name:G.player.name,xp:Expedition.xp,claim:Expedition.claimed.ore,bank:Expedition.bank,inv:G.player.inv,eq:G.player.eq}));assert.deepEqual(after,before);
 });
 await check('Arena stays separate from Expedition and accepts bots zero',async()=>{
  await p.evaluate(()=>startGame('PlayTester','arena'));assert.equal(await p.evaluate(()=>G.player.stats.hp),99);
  assert.equal(await p.evaluate(()=>Expedition.bank.length),0);await p.evaluate(()=>chatCommand('::bots 0'));assert.equal(await p.evaluate(()=>G.actors.filter(a=>a.isBot).length),0);
  await p.evaluate(()=>startGame('PlayTester','expedition'));assert.equal(await p.evaluate(()=>Expedition.claimed.ore),true);assert.equal(await p.evaluate(()=>Expedition.bank[0].n),2);
 });
 await check('classic mouse inventory click and middle-mouse orbit still work',async()=>{
  await p.evaluate(()=>{UI.tab=3;G.player.hp=12;G.player.eatCd=0;});
  const slot=await p.evaluate(()=>invSlotRect(findFoodIdx(G.player)));const a=await point(p,slot.x+20,slot.y+18);
  await p.mouse.click(a.x,a.y);assert.equal(await p.evaluate(()=>G.player.hp),21);
  const world=await point(p,250,160),yaw=await p.evaluate(()=>App.cam.yaw);
  await p.mouse.move(world.x,world.y);await p.mouse.down({button:'middle'});await p.mouse.move(world.x+70,world.y+20,{steps:4});await p.mouse.up({button:'middle'});
  assert.ok(Math.abs(await p.evaluate(()=>App.cam.yaw)-yaw)>.1);assert.equal(await p.evaluate(()=>INP.mmb),false);
 });
 await check('blur releases held camera keys',async()=>{
  await p.keyboard.down('ArrowRight');assert.equal(await p.evaluate(()=>INP.keys.ArrowRight),true);
  await p.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await p.evaluate(()=>!!INP.keys.ArrowRight),false);await p.keyboard.up('ArrowRight');
 });
 await check('render quality changes physical pixels without changing hit-test space',async()=>{
  const data=await p.evaluate(()=>{
   Profiles.settings.quality='low';Polish.configure();const low=[App.glCanvas.width,App.glCanvas.height];
   Profiles.settings.quality='high';Polish.configure();const high=[App.glCanvas.width,App.glCanvas.height];
   return{low,high,logical:[W,H,VW,VH]};
  });assert.ok(data.high[0]>data.low[0]);assert.deepEqual(data.logical,[765,503,512,334]);
  await p.evaluate(()=>{Profiles.settings.quality='balanced';Polish.configure();});
 });
 await check('1,200 Arena simulation ticks preserve actor, inventory and queue invariants',async()=>{
  const result=await p.evaluate(()=>{
   startGame('SoakArena','arena');setBotCount(14);G.player.protectUntil=100000;
   for(let i=0;i<1200;i++){G.now+=600;G.lastTick=G.now;gameTick();}
   return{actors:G.actors.length,bad:G.actors.filter(a=>!Number.isFinite(a.hp)||a.inv.length!==28||Object.hasOwn(a.inv,'-1')||a.inv.some(s=>s&&(!Engine.validItem(s.id)||!Engine.validQty(s.n)))).map(a=>a.name),ground:G.ground.length,hits:G.hitQ.length,effects:G.effects.length,projs:G.projs.length};
  });assert.equal(result.actors,21);assert.deepEqual(result.bad,[]);assert.ok(result.ground<=512&&result.effects<=160&&result.projs<=160&&result.hits<300);
 });
 await check('900 Expedition ticks keep leashes, boss respawn and save validation healthy',async()=>{
  const result=await p.evaluate(()=>{
   startGame('SoakExp','expedition');G.player.protectUntil=100000;
   for(let i=0;i<900;i++){G.now+=600;G.lastTick=G.now;gameTick();}
   const save=Profiles.capture();return{mode:save.mode,actors:G.actors.length,monsters:G.actors.filter(a=>a.monster).length,nodes:WORLD.objs.filter(o=>o.expedition).length};
  });assert.deepEqual(result,{mode:'expedition',actors:13,monsters:6,nodes:10});
 });
 await p.evaluate(()=>{G.player.x=48;G.player.y=34;Polish.snapCamera=true;});await p.waitForTimeout(200);await screenshot(p,'desktop-expedition');
 assert.deepEqual(desktop.errors,[]);await desktop.context.close();

 const touch=await create(devices['Pixel 7']),m=touch.page;
 await check('portrait touch layout keeps world and inventory on screen',async()=>{
  const bounds=await m.evaluate(()=>({width:innerWidth,height:innerHeight,world:Client.world,panel:Client.panelRect,footer:{y:Client.L.channels.y}}));
  for(const r of [bounds.world,bounds.panel]){assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=bounds.width+1&&r.y+r.h<=bounds.footer.y+1);}
 });
 await check('native mobile bag/equipment/prayer tabs select the original panels',async()=>{
  await m.locator('#client-footer button').filter({hasText:/^Prayer$/}).click();assert.equal(await m.evaluate(()=>UI.tab),5);
  await m.locator('#client-footer button').filter({hasText:/^Bag$/}).click();assert.equal(await m.evaluate(()=>UI.tab),3);
 });
 await check('genuine touchscreen inventory tap consumes food exactly once',async()=>{
  await m.evaluate(()=>{G.player.hp=10;G.player.eatCd=0;});const before=await m.evaluate(()=>countItem(G.player,'cookedFish'));
  const r=await m.evaluate(()=>invSlotRect(findFoodIdx(G.player)));await tap(m,await point(m,r.x+20,r.y+18));
  assert.equal(await m.evaluate(()=>G.player.hp),19);assert.equal(await m.evaluate(()=>countItem(G.player,'cookedFish')),before-1);
 });
 await check('pointer cancellation cannot eat a held inventory item',async()=>{
  await m.evaluate(()=>{G.player.hp=10;G.player.eatCd=0;});const r=await m.evaluate(()=>invSlotRect(findFoodIdx(G.player))),at=await point(m,r.x+20,r.y+18),before=await m.evaluate(()=>countItem(G.player,'cookedFish'));
  await dispatch(m,'pointerdown',401,at);await dispatch(m,'pointercancel',401,at);await dispatch(m,'pointerup',401,at);
  assert.equal(await m.evaluate(()=>G.player.hp),10);assert.equal(await m.evaluate(()=>countItem(G.player,'cookedFish')),before);assert.equal(await m.evaluate(()=>Controls.points.size),0);
 });
 await check('inventory touch-drag rearranges without equipping or consuming',async()=>{
  const source=await m.evaluate(()=>invSlotRect(G.player.inv.findIndex(s=>s&&s.id==='trailAxe'))),dest=await m.evaluate(()=>invSlotRect(27));
  const a=await point(m,source.x+20,source.y+18),b=await point(m,dest.x+20,dest.y+18);
  await dispatch(m,'pointerdown',411,a);await dispatch(m,'pointermove',411,b);await dispatch(m,'pointerup',411,b);
  assert.equal(await m.evaluate(()=>G.player.inv[27].id),'trailAxe');assert.equal(await m.evaluate(()=>countItem(G.player,'trailAxe')),1);
 });
 await check('long-press opens a tappable menu without activating the item',async()=>{
  await m.evaluate(()=>{G.player.hp=10;G.player.eatCd=0;});const r=await m.evaluate(()=>invSlotRect(findFoodIdx(G.player))),at=await point(m,r.x+20,r.y+18);
  const session=await m.context().newCDPSession(m);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:at.x,y:at.y,id:1}]});await m.waitForTimeout(600);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await m.locator('#client-context').waitFor({state:'visible'});
  assert.equal(await m.evaluate(()=>G.player.hp),10);await m.locator('#client-context button').filter({hasText:/^Cancel$/}).click();
  assert.equal(await m.locator('#client-context').isVisible(),false);await session.detach();
 });
 await check('real two-finger pinch changes zoom but issues no walk command',async()=>{
  const r=await m.evaluate(()=>Client.world),a={x:r.x+r.w*.4,y:r.y+r.h*.6},b={x:r.x+r.w*.6,y:r.y+r.h*.6};
  const session=await m.context().newCDPSession(m),dist=await m.evaluate(()=>App.cam.dist);
  await m.evaluate(()=>{G.player.path=[];G.player.target=null;});
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1},{...b,id:2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x-25,y:a.y,id:1},{x:b.x+25,y:b.y,id:2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await m.evaluate(()=>App.cam.dist)<dist);assert.equal(await m.evaluate(()=>G.player.path.length),0);assert.equal(await m.evaluate(()=>Controls.points.size),0);await session.detach();
 });
 await check('one-finger world drag rotates the camera without walking',async()=>{
  const r=await m.evaluate(()=>Client.world),a={x:r.x+r.w*.4,y:r.y+r.h*.5},b={x:a.x+70,y:a.y+24};
  const before=await m.evaluate(()=>App.cam.yaw);await dispatch(m,'pointerdown',441,a);await dispatch(m,'pointermove',441,b);await dispatch(m,'pointerup',441,b);
  assert.ok(Math.abs(await m.evaluate(()=>App.cam.yaw)-before)>.1);assert.equal(await m.evaluate(()=>G.player.path.length),0);
 });
 await check('a second finger cannot accidentally click a combat or item panel',async()=>{
  const r=await m.evaluate(()=>Client.world),a={x:r.x+r.w*.4,y:r.y+r.h*.5};const slot=await m.evaluate(()=>invSlotRect(findFoodIdx(G.player))),b=await point(m,slot.x+20,slot.y+18);
  const before=await m.evaluate(()=>G.player.hp);await dispatch(m,'pointerdown',451,a);await dispatch(m,'pointerdown',452,b,false);await dispatch(m,'pointerup',452,b,false);await dispatch(m,'pointerup',451,a);
  assert.equal(await m.evaluate(()=>G.player.hp),before);assert.equal(await m.evaluate(()=>Controls.points.size),0);
 });
 await check('reduced motion suppresses added particles',async()=>{
  const count=await m.evaluate(()=>{Profiles.settings.reduceMotion=true;Polish.configure();Polish.burst(48,34,0xffffff,40);return Polish.particles.length;});assert.equal(count,0);
  await m.evaluate(()=>{Profiles.settings.reduceMotion=false;Polish.configure();});
 });
 await screenshot(m,'touch-expedition');
 await check('landscape touch layout retains visible world and inventory',async()=>{
  await m.setViewportSize({width:839,height:412});await m.waitForTimeout(200);
  const bounds=await m.evaluate(()=>({w:innerWidth,world:Client.world,panel:Client.panelRect,footer:Client.L.bottom.y,aspect:App.cam.aspect}));
  for(const r of [bounds.world,bounds.panel])assert.ok(r.x>=0&&r.x+r.w<=bounds.w+1&&r.y+r.h<=bounds.footer+1);
  assert.ok(Math.abs(bounds.aspect-bounds.world.w/bounds.world.h)<.001);await screenshot(m,'touch-landscape');
 });
 await check('a small phone viewport does not clip the right-hand inventory',async()=>{
  await m.setViewportSize({width:320,height:568});await m.waitForTimeout(180);const b=await m.evaluate(()=>({panel:Client.panelRect,width:innerWidth}));assert.ok(b.panel.x+b.panel.w<=b.width+1);
 });
 await check('mode switches remove old expedition collision and actors cleanly',async()=>{
  const counts=await m.evaluate(()=>{const values=[];for(let i=0;i<4;i++){startGame('SwitchQA','arena');startGame('SwitchQA','expedition');values.push([G.actors.length,Expedition.nodes.length,WORLD.objs.filter(o=>o.expedition).length]);}return values;});
  assert.ok(counts.every(v=>JSON.stringify(v)==='[13,10,10]'));
 });
 assert.deepEqual(touch.errors,[]);await touch.context.close();

 await check('WebGL context loss saves and presents a recovery action',async()=>{
  const c=await create({viewport:{width:1024,height:768}});
  const available=await c.page.evaluate(()=>{const ext=App.R.gl.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;});
  assert.equal(available,true);await c.page.waitForFunction(()=>App.contextLost);
  assert.equal(await c.page.getByRole('button',{name:'Reload renderer'}).count(),1);
  assert.equal(await c.page.evaluate(()=>Profiles.read()!==null),true);await c.context.close();
 });
 fs.writeFileSync(path.join(root,'qa','browser-results.json'),JSON.stringify({engine:'Chromium / Playwright',physicalDevice:false,tests:results.length,results},null,2)+'\n');
 console.log('BROWSER_TESTS_PASSED='+results.length);
}
main().catch(err=>{console.error(err);fs.mkdirSync(path.join(root,'qa'),{recursive:true});fs.writeFileSync(path.join(root,'qa','browser-failure.json'),JSON.stringify({error:String(err.stack||err),passed:results},null,2));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.close();});
