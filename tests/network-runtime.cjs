/* Fast deterministic checks of the real online adapters and touch helpers.
 * A fake WebSocket records outgoing intentions; no browser or server is used.
 * These complement, rather than replace, the Rust/browser integration suites.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({
  console, assert, setTimeout, clearTimeout,
  performance: {now: () => 1000},
  window: {confirm: () => true},
  document: {hidden: false, addEventListener() {}},
  WebSocket: {OPEN: 1}, devicePixelRatio: 1, URL, Blob,
});
// Keep the actual adapter order: engine fixes -> expedition -> network -> UI.
for (const name of ['core', 'gfx', 'gl', 'items', 'world', 'game', 'ai',
  'models', 'uiicons', 'ui', 'input', 'sound', 'engine_ext', 'expedition',
  'profiles', 'network', 'classic', 'client', 'mobile', 'controls', 'polish']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src', name + '.js'), 'utf8'),
    context, {filename: name + '.js'});
}
vm.runInContext(`
const App={mode:'game',cam:null,scale:1,glCanvas:null};
sfx=()=>{};
let opened=null,rendered=0,passed=0;
const failures=[],sent=[];
Client.open=page=>{opened=page;Client.panel=page;};
Client.renderPanel=()=>{rendered++;};
class MemoryStorage{
  constructor(){this.m=new Map();}
  getItem(k){return this.m.get(k)??null;}
  setItem(k,v){this.m.set(k,String(v));}
  removeItem(k){this.m.delete(k);}
}
function reset(){
  WORLD.block.fill(0);WORLD.th.fill(0);WORLD.mm.fill(0);WORLD.layer.fill(-1);
  WORLD.objs=[];WORLD.trees=[];LOSB.fill(0);
  Object.assign(G,{actors:[],player:null,ground:[],projs:[],effects:[],msgs:[],
    hitQ:[],dialog:null,spellSel:null,tick:0,now:0,lastTick:0,nextId:1,
    kills:0,deaths:0,streak:0,best:0,dmgDealt:0,dmgTaken:0});
  Object.assign(Expedition,{active:false,xp:{},progress:{},claimed:{},bank:[],
    nodes:[],warnings:[],gather:null,pvmKills:0});
  Profiles.storage=new MemoryStorage();Profiles.select('NetworkQA','arena');
  UI.drag=null;UI.menu=null;UI.botCount=0;UI.lastPrayers=[];UI.tab=3;
  Client.panel=null;opened=null;rendered=0;sent.length=0;
  const a=newActor({name:'NetworkQA',isPlayer:true,x:10,y:10});
  a.hp=20;a.lastHitTick=-999;a.inv=new Array(28).fill(null);
  G.player=a;G.actors=[a];
  Object.assign(Online,{active:true,connected:true,connecting:false,ready:true,
    manualClose:false,id:'self',zone:'safe',seq:0,lastTick:-1,pending:null,
    pendingPanel:null,job:null,remotes:new Map(),account:{bank:[],offers:[],catalog:[],equipment:{}},
    notices:new Map(),ws:{readyState:WebSocket.OPEN,send:raw=>sent.push(JSON.parse(raw))}});
  Mobile.page='inventory';Mobile.selection=null;Mobile.options=false;
  Math.random=mulberry32(7731);
  return a;
}
function test(name,fn){
  const a=reset();
  try{fn(a);passed++;console.log('PASS '+name);}
  catch(err){failures.push({name,error:err.message});console.error('FAIL '+name+' — '+err.message);}
}
function state(a){return JSON.stringify({inv:a.inv,eq:a.eq,hp:a.hp,pp:a.pp,
  spec:a.spec,run:a.run,cur:a.cur,eatCd:a.eatCd,potCd:a.potCd,atkCd:a.atkCd});}
function dropFor(a,i=0){return itemMenu(a,i).find(e=>stripTags(e.text).startsWith('Drop '));}
function account(inventory){Online.handle(JSON.stringify({type:'account_state',inventory,
  equipment:{weapon:{id:'whip',amount:1}},bank:[],offers:[],catalog:[]}));}

test('online food sends one intent and leaves health, inventory and cooldowns unchanged',a=>{
  a.inv[0]={id:'shark',n:1};const before=state(a);
  assert.equal(eatFood(a,0),true);
  assert.deepEqual(sent,[{type:'eat',index:0}]);assert.equal(state(a),before);
});
test('food is blocked while disconnected, unready or socket-closed',a=>{
  a.inv[0]={id:'shark',n:1};const before=state(a);
  for(const key of ['connected','ready']){Online[key]=false;assert.ok(!eatFood(a,0));Online[key]=true;}
  Online.ws.readyState=3;assert.ok(!eatFood(a,0));
  assert.equal(sent.length,0);assert.equal(state(a),before);
});
test('dead and zero-health online players cannot send food intentions',a=>{
  a.inv[0]={id:'shark',n:1};a.dead=true;assert.ok(!eatFood(a,0));
  a.dead=false;a.hp=0;assert.ok(!eatFood(a,0));assert.equal(sent.length,0);
});
test('invalid food indexes, empty slots and non-food do not send',a=>{
  a.inv[0]={id:'shark',n:1};a.inv[1]={id:'whip',n:1};
  for(const index of [-1,28,1.5,NaN,Infinity,'0',null,undefined,1,2])assert.ok(!eatFood(a,index));
  assert.equal(sent.length,0);assert.equal(a.inv[0].id,'shark');
});
test('a failing socket cannot consume food or crash the inventory action',a=>{
  a.inv[0]={id:'shark',n:1};const before=state(a);
  Online.ws.send=()=>{throw new Error('connection closed');};
  assert.ok(!eatFood(a,0));assert.equal(state(a),before);
});
test('online inventory default uses the real food wrapper exactly once',a=>{
  a.inv[0]={id:'shark',n:1};invDefault(0);
  assert.deepEqual(sent,[{type:'eat',index:0}]);assert.equal(a.inv[0].id,'shark');
});
test('fresh online Drop is an intent and does not create local loot',a=>{
  a.inv[0]={id:'shark',n:1};dropFor(a).fn();
  assert.deepEqual(sent,[{type:'drop',index:0}]);assert.equal(a.inv[0].id,'shark');assert.equal(G.ground.length,0);
});
test('stale online Drop cannot act on a replacement item in its slot',a=>{
  a.inv[0]={id:'shark',n:1};const old=dropFor(a);a.inv[0]={id:'whip',n:1};old.fn();
  assert.equal(sent.length,0);assert.equal(a.inv[0].id,'whip');
});
test('online Drop menu retains the dead-player guard',a=>{
  a.inv[0]={id:'shark',n:1};const old=dropFor(a);a.dead=true;old.fn();assert.equal(sent.length,0);
});
test('authoritative inventory replacement invalidates open menu and drag',a=>{
  a.inv[0]={id:'shark',n:1};UI.menu={entries:itemMenu(a,0)};UI.drag={from:0,active:true};
  account([{id:'whip',amount:1}]);
  assert.equal(UI.menu,null);assert.equal(UI.drag,null);assert.equal(a.inv[0].id,'whip');
});
test('account updates install the authoritative 28-slot inventory and equipment',a=>{
  account([{id:'shark',amount:1},{id:'prayer',amount:3}]);
  assert.equal(a.inv.length,28);assert.deepEqual(a.inv.slice(0,2),[{id:'shark',n:1},{id:'prayer',n:3}]);
  assert.equal(a.inv[27],null);assert.equal(a.eq.weapon.id,'whip');assert.equal(sent.length,0);
});
test('online restock commands cannot replace local inventory or equipment',a=>{
  a.inv[0]={id:'shark',n:1};const before=state(a);
  for(const command of ['::restock','::RESTOCK'])chatCommand(command);
  assert.equal(state(a),before);assert.equal(sent.length,0);
});
test('online heal commands cannot change local health or prayer points',a=>{
  a.pp=12;const before=state(a);chatCommand('::heal');chatCommand('::HEAL');
  assert.equal(state(a),before);assert.equal(sent.length,0);
});
test('online bot commands cannot spawn local simulated opponents',a=>{
  chatCommand('::bots 6');chatCommand('::BOTS 6');
  assert.equal(G.actors.length,1);assert.equal(G.actors[0],a);assert.equal(UI.botCount,0);
});
test('direct restock is also blocked in an online session',a=>{
  const before=state(a);restock('main');assert.equal(state(a),before);assert.equal(sent.length,0);
});
test('expedition-only spells cannot be selected in World 1',()=>{
  for(const id of ['frostDart','sanguineDart']){G.spellSel=null;selectSpell(SPELL_BY_ID[id]);assert.equal(G.spellSel,null);}
});
test('supported ancient spells remain selectable online',()=>{
  selectSpell(SPELL_BY_ID.iceBarrage);assert.equal(G.spellSel,'iceBarrage');assert.equal(sent.length,0);
});
test('public chat uses the online socket',()=>{
  chatCommand('Hello from mobile');assert.deepEqual(sent,[{type:'chat',text:'Hello from mobile'}]);
});
test('online equipment and potion adapters only send intentions',a=>{
  a.inv[0]={id:'dds',n:1};a.inv[1]={id:'prayer',n:4};a.eq.weapon={id:'whip',n:1};
  const before=state(a);equipFromInv(a,0);unequipSlot(a,'weapon');drinkPotion(a,1);
  assert.deepEqual(sent,[{type:'equip',index:0},{type:'unequip',slot:'weapon'},{type:'drink',index:1}]);
  assert.equal(state(a),before);
});
test('online prayer adapter leaves prayer state server-owned',a=>{
  togglePrayer(a,'pmelee');assert.deepEqual(sent,[{type:'prayer',id:'pmelee',enabled:true}]);
  assert.equal(a.prayers.size,0);assert.equal(a.overhead,null);
});
test('offline food still consumes an item and heals',a=>{
  Online.active=false;a.inv[0]={id:'shark',n:1};eatFood(a,0);
  assert.equal(a.inv[0],null);assert.equal(a.hp,40);assert.equal(sent.length,0);
});
test('offline Arena restock and heal commands still work',a=>{
  Online.active=false;chatCommand('::restock');assert.equal(a.inv.filter(Boolean).length,28);
  assert.equal(a.eq.weapon.id,'whip');a.hp=20;a.pp=10;chatCommand('::heal');
  assert.equal(a.hp,a.maxHp);assert.equal(a.pp,a.stats.pray);assert.equal(sent.length,0);
});
test('offline progression spells remain selectable',()=>{
  Online.active=false;selectSpell(SPELL_BY_ID.frostDart);assert.equal(G.spellSel,'frostDart');
});
test('offline stale Drop remains safe and fresh Drop creates real local loot',a=>{
  Online.active=false;a.inv[0]={id:'shark',n:1};const old=dropFor(a);a.inv[0]={id:'whip',n:1};old.fn();
  assert.equal(a.inv[0].id,'whip');assert.equal(G.ground.length,0);dropFor(a).fn();
  assert.equal(a.inv[0],null);assert.equal(G.ground[0].id,'whip');assert.equal(sent.length,0);
});
test('mobile Eat finds food and uses the authoritative adapter once',a=>{
  a.inv[5]={id:'shark',n:1};const before=state(a);Mobile.food();
  assert.deepEqual(sent,[{type:'eat',index:5}]);assert.equal(state(a),before);
});
test('mobile Eat cannot send while unready or dead',a=>{
  a.inv[0]={id:'shark',n:1};Online.ready=false;Mobile.food();Online.ready=true;a.dead=true;Mobile.food();
  assert.equal(sent.length,0);
});
test('mobile empty-bag food and potion actions explain missing supplies without mutation',a=>{
  const before=state(a);Mobile.food();Mobile.potion();assert.equal(sent.length,0);assert.equal(state(a),before);
  assert.ok(G.msgs.some(m=>/no food/i.test(m.text)));assert.ok(G.msgs.some(m=>/no potion/i.test(m.text)));
});
test('mobile potion chooses prayer, restore, then another available potion',a=>{
  a.inv[0]={id:'supstr',n:4};a.inv[2]={id:'restore',n:4};a.inv[5]={id:'prayer',n:4};
  let before=state(a);Mobile.potion();assert.equal(state(a),before);assert.equal(sent.length,1);
  a.inv[5]=null;before=state(a);Mobile.potion();assert.equal(state(a),before);assert.equal(sent.length,2);
  a.inv[2]=null;before=state(a);Mobile.potion();assert.equal(state(a),before);assert.equal(sent.length,3);
  assert.deepEqual(sent,[{type:'drink',index:5},{type:'drink',index:2},{type:'drink',index:0}]);
  assert.equal(a.inv[0].n,4);
});
test('mobile potion is inert while unready, disconnected or dead',a=>{
  a.inv[0]={id:'prayer',n:4};a.pp=10;const before=state(a);
  Online.ready=false;Mobile.potion();Online.ready=true;
  Online.connected=false;Mobile.potion();Online.connected=true;
  a.dead=true;Mobile.potion();assert.equal(sent.length,0);assert.equal(state(a),before);
});
test('offline mobile food and potion helpers retain actual consumption',a=>{
  Online.active=false;a.inv[0]={id:'shark',n:1};a.inv[1]={id:'prayer',n:4};a.pp=10;
  Mobile.food();Mobile.potion();assert.equal(a.hp,40);assert.equal(a.inv[0],null);
  assert.equal(a.inv[1].n,3);assert.ok(a.pp>10);assert.equal(sent.length,0);
});
test('mobile quick prayer opens selection when no prayers were configured',()=>{
  Mobile.prayers();assert.equal(opened,'touch');assert.equal(Mobile.page,'prayers');assert.equal(sent.length,0);
});
test('mobile quick prayer toggles selected prayers through online intentions',a=>{
  a.prayers=new Set(['pmelee']);Mobile.prayers();
  assert.deepEqual(sent,[{type:'prayer',id:'pmelee',enabled:false}]);assert.equal(a.prayers.has('pmelee'),true);
});
test('mobile special rejects absent weapon or insufficient energy',a=>{
  a.eq={};Mobile.special();assert.equal(a.specOn,false);
  a.eq.weapon={id:'dds',n:1};a.spec=0;Mobile.special();assert.equal(a.specOn,false);
  a.spec=100;Mobile.special();assert.equal(a.specOn,true);assert.equal(sent.length,0);
});
console.log('NETWORK_RUNTIME_TESTS_PASSED='+passed);
if(failures.length){console.error('NETWORK_RUNTIME_TESTS_FAILED='+failures.length);throw new Error(failures.map(f=>f.name).join('; '));}
`, context, {filename: 'network-runtime-tests', timeout: 30000});
