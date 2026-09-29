/* Deterministic regression tests against the actual global-script modules. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const context=vm.createContext({console,assert,setTimeout,clearTimeout,performance:{now:()=>1000},window:{confirm:()=>true},document:{hidden:false},devicePixelRatio:1,URL,Blob});
for(const name of ['core','gfx','gl','items','world','game','ai','models','uiicons','ui','input','sound','engine_ext','expedition','profiles','client','controls','polish'])vm.runInContext(fs.readFileSync(path.join(root,'src',name+'.js'),'utf8'),context,{filename:name+'.js'});
vm.runInContext(`
const App={mode:'game',cam:null,scale:1,glCanvas:null};
sfx=()=>{};Client.open=()=>{};
class MemoryStorage{constructor(){this.m=new Map();}getItem(k){return this.m.has(k)?this.m.get(k):null;}setItem(k,v){this.m.set(k,String(v));}removeItem(k){this.m.delete(k);}}
let passed=0;
function test(name,fn){try{reset();fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}}
function reset(){
 WORLD.block.fill(0);WORLD.th.fill(0);WORLD.mm.fill(0);WORLD.layer.fill(-1);WORLD.objs=[];WORLD.trees=[];LOSB.fill(0);
 Object.assign(G,{actors:[],player:null,ground:[],projs:[],effects:[],msgs:[],hitQ:[],dialog:null,tick:0,now:0,lastTick:0,nextId:1,kills:0,deaths:0,streak:0,best:0,dmgDealt:0,dmgTaken:0});
 Object.assign(Expedition,{active:false,xp:{},progress:{},claimed:{},bank:[],nodes:[],warnings:[],gather:null,pvmKills:0});
 UI.drag=null;UI.menu=null;UI.botCount=0;Profiles.storage=new MemoryStorage();Profiles.select('Tester','arena');Profiles.status='';
 Math.random=mulberry32(7731);Polish.particles=[];
}
function actor(player=true,x=10,y=10){const a=newActor({name:player?'Tester':'Enemy',isPlayer:player,x,y});G.actors.push(a);if(player)G.player=a;return a;}
function snap(a){return JSON.stringify({inv:a.inv,eq:a.eq});}
function full(a,id='shark'){a.inv=Array.from({length:28},()=>({id,n:1}));}
function bank(){const a=actor();WORLD.objs.push({kind:'bank',x:10,y:11});return a;}
function exp(){const a=actor();Profiles.select('Tester','expedition');Expedition.begin('expedition');return a;}
function moveToStation(a,station){const o=Expedition.nodes.find(o=>o.station===station);a.x=o.x-1;a.y=o.y;a.lastHitTick=-999;a.target=null;return o;}
function advance(t){G.tick+=t;G.now+=t*600;Expedition.tick();}

test('non-stack insertion is atomic when inventory is full',()=>{const a=actor();full(a);a.inv[0]=null;const before=snap(a);assert.equal(addItem(a,'bones',2),false);assert.equal(snap(a),before);});
test('all invalid quantities are rejected',()=>{const a=actor();for(const n of [0,-1,1.5,NaN,Infinity,'3',2147483648])assert.equal(addItem(a,'coins',n),false);assert.equal(a.inv.filter(Boolean).length,0);});
test('unknown and prototype item names are rejected',()=>{const a=actor();for(const id of ['nope','__proto__','constructor'])assert.equal(addItem(a,id,1),false);});
test('stack overflow preserves the previous amount',()=>{const a=actor();addItem(a,'coins',Engine.MAX_STACK);assert.equal(addItem(a,'coins',1),false);assert.equal(countItem(a,'coins'),Engine.MAX_STACK);});
test('stack merges into a completely full inventory',()=>{const a=actor();full(a);a.inv[0]={id:'coins',n:7};assert.equal(addItem(a,'coins',11),true);assert.equal(a.inv[0].n,18);});
test('remove is all-or-nothing',()=>{const a=actor();addItem(a,'bones',2);const s=snap(a);assert.equal(removeItem(a,'bones',3),false);assert.equal(snap(a),s);assert.equal(removeItem(a,'bones',2),true);assert.equal(countItem(a,'bones'),0);});
test('potions preserve their doses and reject impossible doses',()=>{const a=actor();assert.equal(addItem(a,'brew',2),true);assert.equal(a.inv[0].n,2);assert.equal(addItem(a,'brew',5),false);});
test('two-handed equip cannot lose gear with 28 full slots',()=>{const a=actor();full(a);a.inv[0]={id:'ags',n:1};a.eq={weapon:{id:'whip',n:1},shield:{id:'rkite',n:1}};const s=snap(a);assert.equal(equipFromInv(a,0),false);assert.equal(snap(a),s);assert.equal(Object.hasOwn(a.inv,'-1'),false);});
test('two-handed equip succeeds with room for both displaced items',()=>{const a=actor();full(a);a.inv[0]={id:'ags',n:1};a.inv[27]=null;a.eq={weapon:{id:'whip',n:1},shield:{id:'rkite',n:1}};assert.equal(equipFromInv(a,0),true);assert.equal(a.eq.weapon.id,'ags');assert.equal(a.eq.shield,null);assert.equal(countItem(a,'whip'),1);assert.equal(countItem(a,'rkite'),1);});
test('equipping shield returns the two-handed weapon once',()=>{const a=actor();full(a);a.inv[0]={id:'rkite',n:1};a.eq={weapon:{id:'ags',n:1}};assert.equal(equipFromInv(a,0),true);assert.equal(a.eq.weapon,null);assert.equal(countItem(a,'ags'),1);});
test('ammo equip overflow rolls back',()=>{const a=actor();a.eq.ammo={id:'rarrows',n:Engine.MAX_STACK};addItem(a,'rarrows',1);const s=snap(a);assert.equal(equipFromInv(a,0),false);assert.equal(snap(a),s);});
test('unequip with full bag cannot lose equipment',()=>{const a=actor();full(a);a.eq.weapon={id:'whip',n:1};const s=snap(a);assert.equal(unequipSlot(a,'weapon'),false);assert.equal(snap(a),s);});
test('unequipping ammo can merge into an existing full-bag stack',()=>{const a=actor();full(a);a.inv[3]={id:'rarrows',n:2};a.eq.ammo={id:'rarrows',n:8};assert.equal(unequipSlot(a,'ammo'),true);assert.equal(a.inv[3].n,10);});
test('invalid consume actions do not destroy gear',()=>{const a=actor();addItem(a,'whip');const s=snap(a);assert.equal(eatFood(a,0),false);assert.equal(drinkPotion(a,0),false);assert.equal(snap(a),s);});
test('dead characters cannot consume or equip',()=>{const a=actor();addItem(a,'shark');addItem(a,'brew',4);addItem(a,'whip');a.dead=true;const s=snap(a);assert.equal(eatFood(a,0),false);assert.equal(drinkPotion(a,1),false);assert.equal(equipFromInv(a,2),false);assert.equal(snap(a),s);});
test('stale context menu cannot drop a replacement item',()=>{const a=actor();addItem(a,'shark');const m=itemMenu(a,0),drop=m.find(e=>e.text.startsWith('Drop'));a.inv[0]={id:'whip',n:1};drop.fn();assert.equal(a.inv[0].id,'whip');assert.equal(G.ground.length,0);});
test('invalid prayer IDs are ignored',()=>{const a=actor();assert.equal(togglePrayer(a,'__proto__'),false);assert.equal(a.prayers.size,0);});
test('invalid combat styles fall back safely',()=>{const a=actor();a.style=-500;assert.equal(styleOf(a).n,'Punch');a.style=NaN;assert.equal(styleOf(a).n,'Punch');});
test('tile lookup rejects invalid coordinates',()=>{for(const pair of [[-1,0],[96,0],[2.5,3],[NaN,0]])assert.equal(passable(...pair),false);});
test('diagonal movement cannot cut a blocked corner',()=>{WORLD.block[10*96+11]=1;assert.equal(canStep(10,10,1,1),false);});
test('movement cannot teleport through injected paths',()=>{const a=actor();a.path=[{x:20,y:10}];assert.equal(moveAlong(a),0);assert.equal(a.x,10);});
test('pathfinding invalid start returns null',()=>{assert.equal(findPath(-1,0,()=>true),null);});
test('BFS paths obey adjacency and obstacles',()=>{for(let y=8;y<13;y++)WORLD.block[y*96+12]=1;const p=findPath(10,10,(x,y)=>x===15&&y===10,{x:15,y:10},3000);assert.ok(p&&p.length);let x=10,y=10;for(const n of p){assert.equal(canStep(x,y,n.x-x,n.y-y),true);x=n.x;y=n.y;}assert.equal(x,15);assert.equal(y,10);});
test('pathfinding stamp rollover is safe',()=>{PF.stamp=2147483646;assert.ok(findPath(1,1,(x,y)=>x===2&&y===1));assert.equal(PF.stamp,1);});
test('line of sight blocks diagonal corner shots',()=>{LOSB[10*96+11]=1;assert.equal(hasLoS(10,10,11,11),false);assert.equal(hasLoS(-1,0,2,2),false);assert.equal(hasLoS(2,2,2,2),true);});
test('delayed hits cannot damage a new actor life',()=>{const a=actor(),b=actor(false,11,10);queueHit({src:a,dst:b,dmg:12,type:'pmelee',delay:2});const h=G.hitQ[0];b.life++;applyHit(h);assert.equal(b.hp,99);});
test('removed actors cannot deliver queued damage',()=>{const a=actor(),b=actor(false,11,10);G.actors.splice(G.actors.indexOf(a),1);applyHit({src:a,dst:b,dmg:12,type:'pmelee'});assert.equal(b.hp,99);});
test('spawn protection is enforced at hit resolution',()=>{const a=actor(false,11,10),b=actor();b.protectUntil=25;applyHit({src:a,dst:b,dmg:20,type:'pmelee'});assert.equal(b.hp,99);});
test('attacking forfeits spawn protection',()=>{const a=actor(),b=actor(false,11,10);a.protectUntil=25;doAttack(a,b);assert.equal(a.protectUntil,0);});
test('single-arrow ranged special cannot create a second projectile',()=>{const a=actor(),b=actor(false,12,10);a.eq={weapon:{id:'msb',n:1},ammo:{id:'rarrows',n:1}};recalcBonus(a);a.specOn=true;doAttack(a,b);assert.equal(a.spec,100);assert.equal(a.eq.ammo,null);assert.equal(G.hitQ.length,1);});
test('blood projectiles cannot revive a dead caster',()=>{const a=actor(),b=actor(false,11,10);a.dead=true;a.hp=0;applyHit({src:a,dst:b,dmg:20,type:'pmagic',spell:{kind:'blood'},splash:false});assert.equal(a.hp,0);assert.equal(a.dead,true);});
test('kill accounting is idempotent',()=>{const a=actor(),b=actor(false,11,10);killActor(b,a);killActor(b,a);assert.equal(G.kills,1);});
test('bank deposit preserves 2-dose and 4-dose potions separately',()=>{const a=bank();addItem(a,'brew',2);addItem(a,'brew',4);addItem(a,'coins',123);assert.equal(Expedition.deposit(0,true),true);assert.equal(Expedition.bank.length,3);assert.equal(Expedition.bank[0].n,2);assert.equal(Expedition.bank[1].n,4);assert.equal(a.inv.filter(Boolean).length,0);});
test('bank withdrawal keeps potion doses',()=>{const a=bank();Expedition.bank=[{id:'brew',n:2,qty:2}];assert.equal(Expedition.withdraw(0,2),true);assert.equal(a.inv[0].n,2);assert.equal(a.inv[1].n,2);assert.equal(Expedition.bank.length,0);});
test('full-bag withdrawal rolls back the bank',()=>{const a=bank();full(a);Expedition.bank=[{id:'brew',n:2,qty:2}];const b=JSON.stringify(Expedition.bank);assert.equal(Expedition.withdraw(0,'all'),false);assert.equal(JSON.stringify(Expedition.bank),b);});
test('full-bank deposit is atomic',()=>{const a=bank();addItem(a,'coins',123);Expedition.bank=Array.from({length:120},()=>({id:'shark',n:1,qty:1}));assert.equal(Expedition.deposit(0),false);assert.equal(countItem(a,'coins'),123);});
test('banking is denied remotely and during combat',()=>{const a=bank();addItem(a,'coins',123);a.x=80;assert.equal(Expedition.deposit(0),false);a.x=10;a.lastHitTick=0;assert.equal(Expedition.deposit(0),false);});
test('XP thresholds roundtrip every supported level',()=>{for(let l=1;l<=99;l++)assert.equal(Expedition.levelFor(Expedition.xpFor(l)),l);});
test('expedition provides nodes, enemies and a valid starter profile',()=>{const a=exp();assert.equal(Expedition.nodes.length,10);assert.equal(G.actors.filter(a=>a.monster).length,6);assert.equal(a.stats.hp,30);assert.equal(Profiles.capture().mode,'expedition');});
test('safe camp rejects combat both ways',()=>{const a=exp(),b=G.actors.find(a=>a.monster);assert.equal(Expedition.canFight(a,b),false);assert.equal(Expedition.canFight(b,a),false);});
test('gathering grants an item and XP after four ticks',()=>{const a=exp(),o=Expedition.nodes.find(o=>o.skill==='mining');a.x=o.x-1;a.y=o.y;Expedition.interact(o);advance(4);assert.equal(countItem(a,'ironOre'),1);assert.equal(Expedition.xp.mining,25);assert.equal(o.charges,2);});
test('gathering stops without rewards on a full inventory',()=>{const a=exp(),o=Expedition.nodes.find(o=>o.skill==='mining');a.x=o.x-1;a.y=o.y;full(a);a.inv[0]={id:'trailPick',n:1};Expedition.interact(o);advance(4);assert.equal(Expedition.xp.mining,0);assert.equal(o.charges,3);assert.equal(Expedition.gather,null);});
test('walking cancels gathering',()=>{const a=exp(),o=Expedition.nodes.find(o=>o.skill==='mining');a.x=o.x-1;a.y=o.y;Expedition.interact(o);cmdWalk(a.x-1,a.y);assert.equal(Expedition.gather,null);});
test('depleted nodes recover on their timer',()=>{const a=exp(),o=Expedition.nodes.find(o=>o.skill==='mining');a.x=o.x-1;a.y=o.y;Expedition.interact(o);advance(4);advance(4);advance(4);assert.equal(o.charges,0);assert.equal(Expedition.gather,null);advance(30);assert.equal(o.charges,3);});
test('crafting missing ingredients changes nothing',()=>{const a=exp();moveToStation(a,'forge');const s=snap(a);assert.equal(Expedition.craft('blade'),false);assert.equal(snap(a),s);});
test('smithing consumes the complete recipe and grants output',()=>{const a=exp();moveToStation(a,'forge');a.inv=new Array(28).fill(null);addItem(a,'ironOre',2);assert.equal(Expedition.craft('bar'),true);assert.equal(countItem(a,'ironOre'),0);assert.equal(countItem(a,'ironBar'),1);assert.equal(Expedition.xp.smithing,45);});
test('contract rewards cannot be claimed twice',()=>{const a=exp();Expedition.progress.ore=6;assert.equal(Expedition.claim('ore'),true);const n=countItem(a,'coins');assert.equal(Expedition.claim('ore'),false);assert.equal(countItem(a,'coins'),n);});
test('full inventory leaves a completed contract unclaimed',()=>{const a=exp();Expedition.progress.ore=6;full(a);assert.equal(Expedition.claim('ore'),false);assert.ok(!Expedition.claimed.ore);});
test('merchant refuses invented pricing',()=>{bank();assert.equal(Expedition.buy('ancstaff',1,1),false);});
test('boss telegraph resolves once and can be dodged',()=>{const a=exp(),b=G.actors.find(a=>a.monster==='guardian');a.x=b.x;a.y=b.y-1;b.nextSlam=0;Expedition.think(b);assert.equal(Expedition.warnings.length,1);a.x-=4;advance(3);assert.equal(a.hp,30);assert.equal(Expedition.warnings.length,0);});
test('boss telegraph cannot survive a new source lifetime',()=>{const a=exp(),b=G.actors.find(a=>a.monster==='guardian');a.x=b.x;a.y=b.y-1;b.nextSlam=0;Expedition.think(b);b.life++;advance(3);assert.equal(a.hp,30);});
test('expedition respawn keeps carried gear and clears combat state',()=>{const a=exp();addItem(a,'guardianSigil',1);a.dead=true;a.hp=0;a.prayerBlock=100;a.follow=G.actors.find(a=>a.monster);respawn(a);assert.equal(countItem(a,'guardianSigil'),1);assert.equal(a.hp,30);assert.equal(a.prayerBlock,0);assert.equal(a.follow,null);assert.equal(a.x,48);});
test('profile roundtrip preserves items, bank and progression',()=>{const a=exp();a.x=48;a.y=34;Expedition.bank=[{id:'brew',n:2,qty:3}];Expedition.addXp('mining',180);const d=Profiles.capture();a.inv=new Array(28).fill(null);Profiles.apply(d);assert.equal(countItem(a,'trailPick'),1);assert.equal(Expedition.bank[0].n,2);assert.equal(Expedition.xp.mining,180);});
test('invalid profile item is rejected before changing current state',()=>{const a=exp(),d=Profiles.capture(),s=snap(a);d.player.inv[0]={id:'__proto__',n:1};assert.throws(()=>Profiles.apply(d));assert.equal(snap(a),s);});
test('XP/stat mismatches are rejected',()=>{exp();const d=Profiles.capture();d.player.stats.atk=99;assert.throws(()=>Profiles.validate(d));});
test('foreign mode imports are refused',()=>{actor();const d=Profiles.capture();Profiles.mode='expedition';assert.throws(()=>Profiles.apply(d));});
test('future save versions are refused without silent downgrade',()=>{actor();const d=Profiles.capture();d.version=999;assert.throws(()=>Profiles.validate(d));});
test('valid previous backup recovers a corrupt main save',()=>{exp();assert.equal(Profiles.save(),true);assert.equal(Profiles.save(),true);Profiles.storage.setItem(Profiles.key(),'broken');const d=Profiles.read();assert.ok(d);assert.ok(Profiles.status.includes('Recovered'));});
test('fully corrupt saves are preserved and autosave is blocked',()=>{exp();Profiles.storage.setItem(Profiles.key(),'broken');assert.equal(Profiles.read(),null);assert.equal(Profiles.save(),false);assert.equal(Profiles.storage.getItem(Profiles.key()),'broken');});
test('unavailable localStorage does not throw out of save',()=>{actor();Profiles.storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};assert.equal(Profiles.save(),false);});
test('invalid inventory length and potion doses are rejected',()=>{exp();let d=Profiles.capture();d.player.inv.pop();assert.throws(()=>Profiles.validate(d));d=Profiles.capture();d.player.inv[0]={id:'brew',n:9};assert.throws(()=>Profiles.validate(d));});
test('dynamic vertex packing reuses capacity',()=>{const m=new Mesh('white'),r=Object.create(Renderer.prototype);m.box(null,0,0,0,1,1,1,0xffffff);const first=r.pack(m);const backing=m._packed;assert.equal(first.byteLength,m.count*24);r.pack(m);assert.equal(m._packed,backing);m.clear();m.tri([0,0,0],[1,0,0],[0,1,0],0xffffff);assert.equal(r.pack(m).byteLength,72);assert.equal(m._packed,backing);});
test('render interpolation reaches the exact endpoint',()=>{const a=actor();a.seg=[{fx:10,fy:10,tx:11,ty:10},{fx:11,fy:10,tx:11,ty:11}];assert.equal(JSON.stringify(renderPos(a,0)),JSON.stringify([10.5,10.5]));assert.equal(JSON.stringify(renderPos(a,1)),JSON.stringify([11.5,11.5]));});
test('camera projection and picking remain aligned at wide aspect',()=>{const cam=new Camera();cam.aspect=2.4;cam.tx=10;cam.ty=1;cam.tz=-10;cam.update();const p=cam.project(10,1,-10);assert.ok(Math.abs(p[0]-VW/2)<.001);assert.ok(Math.abs(p[1]-VH/2)<.001);const ray=cam.ray(...p);assert.ok(ray.d.every(Number.isFinite));});
test('PvM kills do not inflate Arena kill streak records',()=>{const a=exp(),b=G.actors.find(a=>a.monster);G.kills=4;G.streak=3;G.best=3;killActor(b,a);assert.equal(G.kills,4);assert.equal(G.streak,3);assert.equal(G.best,3);assert.equal(Expedition.pvmKills,1);});
console.log('RUNTIME_TESTS_PASSED='+passed);
`,context,{filename:'runtime-tests',timeout:30000});
