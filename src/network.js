'use strict';
/* Protocol 2: destination intents -> server routes -> monotonic render motion.
 * No client-authoritative position writes and no resend-on-reject loop.
 */
const Online = (() => {
  const O={active:false,connected:false,connecting:false,ready:false,id:null,ws:null,
    endpoint:'wss://oldskool-api.129.146.39.132.sslip.io/ws',healthEndpoint:'https://oldskool-api.129.146.39.132.sslip.io/health',
    status:'Online world not connected',serverVersion:null,zone:'safe',safeZone:{center_x:48,center_y:48,apothem:9,shape:'octagon'},
    remotes:new Map(),seq:0,lastTick:-1,lastSnapshot:0,lastPing:0,lastRunOn:true,pending:null,job:null,
    reconnectTimer:null,handshakeTimer:null,manualClose:false,attempts:0,lastCombat:null,lastError:null,
    diagnostics:{sentWalks:0,snapshots:0,errors:0,reconnects:0},notices:new Map()};
  const tokenKey=name=>'oldskool.resume.'+String(name||'player').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,20);
  const usable=()=>O.active&&O.connected&&O.ready&&O.ws?.readyState===WebSocket.OPEN;
  const send=msg=>{if(!O.connected||O.ws?.readyState!==WebSocket.OPEN)return false;try{O.ws.send(JSON.stringify(msg));return true;}catch(_){return false;}};
  O.notice=(key,text,ms=4000)=>{const now=performance.now();if(now-(O.notices.get(key)??-Infinity)<ms)return;O.notices.set(key,now);if(G.player)gameMsg(text);};
  O.zoneAt=(x,y)=>{const z=O.safeZone,dx=x+.5-z.center_x,dy=y+.5-z.center_y;return Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dx+dy)*Math.SQRT1_2,Math.abs(dx-dy)*Math.SQRT1_2)<=z.apothem?'safe':'pvp';};
  O.canAttack=a=>usable()&&a?.onlineRemote&&O.zone==='pvp'&&(a.netZone||O.zoneAt(a.x,a.y))==='pvp';
  O.worldHash=()=>{let h=2166136261;for(const b of WORLD.block){h=Math.imul(h^b,16777619)>>>0;}return h;};
  O.checkHealth=async()=>{const c=new AbortController(),timer=setTimeout(()=>c.abort(),3500);try{
    const r=await fetch(O.healthEndpoint,{cache:'no-store',signal:c.signal});if(!r.ok)throw new Error('health');const j=await r.json();
    if(!O.active)O.status='World online · '+j.players+' player'+(j.players===1?'':'s')+(j.residents?' · '+j.residents+' simulated adventurers':'');return j;
  }catch(_){if(!O.active)O.status='Online world unavailable';return null;}finally{clearTimeout(timer);}};
  O.clearRemotes=()=>{const actors=new Set(O.remotes.values());G.actors=G.actors.filter(a=>!actors.has(a));for(const a of G.actors){if(actors.has(a.target))a.target=null;if(actors.has(a.follow))a.follow=null;}O.remotes.clear();};
  O.stop=silent=>{
    O.manualClose=true;clearTimeout(O.reconnectTimer);clearTimeout(O.handshakeTimer);const ws=O.ws;O.ws=null;
    if(ws)try{ws.close(1000,'leaving world');}catch(_){}
    O.active=O.connected=O.connecting=O.ready=false;O.id=null;O.pending=O.job=null;O.clearRemotes();
    if(G.player){G.player.netMotion=null;G.player.path=[];G.player.seg=[];G.player.target=G.player.follow=null;}
    if(!silent)O.status='Online world not connected';
  };
  O.start=name=>{
    if(!O.active&&App.mode==='game'&&!Profiles.save()&&!confirm('Your offline profile could not be saved. Continue without saving?'))return;
    O.stop(true);startGame(name,'arena',{onlineBootstrap:true,skipSave:true});setBotCount(0);
    O.active=true;O.manualClose=false;O.attempts=0;O.seq=0;O.lastTick=-1;O.notices.clear();
    const a=G.player;a.x=48;a.y=42;a.path=[];a.seg=[];a.protectUntil=0;a.target=null;a.frozen=0;
    G.hitQ=[];G.projs=[];Polish.snapCamera=true;
    Profiles.status='World 1 · server position and PvP progress';gameMsg('Connecting to OLDSKOOL World 1…');
    O.connect();
  };
  O.connect=()=>{
    if(!O.active||O.connected||O.connecting)return;O.connecting=true;O.ready=false;O.status='Connecting to World 1…';
    let ws;try{ws=new WebSocket(O.endpoint);}catch(_){O.connecting=false;O.status='Unable to connect';return;}O.ws=ws;
    O.handshakeTimer=setTimeout(()=>{if(O.ws===ws&&!O.ready){try{ws.close();}catch(_){}}},12000);
    ws.onopen=()=>{if(ws!==O.ws)return;let resume_token=null;try{resume_token=localStorage.getItem(tokenKey(G.player.name));}catch(_){}
      ws.send(JSON.stringify({type:'hello',protocol:2,name:G.player.name,resume_token}));};
    ws.onmessage=e=>{if(ws===O.ws)O.handle(e.data);};
    ws.onerror=()=>{if(ws===O.ws)O.status='Connection interrupted';};
    ws.onclose=e=>{
      if(ws!==O.ws)return;clearTimeout(O.handshakeTimer);O.ws=null;O.connected=O.connecting=O.ready=false;O.clearRemotes();
      O.pending=O.job=null;G.player.path=[];G.player.seg=[];G.player.target=null;G.player.netMotion=null;
      if(!O.active||O.manualClose)return;
      if(e.code===1008){O.manualClose=true;O.status='Refresh the page to reconnect';O.notice('refresh','World updated. Refresh this page to reconnect.',0);return;}
      O.status='Reconnecting…';O.notice('connection','Connection interrupted. Reconnecting; movement is paused.');
      O.diagnostics.reconnects++;const delay=Math.min(12000,700*2**Math.min(O.attempts++,4));
      clearTimeout(O.reconnectTimer);O.reconnectTimer=setTimeout(O.connect,delay);
    };
  };
  const stableKit=id=>{let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return{skin:SKIN[(h>>>0)%SKIN.length],hair:HAIR[(h>>>4)%HAIR.length],shirt:SHIRT[(h>>>8)%SHIRT.length],pants:0x444338,boots:0x3a2818,hairStyle:(h>>>12)%3};};
  O.actorFor=p=>{let a=O.remotes.get(p.id);if(!a){const kind=LOADOUTS[p.loadout]?p.loadout:'main';a=newActor({name:p.name,x:p.x,y:p.y,stats:PROFILES[kind]||PROFILES.main,kit:stableKit(p.id)});a.onlineRemote=true;a.netId=p.id;a.autoRetal=false;a.simulated=!!p.simulated;applyLoadout(a,kind);a.inv=new Array(28).fill(null);a.prayers.clear();G.actors.push(a);O.remotes.set(p.id,a);}return a;};
  const faceFor=(a,b)=>{
    const dx=Math.sign(b[0]-a[0]),dy=Math.sign(b[1]-a[1]);
    return dx||dy?Math.atan2(dx,dy):null;
  };
  const emptyMotion=(a,tick=-1)=>{a.netMotion={segments:[],lastTick:tick};a.netMoveFace=null;a.netRunSegment=false;a.netStepSerial=0;a.netStepPhase=0;};
  const motionSample=(a,now=performance.now())=>{
    const m=a.netMotion,segs=m?.segments;
    if(!segs?.length)return{p:[a.x+.5,a.y+.5],i:0,done:true,moving:false,face:null,stepMs:0};
    if(now<segs[0].t0){const s=segs[0];return{p:s.from,i:0,done:false,moving:false,face:s.face,stepMs:s.t1-s.t0};}
    for(let i=0;i<segs.length;i++){
      const q=segs[i];
      if(now<=q.t1){
        const f=clamp((now-q.t0)/(q.t1-q.t0),0,1);
        return{p:[lerp(q.from[0],q.to[0],f),lerp(q.from[1],q.to[1],f)],i,done:false,moving:f<1,face:q.face,stepMs:q.t1-q.t0,phase:(q.serial??0)+f};
      }
    }
    const q=segs.at(-1);return{p:q.to,i:segs.length-1,done:true,moving:false,face:q.face,stepMs:q.t1-q.t0,phase:(q.serial??0)+1};
  };
  const pruneMotion=(a,now=performance.now())=>{
    const m=a.netMotion;if(!m?.segments?.length)return;
    // Retain the last completed segment briefly so rendering at the boundary is stable.
    while(m.segments.length>1&&m.segments[1].t0<=now-40)m.segments.shift();
    if(m.segments.length===1&&m.segments[0].t1<now-900)m.segments.length=0;
  };
  const appendMotion=(a,nodes,tick,now)=>{
    if(!a.netMotion)emptyMotion(a,tick-1);
    const m=a.netMotion;
    if(tick<=m.lastTick)return;
    pruneMotion(a,now);
    const steps=nodes.length-1;
    if(steps<=0){m.lastTick=tick;return;}
    const sample=motionSample(a,now),last=m.segments.at(-1);
    let start=last&&last.t1>now-30?last.t1:now;
    let expected=last&&last.t1>now-30?last.to:sample.p;
    const serverStart=nodes[0];
    // Never invent a diagonal catch-up line across a server turn. If the buffered
    // endpoint and the new tick disagree, snap to the new legal tile boundary.
    if(Math.hypot(expected[0]-serverStart[0],expected[1]-serverStart[1])>.08){
      m.segments.length=0;expected=serverStart;start=now;
    }
    const stepMs=TICK_MS/steps;
    for(let i=1;i<nodes.length;i++){
      const from=i===1?expected:nodes[i-1],to=nodes[i],face=faceFor(from,to);
      if(face===null)continue;
      const serial=a.netStepSerial??0;a.netStepSerial=serial+1;const seg={from:[from[0],from[1]],to:[to[0],to[1]],t0:start,t1:start+stepMs,face,tick,run:steps===2,serial};
      m.segments.push(seg);start=seg.t1;expected=seg.to;
    }
    m.lastTick=tick;
    // A badly delayed client may be multiple ticks behind. Prefer one clean snap
    // over accelerating the avatar and producing foot-slide/moonwalk.
    if(m.segments.length>6){const keep=m.segments.slice(-Math.max(1,steps));m.segments=keep;let t=now;for(const q of keep){const d=q.t1-q.t0;q.t0=t;q.t1=t+d;t=q.t1;}}
  };
  O.sampleMotion=(a,now)=>motionSample(a,now);
  O.renderPosition=a=>{
    pruneMotion(a);
    const q=motionSample(a);
    if(Number.isFinite(q.phase))a.netStepPhase=q.phase;
    if(q.moving&&Number.isFinite(q.face)){a.netMoveFace=q.face;a.netRunSegment=q.stepMs<=TICK_MS/2+5;}
    else{a.netMoveFace=null;a.netRunSegment=false;}
    return q.p;
  };
  O.isMoving=a=>motionSample(a).moving;
  function position(a,p,initial){
    const now=performance.now(),nodes=(p.motion||[]).map(t=>[t.x+.5,t.y+.5]),end=[p.x+.5,p.y+.5],before=motionSample(a,now);
    if(initial||Math.hypot(before.p[0]-end[0],before.p[1]-end[1])>6||now-O.lastSnapshot>2500){
      emptyMotion(a,p.motion_tick);a.netRenderAnchor=end;
    }else if(nodes.length>1){
      appendMotion(a,nodes,p.motion_tick,now);
    }else if(before.done&&Math.hypot(before.p[0]-end[0],before.p[1]-end[1])>.75){
      // Respawn/teleport/correction. A tile path is never synthesized client-side.
      emptyMotion(a,p.motion_tick);a.netRenderAnchor=end;
    }else if(a.netMotion){
      a.netMotion.lastTick=Math.max(a.netMotion.lastTick??-1,p.motion_tick??-1);
    }
    a.netMotionTick=p.motion_tick;a.x=p.x;a.y=p.y;a.hp=clamp(p.hp,0,a.maxHp);a.dead=false;a.kills=p.kills;a.deaths=p.deaths;a.netZone=p.zone;a.netTargetId=p.attack_target||null;
    a.simulated=!!p.simulated;a.level=p.level||a.level;a.spec=Number.isFinite(p.spec)?p.spec:a.spec;
    const kind=LOADOUTS[p.loadout]?p.loadout:'main';if(a.netLoadout!==kind){applyLoadout(a,kind);a.inv=new Array(28).fill(null);a.netLoadout=kind;}
    if(p.weapon&&ITEMS[p.weapon]&&a.eq.weapon?.id!==p.weapon){a.eq.weapon={id:p.weapon,n:1};recalcBonus(a);}
    a.autocast=p.spell||null;a.overhead=p.overhead||null;
    if(a.anim?.type==='death'&&a.hp>0)a.anim=null;
    if(Number.isFinite(p.run))a.run=p.run;
    if(a===G.player){
      if(p.command_seq>=O.seq){a.path=p.destination?[p.destination]:[];}
      const old=O.zone;O.zone=p.zone||O.zoneAt(p.x,p.y);
      if(!initial&&old!==O.zone)O.notice('zone-'+O.zone,O.zone==='pvp'?'PvP zone: players can attack beyond the stone boundary.':'Grand Exchange: you are protected inside the stone boundary.',1500);
    }
  }
  O.applySnapshot=msg=>{
    if(!O.connected||!Number.isSafeInteger(msg.tick)||msg.tick<O.lastTick||!Array.isArray(msg.players))return;
    const initial=!O.ready;O.lastTick=msg.tick;O.diagnostics.snapshots++;const seen=new Set();
    for(const p of msg.players){if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||!inMap(p.x,p.y))continue;
      if(p.id===O.id){position(G.player,p,initial);O.ready=true;}
      else{seen.add(p.id);const fresh=!O.remotes.has(p.id);position(O.actorFor(p),p,fresh);}}
    for(const[id,a]of O.remotes)if(!seen.has(id)){G.actors=G.actors.filter(x=>x!==a);if(G.player.target===a)G.player.target=null;O.remotes.delete(id);}
    const actors=[G.player,...O.remotes.values()];
    for(const actor of actors){
      const target=actor.netTargetId?(actor.netTargetId===O.id?G.player:O.remotes.get(actor.netTargetId)):null;
      actor.target=target||null;
      if(target&&!O.isMoving(actor)){
        actor.face=Math.atan2(target.x-actor.x,target.y-actor.y);
      }
    }
    O.lastSnapshot=performance.now();if(initial&&O.ready){clearTimeout(O.handshakeTimer);Polish.snapCamera=true;if(O.pending){const pending=O.pending;O.pending=null;O.walk(pending.x,pending.y);}}
    O.completeJob();
  };
  O.handle=raw=>{
    let msg;try{msg=JSON.parse(raw);}catch(_){return;}
    if(msg.type==='welcome'){
      if(msg.protocol!==2||msg.world_hash!==O.worldHash()){O.status='Client/world version mismatch — refresh';O.manualClose=true;O.notice('mismatch','The world was updated. Refresh this page before joining.',0);O.ws?.close(1000,'version mismatch');return;}
      O.id=msg.id;O.seq=0;O.lastTick=-1;O.ready=false;O.connected=true;O.connecting=false;O.attempts=0;O.lastRunOn=G.player.runOn;O.lastPing=0;
      O.safeZone=msg.safe_zone;O.serverVersion=msg.version;O.status='OLDSKOOL World 1 · connected';G.player.netId=msg.id;
      try{localStorage.setItem(tokenKey(G.player.name),msg.resume_token);}catch(_){}
      O.notice('connected','Connected to World 1. Inside the Grand Exchange is safe.',1000);return;
    }
    if(msg.type==='snapshot'){O.applySnapshot(msg);return;}
    if(msg.type==='route'){
      if(msg.seq<O.seq)return;
      if(Array.isArray(msg.path)){G.player.path=msg.path;O.destination=msg.path.at(-1)||null;}O.completeJob();return;
    }
    if(msg.type==='attack_visual'){
      const a=msg.attacker_id===O.id?G.player:O.remotes.get(msg.attacker_id),t=msg.target_id===O.id?G.player:O.remotes.get(msg.target_id);if(!a||!t)return;
      const ap=Online.renderPosition(a),tp=Online.renderPosition(t);a.face=Math.atan2(tp[0]-ap[0],tp[1]-ap[1]);
      const style=msg.style,weapon=msg.weapon||'whip';a.anim={type:style==='magic'?'cast':style==='ranged'?'bow':weapon==='gmaul'?'crush':weapon==='dds'?'stab':'slash',t0:G.now,dur:style==='melee'?450:560};
      if(msg.special){a.anim={type:weapon==='gmaul'?'crush':weapon==='dds'?'stab':'slash',t0:G.now,dur:540};G.effects.push({type:'spec',weapon,x:ap[0],y:ap[1],t0:G.now,dur:560});}
      if(style==='ranged')G.projs.push({kind:weapon==='msb'?'arrow':'bolt',sx:ap[0],sy:ap[1],tgt:t,t0:G.now+80,t1:G.now+Math.max(360,(msg.delay_ticks||1)*TICK_MS*.8)});
      if(style==='magic'){const ice=(msg.spell||'').startsWith('ice');G.projs.push({kind:ice?'ice':'blood',sx:ap[0],sy:ap[1],tgt:t,t0:G.now+80,t1:G.now+500});}
      return;
    }
    if(msg.type==='resident_chat'){const a=O.remotes.get(msg.player_id);if(a){a.chat={text:msg.text,until:G.now+3400};publicMsg('[Sim] '+msg.name,msg.text,false);}return;}
    if(msg.type==='combat'){
      O.lastCombat=msg;const t=msg.target_id===O.id?G.player:O.remotes.get(msg.target_id),a=msg.attacker_id===O.id?G.player:O.remotes.get(msg.attacker_id);
      if(t){t.hp=clamp(msg.target_hp,0,t.maxHp);addSplat(t,msg.damage);t.hpBarUntil=G.now+4200;const tp=Online.renderPosition(t);if(msg.style==='magic')G.effects.push({type:'ice',x:tp[0],y:tp[1],t0:G.now,dur:650});}
      if(a&&t&&!Online.isMoving(a))a.face=Math.atan2(t.x-a.x,t.y-a.y);
      if(msg.killed&&t===G.player){O.job=O.pending=null;G.player.target=null;G.player.path=[];G.player.netMotion=null;Polish.snapCamera=true;gameMsg('You were defeated and returned to the Grand Exchange.');}
      return;
    }
    if(msg.type==='chat'){const a=msg.player_id===O.id?G.player:O.remotes.get(msg.player_id);if(a)a.chat={text:msg.text,until:G.now+3400};publicMsg(msg.name,msg.text,msg.player_id===O.id);return;}
    if(msg.type==='error'){
      O.lastError=msg;O.diagnostics.errors++;
      if(['client_update_required','profile_in_use','bad_name'].includes(msg.code)){O.manualClose=true;O.status=msg.message;}
      if(msg.code==='unreachable'){G.player.path=[];O.job=null;}
      O.notice(msg.code,'Server: '+msg.message);return;
    }
  };
  O.walk=(x,y,keepJob=false)=>{
    if(!Number.isInteger(x)||!Number.isInteger(y)||!inMap(x,y))return;
    G.player.target=G.player.follow=null;G.spellSel=null;
    if(!keepJob)O.job=null;
    if(!usable()){O.notice('connecting','Wait for the world connection before moving.');return;}
    O.seq++;O.diagnostics.sentWalks++;O.destination={x,y};
    G.player.path=findPath(G.player.x,G.player.y,(px,py)=>px===x&&py===y,{x,y},9216)||[];
    send({type:'walk',x,y,seq:O.seq,run_on:G.player.runOn});O.lastRunOn=G.player.runOn;
  };
  O.cancel=()=>{O.job=null;O.destination=null;G.player.path=[];G.player.target=G.player.follow=null;if(usable())send({type:'stop',seq:++O.seq});};
  O.completeJob=()=>{const j=O.job;if(!j||!usable())return;if(j.near(G.player)){O.job=null;G.player.path=[];send({type:'stop',seq:++O.seq});j.run();}};
  O.doJob=(x,y,near,run)=>{
    if(!usable())return;O.job=null;G.player.target=null;
    if(near(G.player)){O.cancel();run();return;}
    const p=findPath(G.player.x,G.player.y,(x,y)=>near({x,y}),null,9216);
    if(!p?.length){O.notice('unreachable','You cannot reach that object.');return;}
    O.job={near,run};const last=p.at(-1);O.walk(last.x,last.y,true);
  };
  O.follow=a=>{if(!usable()||!a?.netId)return;O.job=null;G.player.target=null;send({type:'follow',target_id:a.netId,seq:++O.seq});};
  O.combatPayload=()=>{const p=G.player,w=p.eq?.weapon?.id||'unarmed',it=ITEMS[w]||{},spell=p.pendingSpell||(p.autocast&&it.magic?p.autocast:null),style=spell?'magic':it.ranged?'ranged':'melee';return{weapon:w,style,spell,special:!!p.specOn,overhead:p.overhead||null};};
  O.attack=a=>{if(!O.canAttack(a)){O.notice('safe','Players are protected inside the Grand Exchange.');return;}O.job=null;G.player.target=a;const payload=O.combatPayload();send({type:'attack',target_id:a.netId,...payload});if(G.player.pendingSpell)G.player.pendingSpell=null;if(payload.special)G.player.specOn=false;O.lastCombatSignature=null;};
  O.sendChat=text=>{text=String(text||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,120);if(text&&usable())send({type:'chat',text});};
  O.requestResync=()=>{if(usable()&&performance.now()-(O.lastResync||0)>1000){O.lastResync=performance.now();send({type:'resync'});}};
  O.frame=()=>{
    if(!O.active)return;const now=performance.now();
    if(usable()){
      if(G.player.runOn!==O.lastRunOn){O.lastRunOn=G.player.runOn;send({type:'run',enabled:O.lastRunOn});}
      const combat=O.combatPayload(),sig=[combat.weapon,combat.style,combat.spell||'',combat.overhead||'',combat.special?1:0].join('|');
      if(sig!==O.lastCombatSignature){O.lastCombatSignature=sig;send({type:'combat_state',...combat});}
      if(now-O.lastPing>15000){send({type:'ping',nonce:Math.floor(now)});O.lastPing=now;}
      if(now-O.lastSnapshot>25000){O.ws?.close();}
      for(const a of [G.player,...O.remotes.values()])if(!O.isMoving(a))a.seg=[];
    }
  };
  O.tick=()=>{O.completeJob();};
  O.drawBoundary=mesh=>{
    if(!O.active)return;const z=O.safeZone,a=z.apothem,k=Math.SQRT2-1;
    const points=[[a,k*a],[k*a,a],[-k*a,a],[-a,k*a],[-a,-k*a],[-k*a,-a],[k*a,-a],[a,-k*a]].map(([x,y])=>[z.center_x+x,z.center_y+y]);
    for(let i=0;i<8;i++){const[x1,y1]=points[i],[x2,y2]=points[(i+1)%8],l=Math.hypot(x2-x1,y2-y1),nx=-(y2-y1)/l*.04,ny=(x2-x1)/l*.04,v=(x,y)=>[x,groundH(x,y)+.035,-y];mesh.quad(v(x1+nx,y1+ny),v(x2+nx,y2+ny),v(x2-nx,y2-ny),v(x1-nx,y1-ny),O.zone==='pvp'?0xcf593d:0xd5c17c,false,null,145);}
  };
  return O;
})();
// Offline rules remain the original rules. Online movement never runs local AI.
const netBase={cmdWalk,cmdJob,cmdFollow,cmdAttack,stepActor,renderPos,chatCommand};
cmdWalk=(x,y)=>Online.active?Online.walk(x,y):netBase.cmdWalk(x,y);
cmdJob=(x,y,near,run,label)=>Online.active?Online.doJob(x,y,near,run):netBase.cmdJob(x,y,near,run,label);
cmdFollow=a=>Online.active&&a?.onlineRemote?Online.follow(a):netBase.cmdFollow(a);
cmdAttack=a=>{if(Online.active&&a?.onlineRemote){if(G.spellSel){G.player.pendingSpell=G.spellSel;G.spellSel=null;}Online.attack(a);}else netBase.cmdAttack(a);};
stepActor=a=>{if(Online.active&&(a===G.player||a.onlineRemote)){for(const k of ['eatCd','potCd','atkCd'])if(a[k]>0)a[k]--;return;}netBase.stepActor(a);};
renderPos=(a,frac)=>Online.active&&(a===G.player||a.onlineRemote)?Online.renderPosition(a):netBase.renderPos(a,frac);
chatCommand=t=>{if(Online.active&&!String(t).startsWith('::'))Online.sendChat(t);else netBase.chatCommand(t);};

const netLocalDamage=applyHit,netLocalBots=setBotCount;
applyHit=h=>{if(Online.active&&(h?.src?.onlineRemote||h?.dst===G.player||h?.dst?.onlineRemote))return;netLocalDamage(h);};
setBotCount=n=>netLocalBots(Online.active?0:n);

const netLocalEat=eatFood;
eatFood=(a,i)=>{if(Online.active&&a===G.player){const item=a.inv[i];if(item&&ITEMS[item.id]?.food){const out=netLocalEat(a,i);send({type:'eat'});return out;}}return netLocalEat(a,i);};
