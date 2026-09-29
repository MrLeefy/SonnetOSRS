'use strict';
/* Classic presentation QA. All game actions go through the existing engine.
 * The real WebGL renderer is used. Touch is emulated, not a physical handset. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium,devices}=require('playwright');
const root=path.resolve(__dirname,'..'),results=[];let browser,server,base;
async function check(name,fn){await fn();results.push({name,passed:true});console.log('PASS '+name);}
async function screen(page,name){await page.screenshot({path:path.join(root,'qa','classic-'+name+'.png')});}
async function point(page,x,y){return page.evaluate(([x,y])=>Client.fromGame(x,y),[x,y]);}
async function slot(page,i){return page.evaluate(i=>{const r=Client.L.slots[i];return{x:r.x+r.w/2,y:r.y+r.h/2};},i);}
async function launch(options){const context=await browser.newContext(options),page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));await page.goto(base+'/?auto=1&mode=expedition&profile=ClassicQA');await page.waitForFunction(()=>typeof App!=='undefined'&&(App.mode==='game'||App.error));assert.equal(await page.evaluate(()=>App.error&&App.error.message),null);await page.waitForTimeout(150);return{context,page,errors,requests};}
async function main(){
 fs.mkdirSync(path.join(root,'qa'),{recursive:true});
 server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.join(root,'dist/index.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 await check('core gameplay and gesture-state modules remain byte-for-byte unchanged',async()=>{
  const expected={'game.js':'cf44a1e59e192f931cfd45f917f89e090dbbbb51','expedition.js':'32548e2fde019e4ceee0a0921d837d6ec3d25f3a','controls.js':'e889f298d8aabc6ad246330e947e0334c2607078','ai.js':'22306fad7538f117a955886b98242ca5fd911dc0','items.js':'bd058a126a7c02b44baad4f8f0c3d2298f393986','world.js':'61dbc8187b0c33f9ce29457dff3562cc4af146a2'};
  for(const[name,sha]of Object.entries(expected)){const data=fs.readFileSync(path.join(root,'src',name)),hash=crypto.createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');assert.equal(hash,sha,name);}
 });
 const d=await launch({viewport:{width:1536,height:756}}),p=d.page;
 await check('reference composition has a left world/chat and a complete right minimap/panel',async()=>{
  const l=await p.evaluate(()=>Client.L);assert.ok(l.world.w/1536>.69&&l.world.w/1536<.74);assert.ok(l.world.h/756>.63&&l.world.h/756<.69);assert.ok(l.map.x>l.world.x+l.world.w);assert.ok(l.chat.y>l.world.y+l.world.h);assert.equal(l.slots.length,28);assert.equal(l.tabs.length,14);
  assert.equal(await p.evaluate(()=>getComputedStyle(Client.bar).backgroundColor),'rgba(0, 0, 0, 0)');
 });
 await check('layout and inventory hit regions roundtrip across ten desktop/mobile dimensions',async()=>{
  for(const [width,height]of [[1536,756],[1920,1080],[1280,800],[1024,768],[839,412],[740,360],[568,320],[412,839],[360,640],[320,568]]){
   await p.setViewportSize({width,height});await p.waitForTimeout(60);
   const out=await p.evaluate(()=>{UI.tab=3;const errors=[];for(let i=0;i<28;i++){const r=invSlotRect(i),x=r.x+r.w/2,y=r.y+r.h/2,screen=Client.fromGame(x,y),back=Client.toGame(screen.x,screen.y);if(Math.abs(x-back.x)>.01||Math.abs(y-back.y)>.01)errors.push(i);}
    for(const r of [Client.L.world,Client.L.chat,Client.L.panel,...Client.L.tabs,...Client.L.slots])if(r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>innerWidth+1||r.y+r.h>innerHeight+1)errors.push('bounds');return errors;});assert.deepEqual(out,[],width+'x'+height);
  }
  await p.setViewportSize({width:1536,height:756});await p.waitForTimeout(80);
 });
 await check('simulated notch and bottom safe-area padding keeps every slot inside safe bounds',async()=>{
  const result=await p.evaluate(()=>{Client.safeProbe.style.padding='18px 26px 22px 30px';Client.layout();const out=[Client.L.world,Client.L.chat,Client.L.panel,...Client.L.slots].every(r=>r.x>=30&&r.y>=18&&r.x+r.w<=innerWidth-26+1&&r.y+r.h<=innerHeight-22+1);Client.safeProbe.style.padding='0px';Client.layout();return out;});assert.equal(result,true);
 });
 await check('round minimap tap routes to existing pathfinding and compass resets yaw',async()=>{
  await p.evaluate(()=>{G.player.x=48;G.player.y=34;G.player.path=[];G.player.seg=[];G.player.runOn=false;App.cam.yaw=0;Polish.snapCamera=true;});
  const at=await p.evaluate(()=>({x:Client.L.mapCircle.x+8*Client.L.mapTransform.s,y:Client.L.mapCircle.y}));await p.mouse.click(at.x,at.y);
  const a=await p.evaluate(()=>({x:G.player.x,y:G.player.y,last:G.player.path.at(-1)}));assert.ok(a.x===50||a.last&&a.last.x===50);assert.ok(a.y===34);
  await p.evaluate(()=>App.cam.yaw=1.3);await p.getByRole('button',{name:'Face north',exact:true}).click();assert.ok(Math.abs(await p.evaluate(()=>App.cam.yaw))<.001);
 });
 await check('all functional game panels can be selected with their classic tab buttons',async()=>{
  for(const i of [0,1,3,4,5,6,7,8,9,12,13]){await p.locator('[data-tab="'+i+'"]').click();assert.equal(await p.evaluate(()=>UI.tab),i);assert.equal(await p.evaluate(()=>Client.panel),null);}
  await p.locator('[data-tab="2"]').click();assert.equal(await p.evaluate(()=>Client.panel),'journal');await p.keyboard.press('Escape');
  await p.locator('[data-tab="11"]').click();assert.equal(await p.evaluate(()=>Client.panel),'menu');await p.keyboard.press('Escape');
 });
 await check('prayer, spell selection and worn-equipment actions use the original handlers',async()=>{
  await p.evaluate(()=>{G.player.target=null;G.player.path=[];G.player.pp=10;UI.tab=5;});
  const pr=await p.evaluate(()=>PR_POS(PR_ORDER.indexOf('thick')));const q=await point(p,pr.x+pr.w/2,pr.y+pr.h/2);await p.mouse.click(q.x,q.y);assert.equal(await p.evaluate(()=>G.player.prayers.has('thick')),true);
  await p.evaluate(()=>UI.tab=6);const sp=await p.evaluate(()=>SP_POS(SPELLS.findIndex(s=>s.id==='frostDart')));const r=await point(p,sp.x+sp.w/2,sp.y+sp.h/2);await p.mouse.click(r.x,r.y);assert.equal(await p.evaluate(()=>G.spellSel),'frostDart');
  await p.evaluate(()=>{G.spellSel=null;UI.tab=4;});const eq=await p.evaluate(()=>eqSlotRect('weapon'));const e=await point(p,eq.x+eq.w/2,eq.y+eq.h/2);await p.mouse.click(e.x,e.y);assert.equal(await p.evaluate(()=>G.player.eq.weapon),null);assert.equal(await p.evaluate(()=>countItem(G.player,'bronzeBlade')),1);
 });
 await check('desktop right-click menu is readable, selectable and not double-rendered',async()=>{
  await p.evaluate(()=>{UI.tab=3;UI.menu=null;});const i=await p.evaluate(()=>G.player.inv.findIndex(s=>s&&s.id==='bronzeBlade')),at=await slot(p,i);await p.mouse.click(at.x,at.y,{button:'right'});await p.locator('#client-context').waitFor({state:'visible'});
  assert.equal(await p.locator('#client-context strong').textContent(),'Choose Option');await p.getByRole('menuitem',{name:/^Wield/}).click();assert.equal(await p.evaluate(()=>G.player.eq.weapon.id),'bronzeBlade');assert.equal(await p.evaluate(()=>UI.menu),null);
 });
 await check('parchment channels filter real messages and long messages wrap within the chat width',async()=>{
  await p.evaluate(()=>{G.msgs=[];gameMsg('Engine message');publicMsg('Tester','A public message',true);gameMsg('X'.repeat(500));Client.chatCache=null;});
  await p.getByRole('button',{name:'Public',exact:true}).click();const a=await p.evaluate(()=>Client.chatLines(Client.L.chat.w-43,17).flat().map(s=>s.t).join(''));assert.ok(a.includes('public message'));assert.ok(!a.includes('Engine message'));
  await p.getByRole('button',{name:'All',exact:true}).click();const sizes=await p.evaluate(()=>Client.chatLines(180,12).map(line=>line.reduce((n,s)=>n+textWidth('p11',s.t)*12/11,0)));assert.ok(sizes.every(n=>n<=180.1));
 });
 await check('chat scrollbar can reach older lines without the legacy eight-line clamp',async()=>{
  await p.evaluate(()=>{G.msgs=[];for(let i=0;i<70;i++)gameMsg('Line '+i);G.chatScroll=0;Client.chatCache=null;});
  await p.getByRole('button',{name:'Scroll chat up',exact:true}).click();assert.ok(await p.evaluate(()=>G.chatScroll)>=3);
  await p.evaluate(()=>G.chatScroll=999);await p.waitForTimeout(100);assert.ok(await p.evaluate(()=>G.chatScroll)>50);
 });
 await check('collapse/expand chat removes invisible scrollbar hit targets and preserves inventory mapping',async()=>{
  await p.locator('[data-tab="11"]').click();await p.getByRole('button',{name:'Collapse chat',exact:true}).click();assert.equal(await p.locator('#client-bar button[aria-label="Scroll chat up"]').count(),0);await p.keyboard.press('Escape');
  const before=await p.evaluate(()=>Client.L.world.h);await p.locator('[data-tab="11"]').click();await p.getByRole('button',{name:'Expand chat',exact:true}).click();await p.keyboard.press('Escape');assert.ok(await p.evaluate(()=>Client.L.world.h)<before);
 });
 await check('native chat, world map and themed bank/journal work without the old header',async()=>{
  await p.getByRole('button',{name:'Type a chat message',exact:true}).click();await p.getByRole('textbox',{name:'Chat message',exact:true}).fill('Hello from the classic client');await p.getByRole('button',{name:'Send',exact:true}).click();assert.equal(await p.evaluate(()=>G.msgs.at(-1).text),'Hello from the classic client');
  await p.getByRole('button',{name:'World map',exact:true}).click();assert.equal(await p.locator('#client-panel canvas').count(),1);await p.keyboard.press('Escape');
  await p.evaluate(()=>{const b=WORLD.objs.find(o=>o.kind==='bank');G.player.x=b.x-1;G.player.y=b.y;G.player.lastHitTick=-999;G.player.target=null;G.player.path=[];G.player.seg=[];});
  await p.getByRole('button',{name:'Bank',exact:true}).click();await p.waitForFunction(()=>Client.panel==='bank');await screen(p,'bank');await p.keyboard.press('Escape');
  await p.locator('[data-tab="2"]').click();await screen(p,'journal');await p.keyboard.press('Escape');
 });
 await check('report panel exports a local file and makes no false online-report claim',async()=>{
  await p.getByRole('button',{name:'Report Abuse',exact:true}).click();assert.ok((await p.locator('#client-panel').innerText()).includes('nothing will be sent'));
  await p.getByRole('textbox',{name:'Problem description'}).fill('UI QA report');const download=p.waitForEvent('download');await p.getByRole('button',{name:'Export local report',exact:true}).click();const file=await download;assert.equal(file.suggestedFilename(),'SonnetOSRS-report.txt');await p.keyboard.press('Escape');
 });
 await check('UI art is generated locally without fetching mockups, fonts or remote sprites',async()=>{assert.ok(d.requests.every(url=>url.startsWith(base)));});
 await p.evaluate(()=>{startGame('ClassicPreview','expedition');G.player.x=48;G.player.y=34;Polish.snapCamera=true;gameMsg('Welcome to the Grand Exchange.');gameMsg('Your items, bank and contracts are ready.');UI.tab=3;});await p.waitForTimeout(180);const food=await p.evaluate(()=>findFoodIdx(G.player)),at=await slot(p,food);await p.mouse.move(at.x,at.y);await p.waitForTimeout(80);await screen(p,'desktop');
 assert.deepEqual(d.errors,[]);await d.context.close();
 const t=await launch({...devices['Pixel 7'],viewport:{width:839,height:412},deviceScaleFactor:1}),m=t.page;
 await check('landscape touch keeps the actual minimap, chat and inventory visible together',async()=>{const s=await m.evaluate(()=>({portrait:Client.L.portrait,chat:Client.L.chat.h,map:Client.L.map.h,slots:Client.L.slots.length}));assert.equal(s.portrait,false);assert.ok(s.chat>70&&s.map>90);assert.equal(s.slots,28);});
 await check('touch menu selection still consumes once after the presentation refactor',async()=>{
  await m.evaluate(()=>{G.player.hp=10;G.player.eatCd=0;});const i=await m.evaluate(()=>findFoodIdx(G.player)),at=await slot(m,i),before=await m.evaluate(()=>countItem(G.player,'cookedFish'));
  const cdp=await m.context().newCDPSession(m);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...at,id:1}]});await m.waitForTimeout(560);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await m.locator('#client-context').waitFor({state:'visible'});assert.equal(await m.evaluate(()=>G.player.hp),10);await m.getByRole('menuitem',{name:/^Eat/}).tap();assert.equal(await m.evaluate(()=>G.player.hp),19);assert.equal(await m.evaluate(()=>countItem(G.player,'cookedFish')),before-1);await cdp.detach();
 });
 await screen(m,'landscape');
 await check('rotation during an inventory drag cancels without losing or activating the item',async()=>{
  const i=await m.evaluate(()=>G.player.inv.findIndex(s=>s&&s.id==='trailAxe')),at=await slot(m,i);const before=await m.evaluate(()=>JSON.stringify(G.player.inv));
  await m.evaluate(at=>Client.surface.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:700,pointerType:'touch',clientX:at.x,clientY:at.y,button:0,buttons:1})),at);
  await m.setViewportSize({width:412,height:839});await m.waitForTimeout(120);
  await m.evaluate(at=>window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:700,pointerType:'touch',clientX:at.x,clientY:at.y,button:0,buttons:0})),at);
  assert.equal(await m.evaluate(()=>JSON.stringify(G.player.inv)),before);assert.equal(await m.evaluate(()=>Controls.points.size),0);
 });
 await check('portrait quick actions preserve food, potion, run, save and settings access',async()=>{
  for(const name of ['Eat','Potion','Run','Special','Save','Chat','Full screen'])assert.equal(await m.getByRole('button',{name,exact:true}).count(),1);
  const before=await m.evaluate(()=>G.player.runOn);await m.getByRole('button',{name:'Run',exact:true}).tap();assert.equal(await m.evaluate(()=>G.player.runOn),!before);
  await m.getByRole('button',{name:'Save',exact:true}).tap();assert.ok(await m.evaluate(()=>Profiles.read()!==null));
 });
 await check('touch context menu remains wholly within the portrait viewport',async()=>{
  const i=await m.evaluate(()=>findFoodIdx(G.player)),at=await slot(m,i);await m.evaluate(at=>{UI.mouse=clientPos({clientX:at.x,clientY:at.y});openMenu(itemMenu(G.player,findFoodIdx(G.player)),UI.mouse.x,UI.mouse.y);},at);await m.waitForTimeout(80);
  const r=await m.locator('#client-context').boundingBox(),v=m.viewportSize();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=v.width+1&&r.y+r.height<=v.height+1);await m.getByRole('menuitem',{name:'Cancel',exact:true}).tap();
 });
 await screen(m,'portrait');assert.deepEqual(t.errors,[]);await t.context.close();
 fs.writeFileSync(path.join(root,'qa','classic-ui-results.json'),JSON.stringify({tests:results.length,renderer:'actual WebGL in Chromium',physicalDevice:false,results},null,2)+'\n');console.log('CLASSIC_UI_TESTS_PASSED='+results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.close();});
