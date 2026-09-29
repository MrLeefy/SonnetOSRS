'use strict';
/* A data-driven, offline progression loop alongside the original PvP sandbox.
 * Balance is original to this fork; it is not a claim of OSRS authenticity.
 */
const Expedition = (() => {
  const xpKeys = ['atk','str','def','rng','mag','hp','pray','mining','woodcutting','fishing','cooking','smithing'];
  const xpFor = level => Math.floor(80 * Math.pow(Math.max(0, level - 1), 1.65));
  const levelFor = xp => { let l=1; while(l<99 && xp>=xpFor(l+1)) l++; return l; };
  const icon = (base, tint) => p => { ICON_FN[base](p); if (tint) p.line(6,27,26,7,tint,2); };
  const material = (id,name,col,stack=false) => def(id,{name,ex:name+' gathered on an expedition.',stack,val:10},p=>{
    p.poly([[6,23],[8,12],[17,6],[26,13],[25,26],[13,28]],col);
    p.line(10,13,17,9,shadeCol(col,1.45),2); p.line(17,9,23,14,shadeCol(col,1.2),1);
  });
  material('ironOre','Iron ore',0x978777);
  material('logs','Timber',0x8b5a30);
  material('ironBar','Iron bar',0xb3b4a8);
  material('trailToken','Trail token',0xcfa755,true);
  material('guardianSigil','Guardian sigil',0x56ccd1,true);
  def('rawFish',{name:'River trout',ex:'Cook this at the campfire.',val:8},icon('shark'));
  def('cookedFish',{name:'Grilled trout',ex:'Restores 9 Hitpoints.',food:{heal:9},val:15},p=>{ICON_FN.shark(p);p.line(9,17,23,17,0xbd8452,4);});
  def('trailPick',{name:'Trail pickaxe',ex:'Keep this in your inventory to mine ore.',val:5},p=>{p.line(8,27,22,8,0x89603d,3);p.line(9,8,26,12,0xbac1c6,4);});
  def('trailAxe',{name:'Trail hatchet',ex:'Keep this in your inventory to chop timber.',val:5},p=>{p.line(10,28,19,6,0x89603d,3);p.poly([[17,5],[27,9],[25,18],[15,12]],0xbac1c6);});
  def('trailNet',{name:'Fishing net',ex:'Keep this in your inventory to fish.',val:5},p=>{p.line(6,28,19,13,0x89603d,3);p.ellipse(21,10,8,6,0xcbc6ab);for(let i=0;i<4;i++)p.line(16+i*3,5,19+i*2,16,0x797666,1);});
  def('bronzeBlade',{name:'Trail blade',ex:'A dependable starter blade.',slot:'weapon',bonus:bon({[A_SLASH]:12,[B_STR]:12}),speed:4,range:1,cat:'scim',catName:'Slash Sword',model:'scim',color:0xbb8d5c,val:50},icon('rscim',0xbb8d5c));
  def('ironBlade',{name:'Forged iron blade',ex:'Made at the expedition forge.',slot:'weapon',bonus:bon({[A_SLASH]:29,[B_STR]:26}),speed:4,range:1,cat:'scim',catName:'Slash Sword',model:'scim',color:0xb9c4c5,val:200},icon('rscim',0xb9c4c5));
  def('guardianBlade',{name:'Warden blade',ex:'A sigil-forged weapon. Special attack: Resolute strike.',slot:'weapon',bonus:bon({[A_SLASH]:46,[B_STR]:42}),speed:4,range:1,cat:'scim',catName:'Slash Sword',model:'scim',color:0x63c8cd,val:1000,spec:{name:'Resolute strike',cost:50,acc:1.5,dmg:1.25}},icon('dscim',0x63c8cd));
  // Low-level spells make progression magic usable without granting 94 Magic.
  for (const s of [
    {id:'frostDart',name:'Frost Dart',lvl:1,max:6,freeze:0,runes:{water:2},kind:'ice',d:'A small frost projectile.'},
    {id:'sanguineDart',name:'Sanguine Dart',lvl:15,max:9,runes:{blood:1},kind:'blood',d:'Restores a quarter of damage dealt.'}
  ]) { SPELLS.unshift(s); SPELL_BY_ID[s.id]=s; }
  const recipes = [
    {id:'trout',name:'Grill trout',station:'fire',input:{rawFish:1,logs:1},output:['cookedFish',1],skill:'cooking',xp:35},
    {id:'bar',name:'Smelt iron bar',station:'forge',input:{ironOre:2},output:['ironBar',1],skill:'smithing',xp:45},
    {id:'blade',name:'Forge iron blade',station:'forge',input:{ironBar:3,logs:1},output:['ironBlade',1],skill:'smithing',xp:90},
    {id:'warden',name:'Forge Warden blade',station:'forge',input:{ironBar:5,guardianSigil:1},output:['guardianBlade',1],skill:'smithing',xp:200}
  ];
  const quests = [
    {id:'ore',name:'Prospector',text:'Mine 6 iron ore.',event:'mine',goal:6,coins:120,xp:['mining',60]},
    {id:'wood',name:'A warm welcome',text:'Gather 4 timber.',event:'wood',goal:4,coins:80,xp:['woodcutting',60]},
    {id:'cook',name:'Camp cook',text:'Grill 3 river trout.',event:'cook',goal:3,coins:120,xp:['cooking',90]},
    {id:'bandits',name:'Road warden',text:'Defeat 3 trail bandits.',event:'bandit',goal:3,coins:250,xp:['def',100]},
    {id:'forge',name:'Made by hand',text:'Forge an iron blade.',event:'forge',goal:1,coins:200,xp:['smithing',120]},
    {id:'guardian',name:'The silent sentinel',text:'Defeat the Stone Guardian. Move out of its marked slam.',event:'guardian',goal:1,coins:750,xp:['atk',250]}
  ];
  const monsters = {
    bandit:{name:'Trail bandit',stats:{atk:12,str:10,def:6,rng:1,mag:1,pray:1,hp:28},weapon:'bronzeBlade',coins:20,respawn:35,radius:6,kit:{skin:0xc99870,hair:0x33251e,shirt:0x795449,pants:0x363d38}},
    raider:{name:'Iron raider',stats:{atk:20,str:20,def:14,rng:1,mag:1,pray:1,hp:48},weapon:'ironBlade',coins:45,respawn:45,radius:6,kit:{skin:0x9c7555,hair:0x202a2a,shirt:0x3c5661,pants:0x404943}},
    guardian:{name:'Stone Guardian',stats:{atk:26,str:25,def:22,rng:1,mag:1,pray:1,hp:180},weapon:'ironBlade',coins:160,respawn:80,radius:9,kit:{skin:0x9aa7a3,hair:0x3f545b,shirt:0x667979,pants:0x506269}}
  };
  const E={active:false,xp:{},progress:{},claimed:{},bank:[],pvmKills:0,gather:null,nodes:[],warnings:[],waypoint:null,
    recipes,quests,monsters,xpKeys,xpFor,levelFor};
  E.safe = (x,y) => x>=39 && x<=57 && y>=28 && y<=38;
  E.canFight = (a,b) => !E.active || (!a.npc && !b.npc && (a.isPlayer||b.isPlayer) && !(a.monster&&b.monster) && !E.safe(a.x,a.y) && !E.safe(b.x,b.y));
  E.cancelGather = () => { E.gather=null; };
  E.nearBank = () => !!G.player && WORLD.objs.some(o=>o.kind==='bank' && dist2(o.x,o.y,G.player.x,G.player.y)<=2);
  E.inCombat = () => !!G.player && (G.player.target || G.tick-G.player.lastHitTick<10 || G.hitQ.some(h=>h.dst===G.player));
  E.canBank = () => Engine.alive(G.player) && E.nearBank() && !E.inCombat();
  E.goBank = () => {
    if (!G.player || E.inCombat()) { gameMsg('Leave combat before banking.'); return; }
    const o=WORLD.objs.filter(o=>o.kind==='bank').sort((a,b)=>dist2(a.x,a.y,G.player.x,G.player.y)-dist2(b.x,b.y,G.player.x,G.player.y))[0];
    if(o) cmdJob(o.x,o.y,a=>dist2(a.x,a.y,o.x,o.y)<=2,()=>Client.open('bank'));
  };
  E.addXp = (key,amount) => {
    if(!E.active || !xpKeys.includes(key) || !Number.isFinite(amount) || amount<=0) return;
    const before=levelFor(E.xp[key]||0); E.xp[key]=Math.min(xpFor(99), (E.xp[key]||0)+Math.floor(amount));
    const after=levelFor(E.xp[key]);
    if(after>before){
      if(Object.prototype.hasOwnProperty.call(G.player.stats,key)){
        G.player.stats[key]=after; G.player.cur[key]=Math.max(G.player.cur[key],after);
        if(key==='hp'){G.player.maxHp=after;G.player.hp=Math.min(after,G.player.hp+after-before);}
        G.player.level=combatLevel(G.player.stats);
      }
      gameMsg(key+' reached level '+after+'!');
      if(typeof Polish!=='undefined') Polish.burst(G.player.x+.5,G.player.y+.5,0xf2cd76,18);
    }
  };
  E.track = (event,amount=1) => { for(const q of quests) if(q.event===event) E.progress[q.id]=Math.min(q.goal,(E.progress[q.id]||0)+amount); };
  E.claim = id => {
    const q=quests.find(q=>q.id===id); if(!q || !E.active || E.claimed[id] || (E.progress[id]||0)<q.goal) return false;
    const inv=Engine.cloneInv(G.player.inv);
    if(!Engine.insert(inv,'coins',q.coins) || !Engine.insert(inv,'trailToken',1)){gameMsg('Make room for the contract reward.');return false;}
    G.player.inv=inv; E.claimed[id]=true; E.addXp(...q.xp); gameMsg(q.name+' complete! +'+q.coins+' coins and a trail token.'); return true;
  };
  E.deposit = (idx,all=false) => {
    if(!E.canBank()) return false;
    const inv=Engine.cloneInv(G.player.inv), bank=E.bank.map(s=>({...s}));
    const indices=all ? inv.map((_,i)=>i) : [idx];
    for(const i of indices){
      const s=inv[i];if(!s)continue;
      const it=ITEMS[s.id], match=bank.find(b=>b.id===s.id && (!it.doses || b.n===s.n));
      if(match){const key=it.stack?'n':'qty', n=it.stack?s.n:1;if(match[key]>Engine.MAX_STACK-n)return false;match[key]+=n;}
      else{if(bank.length>=120){gameMsg('Bank is full. Nothing was deposited.');return false;}bank.push({id:s.id,n:s.n,qty:1});}
      inv[i]=null;
    }
    G.player.inv=inv;E.bank=bank;return true;
  };
  E.withdraw = (idx,amount=1) => {
    if(!E.canBank() || !Number.isInteger(idx) || idx<0 || idx>=E.bank.length) return false;
    const s=E.bank[idx], it=ITEMS[s.id], max=it.stack?s.n:s.qty;
    const n=amount==='all'?max:Math.min(max,amount);
    if(!Engine.validQty(n))return false;
    const inv=Engine.cloneInv(G.player.inv);
    if(it.stack){if(!Engine.insert(inv,s.id,n))return false;}
    else{if(n>inv.filter(s=>!s).length)return false;for(let i=0;i<n;i++)if(!Engine.insert(inv,s.id,s.n))return false;}
    G.player.inv=inv;
    if(it.stack)s.n-=n;else s.qty-=n;
    if((it.stack?s.n:s.qty)<=0)E.bank.splice(idx,1);
    return true;
  };
  E.buy = (id,n,price) => {
    if(!E.canBank() || !Engine.validItem(id) || !Engine.validQty(n) || !Number.isSafeInteger(price) || price<=0)return false;
    // Merchant stock is deliberately small and finite per purchase.
    const stock={cookedFish:[1,15],water:[30,20],blood:[10,40],trailPick:[1,5],trailAxe:[1,5],trailNet:[1,5],ancstaff:[1,100],msb:[1,100],rarrows:[50,30]};
    if(!stock[id] || stock[id][0]!==n || stock[id][1]!==price)return false;
    const inv=Engine.cloneInv(G.player.inv);
    if(!Engine.remove(inv,'coins',price) || !Engine.insert(inv,id,n)){gameMsg('You need enough coins and inventory space.');return false;}
    G.player.inv=inv;return true;
  };
  E.craft = id => {
    const r=recipes.find(r=>r.id===id), pl=G.player;
    if(!E.active || !r || !Engine.alive(pl) || E.inCombat() || !WORLD.objs.some(o=>o.expedition && o.station===r.station && dist2(o.x,o.y,pl.x,pl.y)<=2))return false;
    const inv=Engine.cloneInv(pl.inv);
    for(const [item,n] of Object.entries(r.input))if(!Engine.remove(inv,item,n)){gameMsg('Missing ingredients for '+r.name+'.');return false;}
    if(!Engine.insert(inv,...r.output)){gameMsg('Make room for the crafted item.');return false;}
    pl.inv=inv;E.addXp(r.skill,r.xp);E.track(id==='trout'?'cook':id==='blade'?'forge':'craft');
    gameMsg(r.name+' completed.');if(typeof Polish!=='undefined')Polish.burst(pl.x+.5,pl.y+.5,0xe8b965,8);return true;
  };
  function nearestClear(x,y){
    for(let r=0;r<8;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(Math.max(Math.abs(dx),Math.abs(dy))===r && passable(x+dx,y+dy) && !WORLD.objs.some(o=>o.x===x+dx&&o.y===y+dy))return{x:x+dx,y:y+dy};
    throw new Error('No clear tile for expedition object.');
  }
  function node(x,y,kind,name,extra={}){
    const p=nearestClear(x,y),i=p.y*MAPN+p.x;
    const o={...p,kind,name,h:kind==='resource'&&extra.skill==='woodcutting'?2.5:1,expedition:true,charges:3,respawnAt:0,oldBlock:WORLD.block[i],oldColor:WORLD.mm[i],...extra};
    WORLD.objs.push(o);E.nodes.push(o);WORLD.block[i]=1;WORLD.mm[i]=extra.color||0xb99460;return o;
  }
  E.installWorld = () => {
    E.nodes=[];
    for(const [x,y] of [[37,31],[35,33],[37,35]])node(x,y,'resource','Iron seam',{skill:'mining',tool:'trailPick',output:'ironOre',xp:25,event:'mine',color:0x9e8c79,description:'Three ore per seam; regrows after 18 seconds.'});
    for(const [x,y] of [[43,25],[46,25],[49,25]])node(x,y,'resource','Coppice tree',{skill:'woodcutting',tool:'trailAxe',output:'logs',xp:25,event:'wood',color:0x72ad65,description:'Three timber per tree. Keep a trail hatchet in your bag.'});
    for(const [x,y] of [[60,29],[62,30]])node(x,y,'resource','Fishing pool',{skill:'fishing',tool:'trailNet',output:'rawFish',xp:25,event:'fish',color:0x72c4d8,description:'Catch river trout, then cook them with timber.'});
    node(44,32,'forge','Camp forge',{station:'forge',description:'Smelt ore and forge weapons.'});
    node(51,32,'forge','Campfire',{station:'fire',description:'Cook fish with timber.'});
    initLoS();
    for(const [type,x,y] of [['bandit',61,40],['bandit',65,37],['bandit',66,43],['raider',69,57],['raider',65,59],['guardian',61,67]]){
      const spec=monsters[type],p=nearestClear(x,y);
      const a=newActor({name:spec.name,...p,stats:spec.stats,kit:spec.kit});
      a.monster=type;a.home={...p};a.runOn=false;a.nextSlam=G.tick+14;a.wanderAt=0;
      a.eq.weapon={id:spec.weapon,n:1};recalcBonus(a);G.actors.push(a);
    }
  };
  E.uninstallWorld = () => {
    for(const o of E.nodes){const i=o.y*MAPN+o.x;WORLD.block[i]=o.oldBlock;WORLD.mm[i]=o.oldColor;}
    WORLD.objs=WORLD.objs.filter(o=>!o.expedition);G.actors=G.actors.filter(a=>!a.monster);
    E.nodes=[];E.warnings=[];E.gather=null;E.waypoint=null;initLoS();
  };
  E.begin = mode => {
    E.active=mode==='expedition'; E.xp={};E.progress={};E.claimed={};E.bank=[];E.pvmKills=0;E.gather=null;E.warnings=[];
    if(!E.active)return;
    const pl=G.player;
    Object.assign(pl.stats,{atk:15,str:15,def:10,rng:15,mag:15,pray:10,hp:30});
    pl.cur={...pl.stats};pl.hp=pl.maxHp=30;pl.pp=10;pl.level=combatLevel(pl.stats);
    pl.eq={weapon:{id:'bronzeBlade',n:1}};pl.inv=new Array(28).fill(null);
    for(const [id,n] of [['trailPick',1],['trailAxe',1],['trailNet',1],['cookedFish',8],['coins',40]])addItem(pl,id,n);
    recalcBonus(pl);pl.x=48;pl.y=34;
    for(const key of xpKeys)E.xp[key]=xpFor(pl.stats[key]||1);
    E.installWorld();
  };
  E.interact = obj => {
    if(!E.active || !E.nodes.includes(obj) || !Engine.alive(G.player))return;
    const near=a=>dist2(a.x,a.y,obj.x,obj.y)<=1;
    cmdJob(obj.x,obj.y,near,()=>{
      if(obj.kind!=='resource'){Client.open(obj.station==='fire'?'cooking':'craft');return;}
      if(!countItem(G.player,obj.tool)){gameMsg('Keep a '+ITEMS[obj.tool].name+' in your inventory.');return;}
      if(obj.charges<=0){gameMsg('This resource is recovering. Try another node.');return;}
      G.player.target=null;E.gather={node:obj,due:G.tick+4};gameMsg('You begin '+obj.skill+'.');
    });
  };
  E.tick = () => {
    if(!E.active)return;
    for(const o of E.nodes)if(o.kind==='resource' && o.charges===0 && G.tick>=o.respawnAt)o.charges=3;
    const job=E.gather;
    if(job){const pl=G.player,o=job.node;
      if(!Engine.alive(pl) || pl.target || pl.path.length || dist2(pl.x,pl.y,o.x,o.y)>1 || !countItem(pl,o.tool) || o.charges<=0)E.gather=null;
      else if(G.tick>=job.due){
        if(!addItem(pl,o.output,1)){gameMsg('Your inventory is full. Gathering stopped.');E.gather=null;}
        else{o.charges--;E.addXp(o.skill,o.xp);E.track(o.event);job.due=G.tick+4;pl.anim={type:o.skill==='mining'?'crush':'slash',t0:G.now,dur:450};
          if(typeof Polish!=='undefined')Polish.burst(o.x+.5,o.y+.5,o.color,6);
          if(!o.charges){o.respawnAt=G.tick+30;E.gather=null;gameMsg(o.name+' depleted. It will recover shortly.');}
        }
      }
    }
    const due=E.warnings.filter(w=>w.due<=G.tick);E.warnings=E.warnings.filter(w=>w.due>G.tick && !w.source.dead && w.source.life===w.life);
    for(const w of due){
      if(w.source.dead || w.source.life!==w.life)continue;
      const pl=G.player;
      if(Engine.alive(pl) && Math.hypot(pl.x+.5-w.x,pl.y+.5-w.y)<w.radius){
        applyHit({src:w.source,dst:pl,srcLife:w.life,dstLife:pl.life,dmg:w.enraged?15:11,type:'pmelee'});
        gameMsg('The guardian slam strikes you!');
      }
      if(typeof Polish!=='undefined')Polish.burst(w.x,w.y,0xefbd83,18);
    }
  };
  E.think = a => {
    const spec=monsters[a.monster],pl=G.player;
    if(!Engine.alive(pl) || E.safe(pl.x,pl.y) || dist2(pl.x,pl.y,a.home.x,a.home.y)>spec.radius || dist2(a.x,a.y,a.home.x,a.home.y)>spec.radius+2){
      a.target=null;
      if(dist2(a.x,a.y,a.home.x,a.home.y)>1 && !a.path.length)a.path=findPath(a.x,a.y,(x,y)=>x===a.home.x&&y===a.home.y,a.home,1200)||[];
      if(!a.path.length && G.tick>=a.wanderAt){a.wanderAt=G.tick+8+rint(8);const x=a.home.x+rrange(-2,2),y=a.home.y+rrange(-2,2);if(passable(x,y))a.path=findPath(a.x,a.y,(px,py)=>px===x&&py===y,null,700)||[];}
      if(a.hp<a.maxHp && G.tick%10===0)a.hp=Math.min(a.maxHp,a.hp+3);
      return;
    }
    a.target=pl;
    if(a.monster==='guardian' && G.tick>=a.nextSlam && dist2(a.x,a.y,pl.x,pl.y)<=6){
      const enraged=a.hp<a.maxHp/2;a.nextSlam=G.tick+(enraged?10:16);
      E.warnings.push({source:a,life:a.life,x:pl.x+.5,y:pl.y+.5,radius:2.1,due:G.tick+3,enraged});
      a.atkCd=Math.max(a.atkCd,4);gameMsg(enraged?'The guardian enrages! Move out of the bright ring!':'The guardian prepares a ground slam. Move out of the ring!');
    }
  };
  E.respawnMonster = a => {
    Engine.clearTransient(a);const spec=monsters[a.monster];a.dead=false;a.hp=a.maxHp;a.cur={...spec.stats};a.x=a.home.x;a.y=a.home.y;
    a.frozen=a.skull=0;a.anim=null;a.prayers.clear();a.overhead=null;a.nextSlam=G.tick+14;a.wanderAt=G.tick+3;
  };
  E.onDamage = (src,dst,dealt,type) => {
    if(!E.active || !src.isPlayer || !dst.monster || dealt<=0)return;
    if(type==='pmagic')E.addXp('mag',dealt*4);
    else if(type==='pmissiles')E.addXp('rng',dealt*4);
    else{const b=styleOf(src).b;if(b==='ctl'){for(const k of ['atk','str','def'])E.addXp(k,dealt*1.4);}else E.addXp(b==='agg'?'str':b==='def'?'def':'atk',dealt*4);}
    E.addXp('hp',dealt*1.34);
  };
  const originalDrops=dropLoot;
  dropLoot = d => {
    if(!d.monster){originalDrops(d);return;}
    const spec=monsters[d.monster],list=[['coins',spec.coins+rrange(0,15)],['cookedFish',1]];
    if(d.monster==='guardian')list.push(['guardianSigil',1],['ironBar',2]);
    else if(chance(.35))list.push(['ironOre',1]);
    for(const [id,n]of list)for(let i=0;i<(ITEMS[id].stack?1:n);i++)G.ground.push({id,n:ITEMS[id].stack?n:1,x:d.x,y:d.y,t:G.tick});
  };
  E.onKill = (d,s) => {
    if(!E.active)return;
    if(d.monster){d.respawnAt=G.tick+monsters[d.monster].respawn;
      if(s.isPlayer){E.pvmKills++;E.track(d.monster);E.addXp('def',15);}
    }
    if(d.isPlayer){E.cancelGather();E.warnings=[];}
  };
  const originalCommand=chatCommand;
  chatCommand = t => {
    if(t==='::save'){Profiles.save(true);return;}
    if(t==='::journal'){Client.open('journal');return;}
    if(t==='::bank'){E.goBank();return;}
    if(E.active && /^::(heal|restock|bots)(?:\s|$)/i.test(t)){gameMsg('Sandbox commands are disabled in Expedition. Your Arena save is separate.');return;}
    if(/^::bots(?:\s|$)/i.test(t)){const n=Number(t.split(/\s+/)[1]);if(Number.isFinite(n)){setBotCount(n);gameMsg('Opponents: '+UI.botCount);}return;}
    originalCommand(t);
  };
  return E;
})();
