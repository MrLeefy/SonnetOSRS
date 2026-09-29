'use strict';
/* Versioned local profiles. Imports are data, never executable code.
 * Arena and Expedition use separate keys; a practice kit cannot be imported
 * into an Expedition profile through the UI. Storage failures do not stop play.
 */
const Profiles = (() => {
  const VERSION=2, PREFIX='leefy.sonnet.v2.';
  const P={version:VERSION,name:'Leefy',mode:'arena',status:'Not saved yet',blocked:false,storage:null,lastSave:0,
    settings:{quality:'balanced',layout:'auto',sound:true,showFps:false,reduceMotion:false,cameraSmooth:true}};
  const fail = s => {throw new Error(s);};
  const object = x => x!==null && typeof x==='object' && !Array.isArray(x);
  const int = (v,min,max,label) => Number.isSafeInteger(v)&&v>=min&&v<=max?v:fail('Invalid '+label);
  const finite = (v,min,max,label) => Number.isFinite(v)&&v>=min&&v<=max?v:fail('Invalid '+label);
  const cleanName = n => String(n||'Player').replace(/[^a-zA-Z0-9 _-]/g,'').trim().slice(0,12)||'Player';
  const key=()=>PREFIX+P.mode+'.'+P.name.toLowerCase();
  function item(s,bank=false){
    if(s===null && !bank)return null;
    if(!object(s)||!Engine.validItem(s.id))fail('Unknown item');
    const it=ITEMS[s.id],n=int(s.n,1,it.stack?Engine.MAX_STACK:it.doses||1,'item quantity');
    if(bank){const qty=int(s.qty,1,Engine.MAX_STACK,'bank count');if(it.stack&&qty!==1)fail('Stack bank count must be 1');return{id:s.id,n,qty};}
    return{id:s.id,n};
  }
  P.validate = data => {
    if(!object(data)||data.version!==VERSION)fail('Unsupported save version');
    if(!['arena','expedition'].includes(data.mode))fail('Unknown game mode');
    const name=cleanName(data.name);if(name!==data.name)fail('Invalid profile name');
    const a=data.player;if(!object(a)||!object(a.stats)||!object(a.eq))fail('Missing character data');
    if(!Array.isArray(a.inv)||a.inv.length!==28)fail('Inventory must have exactly 28 slots');
    const stats={};for(const k of ['atk','str','def','rng','mag','pray','hp'])stats[k]=int(a.stats[k],1,99,k);
    const eq={};for(const slot of SLOTS)if(a.eq[slot]){eq[slot]=item(a.eq[slot]);if(ITEMS[eq[slot].id].slot!==slot)fail('Equipment in wrong slot');}
    if(eq.weapon&&ITEMS[eq.weapon.id].two&&eq.shield)fail('Two-handed weapon conflicts with shield');
    const inv=a.inv.map(s=>item(s));
    const bank=Array.isArray(data.bank)&&data.bank.length<=120?data.bank.map(s=>item(s,true)):fail('Invalid bank');
    const xp={};for(const k of Expedition.xpKeys)xp[k]=int(data.xp&&data.xp[k]!==undefined?data.xp[k]:0,0,Expedition.xpFor(99),k+' XP');
    if(data.mode==='expedition')for(const k of Object.keys(stats))if(stats[k]!==Expedition.levelFor(xp[k]))fail('XP does not match '+k+' level');
    const progress={},claimed={};
    for(const q of Expedition.quests){
      progress[q.id]=int(data.progress&&data.progress[q.id]!==undefined?data.progress[q.id]:0,0,q.goal,'contract progress');
      claimed[q.id]=!!(data.claimed&&data.claimed[q.id]===true);
      if(claimed[q.id]&&progress[q.id]<q.goal)fail('Claimed contract is incomplete');
    }
    const metrics={};for(const k of ['kills','deaths','streak','best','dmgDealt','dmgTaken'])metrics[k]=int(data.metrics&&data.metrics[k]!==undefined?data.metrics[k]:0,0,Engine.MAX_STACK,k);
    const kit={};for(const k of ['skin','hair','shirt','pants','boots'])if(a.kit&&a.kit[k]!==undefined)kit[k]=int(a.kit[k],0,0xffffff,'appearance');
    kit.hairStyle=int(a.kit&&a.kit.hairStyle!==undefined?a.kit.hairStyle:1,0,2,'hair style');
    const player={stats,eq,inv,kit,hp:finite(a.hp,0,stats.hp+30,'hitpoints'),pp:finite(a.pp,0,stats.pray,'prayer'),
      x:int(a.x,0,MAPN-1,'x'),y:int(a.y,0,MAPN-1,'y'),run:finite(a.run,0,100,'energy'),
      spec:finite(a.spec,0,100,'special energy'),runOn:a.runOn!==false,autoRetal:a.autoRetal!==false,
      loadoutKind:Object.prototype.hasOwnProperty.call(LOADOUTS,a.loadoutKind)?a.loadoutKind:'main'};
    return{version:VERSION,name,mode:data.mode,player,bank,xp,progress,claimed,metrics,pvmKills:int(data.pvmKills||0,0,Engine.MAX_STACK,'PvM kills'),savedAt:typeof data.savedAt==='string'?data.savedAt.slice(0,40):''};
  };
  P.parse = raw => {if(typeof raw!=='string'||raw.length>150000)fail('Save is too large');return P.validate(JSON.parse(raw));};
  function store(){return P.storage||window.localStorage;}
  P.loadSettings = () => {
    try{
      const raw=store().getItem(PREFIX+'settings'),s=raw?JSON.parse(raw):{};
      if(['low','balanced','high'].includes(s.quality))P.settings.quality=s.quality;
      if(['auto','classic','touch'].includes(s.layout))P.settings.layout=s.layout;
      for(const k of ['sound','showFps','reduceMotion','cameraSmooth'])if(typeof s[k]==='boolean')P.settings[k]=s[k];
    }catch(_){P.status='Browser storage unavailable';}
  };
  P.saveSettings = () => {try{store().setItem(PREFIX+'settings',JSON.stringify(P.settings));return true;}catch(_){P.status='Settings could not be stored';return false;}};
  P.select = (name,mode) => {P.name=cleanName(name);P.mode=mode==='expedition'?'expedition':'arena';P.blocked=false;};
  P.read = () => {
    let raw,backup;
    try{raw=store().getItem(key());backup=store().getItem(key()+'.backup');}catch(_){P.status='Storage unavailable — export a backup to keep progress';return null;}
    if(!raw){P.status='New local profile';return null;}
    try{const d=P.parse(raw);if(d.mode!==P.mode||d.name.toLowerCase()!==P.name.toLowerCase())fail('Wrong profile');P.status='Local profile loaded';return d;}
    catch(_){
      try{const d=P.parse(backup);if(d.mode!==P.mode||d.name.toLowerCase()!==P.name.toLowerCase())fail('Wrong backup');P.status='Recovered the previous valid backup';return d;}
      catch(_){P.blocked=true;P.status='Damaged save preserved. Import a backup or explicitly reset this profile.';return null;}
    }
  };
  P.capture = () => {
    if(!G.player)fail('No active character');
    const a=G.player,metrics={};for(const k of ['kills','deaths','streak','best','dmgDealt','dmgTaken'])metrics[k]=Math.floor(clamp(G[k]||0,0,Engine.MAX_STACK));
    const data={version:VERSION,name:P.name,mode:P.mode,savedAt:new Date().toISOString(),
      player:{stats:{...a.stats},eq:a.eq,inv:a.inv,kit:a.kit,hp:a.hp,pp:a.pp,x:a.x,y:a.y,run:a.run,spec:a.spec,runOn:a.runOn,autoRetal:a.autoRetal,loadoutKind:a.loadoutKind||'main'},
      bank:Expedition.bank,xp:Expedition.xp,progress:Expedition.progress,claimed:Expedition.claimed,pvmKills:Expedition.pvmKills,metrics};
    return P.validate(data);
  };
  P.apply = data => {
    const d=P.validate(data);if(d.mode!==P.mode)fail('A save from another game mode cannot be loaded here.');
    const a=G.player,s=d.player;
    Engine.clearTransient(a);
    a.name=P.name=d.name;a.stats={...s.stats};a.cur={...s.stats};a.maxHp=s.stats.hp;
    a.eq=s.eq;a.inv=s.inv;a.kit=s.kit;a.hp=s.hp>0?s.hp:a.maxHp;a.pp=s.hp>0?s.pp:s.stats.pray;
    const valid=s.hp>0&&passable(s.x,s.y);a.x=valid?s.x:48;a.y=valid?s.y:34;
    a.run=s.run;a.spec=s.spec;a.dead=false;a.prayers.clear();a.overhead=null;a.anim=null;a.frozen=0;a.skull=0;
    a.style=0;a.autocast=null;a.specOn=false;a.runOn=s.runOn;a.autoRetal=s.autoRetal;a.loadoutKind=s.loadoutKind;
    a.level=combatLevel(a.stats);a.protectUntil=G.tick+20;recalcBonus(a);
    Expedition.bank=d.bank;Expedition.xp=d.xp;Expedition.progress=d.progress;Expedition.claimed=d.claimed;Expedition.pvmKills=d.pvmKills;
    for(const k of Object.keys(d.metrics))G[k]=d.metrics[k];
    if(typeof Polish!=='undefined')Polish.snapCamera=true;
  };
  P.save = (notify=false) => {
    if(typeof Online!=='undefined'&&Online.active){
      P.status='World 1 progress is stored by the OLDSKOOL server';
      if(notify&&G.player)gameMsg(P.status+'.');
      return true;
    }
    if(!G.player||P.blocked)return false;
    try{
      const raw=JSON.stringify(P.capture()),s=store(),previous=s.getItem(key());
      if(previous){try{P.parse(previous);s.setItem(key()+'.backup',previous);}catch(_){/* Do not replace a good backup with corrupt data. */}}
      s.setItem(key(),raw);P.lastSave=performance.now();P.status='Saved '+new Date().toLocaleTimeString();
      if(notify)gameMsg('Profile saved in this browser.');return true;
    }catch(err){P.status='Save failed — export a backup to keep progress';if(notify)gameMsg(P.status);return false;}
  };
  P.exportFile = () => {
    try{
      const raw=JSON.stringify(P.capture(),null,2),blob=new Blob([raw],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='SonnetOSRS-'+P.name+'-'+P.mode+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);P.status='Backup exported';
    }catch(err){P.status=err.message;}
  };
  P.importFile = async file => {
    if(typeof Online!=='undefined'&&Online.active)fail('Leave World 1 before importing an offline profile.');
    if(!file||file.size>150000)fail('Choose a save smaller than 150 KB.');
    const d=P.parse(await file.text());
    if(d.mode!==P.mode)fail('Switch to '+d.mode+' before importing this save.');
    if(!window.confirm('Replace the current '+P.mode+' session with '+d.name+'? The current session will be saved first.'))return false;
    P.save();P.name=d.name;P.blocked=false;P.apply(d);P.save(true);return true;
  };
  P.reset = () => {
    if(typeof Online!=='undefined'&&Online.active){P.status='Leave World 1 before resetting an offline profile.';return false;}
    if(!window.confirm('Permanently reset only '+P.name+' / '+P.mode+' on this browser? Export a backup first.'))return false;
    try{store().removeItem(key());store().removeItem(key()+'.backup');P.blocked=false;return true;}catch(_){P.status='Storage unavailable';return false;}
  };
  P.key=key;P.cleanName=cleanName;
  return P;
})();
