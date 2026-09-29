'use strict';
/* OLDSKOOL online-world bridge.
 * The browser predicts walking for responsiveness, but the Rust server owns
 * accepted position, PvP eligibility, hit resolution, HP and respawn.
 */
const Online = (() => {
  const O={
    active:false,connected:false,connecting:false,id:null,ws:null,
    endpoint:'wss://oldskool-api.129.146.39.132.sslip.io/ws',
    healthEndpoint:'https://oldskool-api.129.146.39.132.sslip.io/health',
    serverVersion:null,status:'Online world not connected',zone:'safe',
    safeZone:{center_x:48,center_y:48,apothem:9,shape:'octagon'},
    remotes:new Map(),lastX:null,lastY:null,lastPing:0,lastSnapshot:0,
    reconnectTimer:null,manualClose:false,lastCombat:null,lastError:null
  };
  const tokenKey=name=>'oldskool.resume.'+String(name||'player').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,20);
  const stableKit=id=>{
    let h=2166136261;for(const c of String(id)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
    const pick=(arr,n)=>arr[Math.abs((h>>n)%arr.length)];
    return {skin:pick(SKIN,0),hair:pick(HAIR,4),shirt:pick(SHIRT,8),pants:pick([0x3a3a2a,0x2a3a5a,0x5a3a2a,0x2a2a2a,0x4a4a5a],12),boots:0x3a2a1a,hairStyle:Math.abs(h)%3};
  };
  const zoneAt=(x,y)=>{
    const z=O.safeZone||{center_x:48,center_y:48,apothem:9},dx=x-z.center_x,dy=y-z.center_y,k=Math.SQRT1_2;
    const d=Math.max(Math.abs(dx),Math.abs(dy),Math.abs((dx+dy)*k),Math.abs((dx-dy)*k));
    return d<=z.apothem?'safe':'pvp';
  };
  O.zoneAt=zoneAt;
  O.canAttack=a=>O.active&&O.connected&&a&&a.onlineRemote&&O.zone==='pvp'&&(a.netZone||zoneAt(a.x,a.y))==='pvp';
  O.checkHealth=async()=>{
    try{
      const c=new AbortController(),timer=setTimeout(()=>c.abort(),3000);
      const r=await fetch(O.healthEndpoint,{cache:'no-store',signal:c.signal});clearTimeout(timer);
      if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();
      O.status='World online · '+j.players+' player'+(j.players===1?'':'s')+' · '+j.tick_ms+' ms tick';
      O.serverVersion=j.version;return j;
    }catch(_){O.status='Online world unavailable';return null;}
  };
  O.start=name=>{
    O.stop(true);
    startGame(name,'arena',{onlineBootstrap:true,skipSave:true});
    setBotCount(0);
    O.active=true;O.manualClose=false;O.status='Connecting to OLDSKOOL World 1…';
    G.player.x=48;G.player.y=42;G.player.path.length=0;G.player.seg.length=0;G.player.protectUntil=0;
    Profiles.status='OLDSKOOL online profile · local gear backup enabled';
    gameMsg('Connecting to OLDSKOOL World 1…');
    gameMsg('Grand Exchange interior is safe. PvP is enabled beyond the stone boundary.');
    O.connect();
  };
  O.connect=()=>{
    if(!O.active||O.connecting||O.connected)return;
    O.connecting=true;O.status='Connecting to OLDSKOOL World 1…';
    let ws;
    try{ws=new WebSocket(O.endpoint);}catch(_){O.connecting=false;O.status='Could not open the online world';return;}
    O.ws=ws;
    ws.addEventListener('open',()=>{
      if(ws!==O.ws)return;O.connecting=false;
      let resume_token=null;try{resume_token=localStorage.getItem(tokenKey(G.player.name));}catch(_){}
      ws.send(JSON.stringify({type:'hello',name:G.player.name,resume_token}));
    });
    ws.addEventListener('message',ev=>{if(ws===O.ws)O.handle(ev.data);});
    ws.addEventListener('close',()=>{
      if(ws!==O.ws)return;O.connected=false;O.connecting=false;O.id=null;O.ws=null;O.clearRemotes();
      if(!O.active||O.manualClose)return;
      O.status='Connection lost · retrying…';gameMsg('Connection to OLDSKOOL was lost. Reconnecting…');
      clearTimeout(O.reconnectTimer);O.reconnectTimer=setTimeout(()=>O.connect(),1800);
    });
    ws.addEventListener('error',()=>{if(ws===O.ws)O.status='Online connection error';});
  };
  O.stop=silent=>{
    O.manualClose=true;clearTimeout(O.reconnectTimer);O.reconnectTimer=null;
    if(O.ws){try{O.ws.close(1000,'leaving world');}catch(_){}}
    O.ws=null;O.connected=false;O.connecting=false;O.id=null;O.active=false;O.clearRemotes();
    if(!silent)O.status='Online world not connected';
  };
  O.clearRemotes=()=>{
    for(const a of O.remotes.values()){const i=G.actors.indexOf(a);if(i>=0)G.actors.splice(i,1);}
    O.remotes.clear();
  };
  O.actorFor=p=>{
    let a=O.remotes.get(p.id);
    if(!a){
      a=newActor({name:p.name,isBot:false,x:Math.round(p.x),y:Math.round(p.y),stats:PROFILES.main,kit:stableKit(p.id)});
      a.onlineRemote=true;a.netId=p.id;a.netZone=p.zone;a.autoRetal=false;a.runOn=true;applyLoadout(a,'main');
      a.inv=new Array(28).fill(null);a.prayers.clear();G.actors.push(a);O.remotes.set(p.id,a);
    }
    return a;
  };
  O.applySnapshot=msg=>{
    O.lastSnapshot=performance.now();const seen=new Set();
    for(const p of msg.players||[]){
      if(p.id===O.id){
        const me=G.player,dx=p.x-me.x,dy=p.y-me.y;
        if(Math.hypot(dx,dy)>.75){me.seg=[{fx:me.x,fy:me.y,tx:p.x,ty:p.y}];me.x=Math.round(p.x);me.y=Math.round(p.y);me.path.length=0;}
        me.hp=clamp(p.hp,0,me.maxHp);me.kills=p.kills;me.deaths=p.deaths;O.zone=p.zone||zoneAt(p.x,p.y);continue;
      }
      seen.add(p.id);const a=O.actorFor(p),oldX=a.x,oldY=a.y,nx=Math.round(p.x),ny=Math.round(p.y);
      a.seg=(oldX===nx&&oldY===ny)?[]:[{fx:oldX,fy:oldY,tx:nx,ty:ny}];a.x=nx;a.y=ny;a.hp=clamp(p.hp,0,a.maxHp);a.kills=p.kills;a.deaths=p.deaths;a.netZone=p.zone||zoneAt(nx,ny);a.dead=false;
    }
    for(const [id,a] of [...O.remotes])if(!seen.has(id)){const i=G.actors.indexOf(a);if(i>=0)G.actors.splice(i,1);O.remotes.delete(id);}
  };
  O.handle=raw=>{
    let msg;try{msg=JSON.parse(raw);}catch(_){return;}
    if(msg.type==='welcome'){
      O.id=msg.id;O.connected=true;O.connecting=false;O.serverVersion=msg.version;O.safeZone=msg.safe_zone||O.safeZone;O.status='OLDSKOOL World 1 · connected';
      G.player.netId=msg.id;O.lastX=G.player.x;O.lastY=G.player.y;
      try{localStorage.setItem(tokenKey(G.player.name),msg.resume_token);}catch(_){}
      gameMsg('Connected to OLDSKOOL World 1.');return;
    }
    if(msg.type==='snapshot'){O.applySnapshot(msg);return;}
    if(msg.type==='zone_transition'){
      O.zone=msg.zone;gameMsg(msg.zone==='pvp'?'You have crossed into the PvP zone. Other players can attack you.':'You are inside the Grand Exchange safe zone.');return;
    }
    if(msg.type==='combat'){
      O.lastCombat=msg;
      const target=msg.target_id===O.id?G.player:O.remotes.get(msg.target_id),attacker=msg.attacker_id===O.id?G.player:O.remotes.get(msg.attacker_id);
      if(target){
        target.hp=clamp(msg.target_hp,0,target.maxHp);addSplat(target,msg.damage||0);target.hpBarUntil=G.now+4200;
        if(msg.killed){target.anim={type:'death',t0:G.now,dur:900};if(target===G.player)gameMsg('You were defeated and returned to the Grand Exchange.');}
      }
      if(attacker&&target){attacker.face=Math.atan2(target.x-attacker.x,target.y-attacker.y);attacker.anim={type:'slash',t0:G.now,dur:450};}
      return;
    }
    if(msg.type==='chat'){const a=msg.player_id===O.id?G.player:O.remotes.get(msg.player_id);if(a)a.chat={text:msg.text,until:G.now+3400};publicMsg(msg.name,msg.text,msg.player_id===O.id);return;}
    if(msg.type==='error'){O.lastError=msg;gameMsg('Server: '+msg.message);if(msg.code==='move_rejected')O.requestResync();return;}
  };
  O.tick=()=>{
    if(!O.active||!O.connected||!O.ws||O.ws.readyState!==WebSocket.OPEN)return;
    const p=G.player;
    if(p.x!==O.lastX||p.y!==O.lastY){
      O.ws.send(JSON.stringify({type:'move',x:p.x,y:p.y,seq:G.tick}));O.lastX=p.x;O.lastY=p.y;
    }
    if(G.now-O.lastPing>5000){O.lastPing=G.now;O.ws.send(JSON.stringify({type:'ping',nonce:G.tick}));}
  };
  O.requestResync=()=>{O.lastX=null;O.lastY=null;};
  O.attack=a=>{
    if(!O.connected||!a?.netId)return;
    if(!O.canAttack(a)){gameMsg('Players are protected inside the Grand Exchange stone boundary.');return;}
    O.ws.send(JSON.stringify({type:'attack',target_id:a.netId}));
  };
  O.sendChat=text=>{
    text=String(text||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,120);if(!text)return;
    if(O.connected&&O.ws?.readyState===WebSocket.OPEN)O.ws.send(JSON.stringify({type:'chat',text}));
    else gameMsg('You are not connected to the online world.');
  };
  O.drawBoundary=mesh=>{
    if(!O.active)return;
    const z=O.safeZone,a=z.apothem,k=Math.SQRT2-1,cx=z.center_x,cy=z.center_y;
    const pts=[[a,k*a],[k*a,a],[-k*a,a],[-a,k*a],[-a,-k*a],[-k*a,-a],[k*a,-a],[a,-k*a]].map(([x,y])=>[cx+x,cy+y]);
    const col=O.zone==='pvp'?0xd0442f:0xd8c273,alpha=O.zone==='pvp'?190:135,w=.055;
    for(let i=0;i<8;i++){
      const [x1,y1]=pts[i],[x2,y2]=pts[(i+1)%8],dx=x2-x1,dy=y2-y1,l=Math.hypot(dx,dy)||1,nx=-dy/l*w,ny=dx/l*w;
      const v=(x,y)=>[x,groundH(x,y)+.035,-y];
      mesh.quad(v(x1+nx,y1+ny),v(x2+nx,y2+ny),v(x2-nx,y2-ny),v(x1-nx,y1-ny),col,false,null,alpha);
    }
  };
  return O;
})();

const onlineChatCommand=chatCommand;
chatCommand=t=>{
  if(Online.active&&!String(t).startsWith('::')){Online.sendChat(t);return;}
  onlineChatCommand(t);
};
