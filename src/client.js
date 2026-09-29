'use strict';
/* Integrated classic client. Every mapped region points to an existing game
 * action; the 600 ms simulation, item rules and save format are unchanged. */
const Client = (() => {
  const C={composed:true,mobile:false,regions:[],panel:null,menu:null,dialog:null,withdrawQty:1,width:0,height:0,compact:false,hover:null,chatCache:null};
  const el=(tag,props={},parent)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(props)){if(k==='text')e.textContent=v;else if(k==='class')e.className=v;else if(k==='onClick')e.addEventListener('click',v);else e[k]=v;}if(parent)parent.appendChild(e);return e;};
  const button=(text,fn,parent,disabled=false)=>el('button',{type:'button',text,onClick:fn,disabled},parent);
  const refresh=fn=>()=>{fn();C.renderPanel();};
  const style=`
    :root{color-scheme:dark;--ink:#eadfc0;--muted:#b8aa83;--gold:#dcc281;--edge:#796b4b;--bg:#342d21}
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#221d14;color:var(--ink);font-family:Georgia,'Times New Roman',serif}
    button,input,select,textarea{font:inherit}button{color:#eaddbd;background:linear-gradient(#675b41,#423723);border:1px solid #1a150d;border-radius:2px;box-shadow:inset 0 1px #a79b76,inset 1px 0 #807354,inset -1px -2px #292113,0 0 0 1px #796b4c;padding:9px 13px;min-height:44px;text-shadow:1px 1px #000;cursor:pointer;touch-action:manipulation}
    button:hover{filter:brightness(1.16)}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #edcb68;outline-offset:2px}button:disabled{opacity:.45;cursor:default}
    input,select,textarea{width:100%;min-height:44px;background:#201b13;border:2px ridge #877652;color:#f0e4c7;border-radius:0;padding:8px}input[type=file]{font-size:13px}textarea{min-height:120px;resize:vertical}
    #client-surface{position:fixed;inset:0;z-index:3;touch-action:none;display:block}
    #client-bar,#client-footer{position:fixed;inset:0;z-index:20;pointer-events:none}
    #client-bar .hud-hit{position:absolute;min-height:0;min-width:0;padding:0;margin:0;border:0;background:none;box-shadow:none;border-radius:0;pointer-events:auto;touch-action:manipulation}
    #client-bar .hud-hit:hover{filter:none}#client-bar .hud-hit:focus-visible{outline:2px solid #e6cb89;outline-offset:-3px}
    .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    #client-shade{position:fixed;inset:0;z-index:40;background:#080704a6;display:none;align-items:center;justify-content:center;padding:14px}
    #client-panel{position:relative;width:min(760px,100%);max-height:calc(100dvh - 28px);overflow:auto;border:7px ridge #71674d;border-radius:0;background:var(--brown-texture,#3e3529);padding:22px;box-shadow:0 0 0 2px #17120a,0 18px 70px #000b;overscroll-behavior:contain;scrollbar-color:#948365 #282114}
    #client-panel h1{font-size:29px;font-weight:normal;color:#e8cf8c;text-align:center;text-shadow:2px 2px #100b04;margin:4px 45px 20px}#client-panel h2{font-size:18px;font-weight:normal;margin:15px 0 10px;color:#f0d691;text-shadow:1px 1px #000}#client-panel p{line-height:1.55;margin:10px 0;color:#d4c59f}.client-close{position:absolute;right:10px;top:8px;min-width:36px;min-height:32px!important;background:linear-gradient(#863e2e,#4e1e14);padding:2px 10px}
    .client-lead{text-align:center;font-size:12px;color:#ae9b6b;letter-spacing:1.5px}.client-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:14px 0}.client-card{background:var(--paper-texture,#c5b080);border:3px ridge #81704c;padding:14px;border-radius:0;box-shadow:inset 0 0 14px #49311466;color:#332513}.client-card h2{color:#462a12!important;text-shadow:none!important;margin-top:0!important}.client-card small{display:block;color:#49351c;margin:7px 0 12px;line-height:1.5;font-size:13px}.client-card progress{width:100%;height:12px;accent-color:#807037}.client-card label{display:block;color:#49351c;margin:10px 0 5px;font-size:14px}.client-controls{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.client-help{font-size:13px;color:#bbac86!important}
    .client-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px}.client-items button{font-size:12px;min-height:82px;padding:5px;overflow-wrap:anywhere;background:var(--brown-texture,#3e3529)}.client-items canvas{display:block;position:static!important;width:32px;height:32px;margin:0 auto 6px;image-rendering:pixelated}.client-message{padding:10px;border:2px groove #8d7b53;background:#2a2115;color:#e1c68e;font-size:14px;margin:12px 0}
    .oldskool-logo{text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:clamp(34px,7vw,74px);font-weight:bold;letter-spacing:-3px;color:#d8c081;text-shadow:0 3px #23170b,2px 0 #5a4524,-2px 0 #5a4524,0 -2px #f0dfaa;margin:4px 0 3px}.oldskool-sub{text-align:center;color:#9e8d68;font-size:12px;letter-spacing:4px;margin-bottom:18px}.world-online{border-color:#9d8445!important;box-shadow:inset 0 0 18px #6c4a1d55}.world-status{display:flex;align-items:center;gap:8px;justify-content:center;color:#d7c58d;font-size:13px;margin:6px 0 14px}.world-dot{width:9px;height:9px;border-radius:50%;background:#8d2b22;box-shadow:0 0 5px #000}.world-dot.online{background:#63a33f;box-shadow:0 0 6px #89d65b}
    #client-context{position:fixed;z-index:35;display:none;max-width:calc(100vw - 12px);width:max-content;min-width:160px;max-height:65dvh;overflow:auto;background:#5d5447;border:2px solid #100d09;box-shadow:0 3px 12px #0008;padding:1px;color:#fff;font-size:14px;scrollbar-color:#a39168 #2d2519}#client-context strong{display:block;background:#100d09;color:#c4b79a;padding:5px 8px;font-family:Georgia,serif;font-weight:normal}#client-context button{display:block;width:100%;text-align:left;border:0;background:transparent;box-shadow:none;border-radius:0;padding:4px 9px;color:#fff;min-height:30px;font-family:Georgia,serif;white-space:nowrap}#client-context button:hover{color:#ffef60;background:#746856}
    #client-dialog{position:fixed;z-index:34;display:none;background:var(--paper-texture,#c9b586);color:#2e2011;border:6px ridge #76674b;padding:12px;max-height:60dvh;overflow:auto}#client-dialog strong{display:block;text-align:center;font-weight:normal;color:#623b15;font-size:18px}#client-dialog p{font-size:15px;text-align:center;margin:6px 0}#client-dialog button{display:block;width:100%;box-shadow:none;border:0;border-radius:0;min-height:32px;background:none;color:#25248b;text-shadow:none;margin:2px 0;padding:4px}
    #classic-tooltip{position:fixed;pointer-events:none;z-index:36;display:none;max-width:min(300px,calc(100vw - 16px));overflow-wrap:anywhere;padding:8px;color:#211809;background:#c8b88a;border:1px solid #130e07;font-size:14px}
    @media(pointer:coarse){#client-context button{min-height:44px}#client-dialog button{min-height:42px}}
    @media(max-width:580px){#client-panel{padding:12px 10px}#client-panel h1{font-size:23px;margin-left:20px;margin-right:35px}.client-grid{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}button{font-size:14px}}
  `;
  C.init=()=>{
    el('style',{text:style},document.head);
    document.documentElement.style.setProperty('--paper-texture','url('+Classic.texture('paper').toDataURL()+')');
    document.documentElement.style.setProperty('--brown-texture','url('+Classic.texture('brown').toDataURL()+')');
    C.surface=el('canvas',{id:'client-surface'},document.body);C.ctx=C.surface.getContext('2d');
    C.bar=el('div',{id:'client-bar'},document.body);C.footer=el('div',{id:'client-footer'},C.bar);
    C.bar.setAttribute('aria-label','Classic game interface');C.footer.setAttribute('aria-label','Game panels');
    C.status=el('div',{id:'client-status',class:'sr-only'},document.body);C.status.setAttribute('role','status');C.status.setAttribute('aria-live','polite');
    C.shade=el('div',{id:'client-shade'},document.body);C.root=el('section',{id:'client-panel',role:'dialog'},C.shade);C.root.setAttribute('aria-modal','true');C.root.setAttribute('aria-label','Game menu');
    C.context=el('div',{id:'client-context'},document.body);C.context.setAttribute('role','menu');
    C.dialogRoot=el('div',{id:'client-dialog'},document.body);C.dialogRoot.setAttribute('role','dialog');C.dialogRoot.setAttribute('aria-label','Game conversation');
    C.tooltip=el('div',{id:'classic-tooltip'},document.body);
    C.safeProbe=el('div',{id:'classic-safe-area'},document.body);C.safeProbe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    C.root.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&App.mode==='game'){e.preventDefault();C.close();}
      if(e.key==='Tab'){
        const nodes=[...C.root.querySelectorAll('button:not(:disabled),input,textarea,select,[tabindex="0"]')].filter(x=>x.offsetParent);if(!nodes.length)return;
        if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}
        else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}
      }
    });
    C.context.addEventListener('keydown',e=>{
      const buttons=[...C.context.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);
      if(e.key==='Escape'){UI.menu=null;C.syncMenu();C.surface.focus();e.preventDefault();}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();e.preventDefault();}
    });
    addEventListener('pointermove',e=>{C.pointer={x:e.clientX,y:e.clientY};},{passive:true});
    C.surface.tabIndex=0;C.surface.setAttribute('aria-label','Game world and inventory. Use the game panel buttons for navigation.');
    C.layout();
  };
  const hit=(name,r,fn,parent=C.bar)=>{
    const b=button('',e=>{if(App.mode!=='game'||C.panel)return;fn(e);},parent);b.className='hud-hit';b.title=name;b.setAttribute('aria-label',name);el('span',{class:'sr-only',text:name},b);
    Object.assign(b.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});
    b.onpointerenter=()=>C.hover=name;b.onpointerleave=()=>{C.hover=null;};return b;
  };
  C.selectTab=i=>{UI.tab=i;G.spellSel=null;UI.menu=null;
    if(i===2)C.open('journal');else if(i===11)C.open('menu');else if(i===10)App.logout();
  };
  C.layout=()=>{
    if(!C.surface)return;
    if(typeof Controls!=='undefined')Controls.cancelAll();
    C.width=Math.max(1,document.documentElement.clientWidth||innerWidth);C.height=Math.max(1,innerHeight);
    C.mobile=Profiles.settings.layout==='touch'||(Profiles.settings.layout==='auto'&&matchMedia('(pointer: coarse)').matches);
    const pad=getComputedStyle(C.safeProbe),left=parseFloat(pad.paddingLeft)||0,top=parseFloat(pad.paddingTop)||0,right=parseFloat(pad.paddingRight)||0,bottom=parseFloat(pad.paddingBottom)||0;
    C.L=Classic.layout(C.width-left-right,C.height-top-bottom,C.compact);const L=C.L;
    for(const r of [L.frame,L.world,L.chat,L.channels,L.map,L.top,L.bottom,L.panelFrame,L.panel,L.mapTransform,L.mapCircle,L.compass,...L.tabs,...L.slots,...L.orbs,...L.utilities,L.quick])if(r){r.x+=left;r.y+=top;}
    C.hover=null;
    C.world=L.world;C.panelRect=L.panel;C.mapRect=L.map;
    C.regions=[{src:{x:VX,y:VY,w:VW,h:VH},dst:L.world,kind:'world'}];
    const scale=Math.min(L.panel.w/PANEL.w,L.panel.h/PANEL.h);
    C.panelContent={x:L.panel.x+(L.panel.w-PANEL.w*scale)/2,y:L.panel.y+(L.panel.h-PANEL.h*scale)/2,w:PANEL.w*scale,h:PANEL.h*scale};
    C.regions.push({src:PANEL,dst:C.panelContent,kind:'panel'});
    for(let i=0;i<28;i++)C.regions.push({src:invSlotRect(i),dst:L.slots[i],kind:'slot'});
    C.regions.push({src:CHAT,dst:L.chat,kind:'chat'});
    C.regions.push({src:{x:MM.cx-MM.r,y:MM.cy-MM.r,w:MM.r*2,h:MM.r*2},dst:{x:L.mapCircle.x-L.mapCircle.r,y:L.mapCircle.y-L.mapCircle.r,w:L.mapCircle.r*2,h:L.mapCircle.r*2},kind:'map'});
    L.tabs.forEach((r,i)=>C.regions.push({src:tabRect(i),dst:r,kind:'tab'}));
    const gl=App.glCanvas;if(gl.parentNode!==document.body)document.body.insertBefore(gl,C.surface);
    document.getElementById('wrap').style.display='none';
    Object.assign(gl.style,{position:'fixed',left:L.world.x+'px',top:L.world.y+'px',width:L.world.w+'px',height:L.world.h+'px',zIndex:'1',imageRendering:Profiles.settings.quality==='low'?'pixelated':'auto'});
    const dpr=Math.min(devicePixelRatio||1,2);C.surface.width=Math.round(C.width*dpr);C.surface.height=Math.round(C.height*dpr);C.surface.style.width=C.width+'px';C.surface.style.height=C.height+'px';C.ctx.setTransform(dpr,0,0,dpr,0,0);C.ctx.imageSmoothingEnabled=false;
    C.back=document.createElement('canvas');C.back.width=Math.ceil(C.width);C.back.height=Math.ceil(C.height);const bg=C.back.getContext('2d');bg.fillStyle='#221d14';bg.fillRect(0,0,C.width,C.height);Classic.background(bg,L);bg.clearRect(L.world.x,L.world.y,L.world.w,L.world.h);
    App.scale=L.world.w/VW;if(App.cam)App.cam.aspect=L.world.w/L.world.h;
    C.bar.replaceChildren(C.footer);C.footer.replaceChildren();C.tabButtons=[];
    L.tabs.forEach((r,i)=>{const label=i===2?'Journal':i===3?'Bag':i===4?'Gear':i===5?'Prayer':i===6?'Magic':i===11?'Menu':TAB_TIP[i];const b=hit(label,r,()=>C.selectTab(i),C.footer);b.dataset.tab=i;C.tabButtons.push([b,i]);});
    const mapCircle=L.mapCircle;
    const mapButton=hit('Walk on minimap',{x:mapCircle.x-mapCircle.r,y:mapCircle.y-mapCircle.r,w:mapCircle.r*2,h:mapCircle.r*2},e=>{const pt=C.toGame(e.clientX,e.clientY);if(pt.x>=0)minimapClick(pt.x,pt.y);});mapButton.style.borderRadius='50%';
    ['Bank','Skills','World map'].forEach((name,i)=>hit(name,L.utilities[i],()=>{
      if(i===0){
        if(Online.active){
          const o=WORLD.objs.filter(o=>o.kind==='bank').sort((a,b)=>dist2(a.x,a.y,G.player.x,G.player.y)-dist2(b.x,b.y,G.player.x,G.player.y))[0];
          if(o)cmdJob(o.x,o.y,a=>dist2(a.x,a.y,o.x,o.y)<=2,()=>openBank(o));
        }else Expedition.goBank();
      }else C.open(i===1?'skills':'map');
    }));
    hit('Face north',L.compass,()=>{if(App.cam)App.cam.yaw=0;});
    const orbNames=['Hitpoints: eat food','Quick prayers','Toggle run','Special attack'];
    L.orbs.forEach((r,i)=>hit(orbNames[i],r,()=>{
      const a=G.player;if(!a)return;
      if(i===0)eatFood(a,findFoodIdx(a));
      if(i===1){if(a.prayers.size){UI.lastPrayers=[...a.prayers];for(const id of UI.lastPrayers)togglePrayer(a,id,true);}else for(const id of UI.lastPrayers)togglePrayer(a,id,true);}
      if(i===2)a.runOn=!a.runOn;if(i===3&&weaponOf(a).spec)a.specOn=!a.specOn;
    }));
    C.channelRects=[];const ch=L.channels,reportW=ch.w*.225,gap=3,cw=(ch.w-reportW-gap*6)/6;
    for(let i=0;i<6;i++){const r={x:ch.x+i*(cw+gap),y:ch.y,w:cw,h:ch.h};C.channelRects.push(r);hit(['All','Game','Public','Private','Clan','Trade'][i],r,()=>{UI.chatTab=i;G.chatScroll=0;C.chatCache=null;if(i>2)gameMsg('This is an offline world. Online '+['','','','private','clan','trade'][i]+' chat is not connected.');});}
    C.reportRect={x:ch.x+ch.w-reportW,y:ch.y,w:reportW,h:ch.h};hit('Report Abuse',C.reportRect,()=>C.open('report'));
    const chat=L.chat,line=clamp(C.width/85,12,17)*1.22;C.chatInputRect={x:chat.x+7,y:chat.y+chat.h-line-8,w:chat.w-32,h:line+2};
    hit('Type a chat message',C.chatInputRect,()=>C.open('chat'));
    C.scrollUp={x:chat.x+chat.w-25,y:chat.y+8,w:17,h:17};C.scrollDown={x:chat.x+chat.w-25,y:C.chatInputRect.y-21,w:17,h:17};
    if(chat.h>50){hit('Scroll chat up',C.scrollUp,()=>{G.chatScroll+=3;});hit('Scroll chat down',C.scrollDown,()=>{G.chatScroll=Math.max(0,G.chatScroll-3);});}
    C.quickButtons=[];
    if(L.quick){const q=L.quick,keys=['Eat','Potion','Run','Special','Save','Chat','Full screen','Menu'],cols=2,hh=Math.min(46,(q.h-25)/4);keys.forEach((key,i)=>{
      const r={x:q.x+(i%cols)*(q.w/cols),y:q.y+22+Math.floor(i/cols)*hh,w:q.w/cols-2,h:hh-2};C.quickButtons.push({key,r});
      hit(key,r,()=>{const a=G.player;if(key==='Eat')eatFood(a,findFoodIdx(a));else if(key==='Potion'){let i=findPotIdx(a,'prayer');if(i<0)i=findPotIdx(a,'restore');drinkPotion(a,i);}else if(key==='Run')a.runOn=!a.runOn;else if(key==='Special'){if(weaponOf(a).spec)a.specOn=!a.specOn;}else if(key==='Save')Profiles.save(true);else if(key==='Full screen')C.fullscreen();else C.open(key==='Chat'?'chat':'menu');});
    });}
    C.chatCache=null;C.menu=null;C.dialog=null;
    if(typeof Polish!=='undefined')Polish.resize();
  };
  const applicable=r=>(r.kind!=='slot'||UI.tab===3)&&(r.kind!=='panel'||UI.tab!==3);
  C.toGame=(x,y)=>{
    for(const r of C.regions){if(!applicable(r)||!inRect(x,y,r.dst))continue;
      if(r.kind==='map'&&Math.hypot(x-C.L.mapCircle.x,y-C.L.mapCircle.y)>C.L.mapCircle.r)return{x:-100,y:-100};
      return{x:r.src.x+(x-r.dst.x)*r.src.w/r.dst.w,y:r.src.y+(y-r.dst.y)*r.src.h/r.dst.h};
    }return{x:-100,y:-100};
  };
  C.fromGame=(x,y)=>{
    for(const r of C.regions){if(!applicable(r)||!inRect(x,y,r.src))continue;return{x:r.dst.x+(x-r.src.x)*r.dst.w/r.src.w,y:r.dst.y+(y-r.src.y)*r.dst.h/r.src.h};}
    return{x:8,y:8};
  };
  C.fullscreen=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch(_){gameMsg('Fullscreen is unavailable in this browser.');}};
  C.drawMap=p=>{
    const T=C.L.mapTransform,a=G.player,cam=App.cam;p.save();p.translate(T.x,T.y);p.scale(T.s,T.s);p.imageSmoothingEnabled=false;
    p.save();p.beginPath();p.arc(124,84,73,0,TAU);p.clip();
    if(MMCV)p.drawImage(MMCV,51,11,146,146);
    const rp=renderPos(a,clamp((G.now-G.lastTick)/TICK_MS,0,1)),cs=Math.cos(cam.yaw),sn=Math.sin(cam.yaw);
    const mapPoint=(x,y)=>{const dx=4*((x-rp[0])*cs-(y-rp[1])*sn),dy=-4*((x-rp[0])*sn+(y-rp[1])*cs);return{x:124+dx,y:84+dy,inside:dx*dx+dy*dy<69*69};};
    for(const t of WORLD.trees){const s=mapPoint(t.x,t.y);if(s.inside){p.fillStyle='#3b5425';p.beginPath();p.arc(s.x,s.y,3,0,TAU);p.fill();p.fillStyle='#789252';p.fillRect(s.x-2,s.y-2,2,2);}}
    for(const o of WORLD.objs){const s=mapPoint(o.x+.5,o.y+.5);if(!s.inside)continue;
      p.fillStyle=o.kind==='bank'?'#e4d8a8':o.expedition?'#baca8d':'#846031';p.strokeStyle='#302311';p.lineWidth=1;p.fillRect(Math.round(s.x)-3,Math.round(s.y)-3,6,6);p.strokeRect(Math.round(s.x)-3,Math.round(s.y)-3,6,6);
      if(o.kind==='bank'){p.fillStyle='#4e472e';p.fillRect(s.x-2,s.y,4,1);}
    }
    for(const other of G.actors){if(other===a||other.dead)continue;const s=mapPoint(other.x+.5,other.y+.5);if(!s.inside)continue;p.fillStyle='#211a0c';p.fillRect(s.x-2,s.y-2,4,4);p.fillStyle=other.npc?'#fff369':other.monster?'#eabd6b':'#f4f0d6';p.fillRect(s.x-1,s.y-1,3,3);}
    for(const g of G.ground){const s=mapPoint(g.x+.5,g.y+.5);if(s.inside){p.fillStyle='#ce4530';p.fillRect(s.x-1,s.y-1,2,2);}}
    if(Expedition.waypoint){const s=mapPoint(Expedition.waypoint.x+.5,Expedition.waypoint.y+.5);if(s.inside){p.strokeStyle='#ffe86e';p.lineWidth=2;p.beginPath();p.arc(s.x,s.y,5,0,TAU);p.stroke();}}
    if(typeof Online!=='undefined'&&Online.active){
      const z=Online.safeZone,a=z.apothem,k=Math.SQRT2-1,pts=[[a,k*a],[k*a,a],[-k*a,a],[-a,k*a],[-a,-k*a],[-k*a,-a],[k*a,-a],[a,-k*a]].map(([dx,dy])=>mapPoint(z.center_x+dx,z.center_y+dy));
      p.strokeStyle=Online.zone==='pvp'?'#d74a34':'#e6d186';p.lineWidth=1.5;p.beginPath();pts.forEach((q,i)=>i?p.lineTo(q.x,q.y):p.moveTo(q.x,q.y));p.closePath();p.stroke();
    }
    p.fillStyle='#fff';p.fillRect(122,82,4,4);p.restore();Classic.ring(p,124,84,81,8);
    // Compass and resource orbs are stateful; numeric plaques do not cover glyphs.
    p.fillStyle='#b8ab81';p.beginPath();p.arc(27,23,19,0,TAU);p.fill();Classic.ring(p,27,23,24,5);
    p.save();p.translate(27,23);p.rotate(-cam.yaw);p.fillStyle='#c42e26';p.beginPath();p.moveTo(0,-14);p.lineTo(-4,1);p.lineTo(4,1);p.fill();p.fillStyle='#d5d5b9';p.beginPath();p.moveTo(0,14);p.lineTo(-4,-1);p.lineTo(4,-1);p.fill();p.fillStyle='#30466a';p.fillRect(-2,-2,4,4);p.restore();
    const data=[['heart',Math.ceil(a.hp),a.hp/a.maxHp,'#b91a10',1,43],['prayer',Math.ceil(a.pp),a.pp/a.stats.pray,'#504075',1,79],['run',Math.floor(a.run),a.run/100,'#bf9b2c',7,113],['combat',Math.floor(a.spec),a.spec/100,'#5c5940',49,139]];
    for(const [id,n,frac,color,x,y]of data){
      Classic.stone(p,{x,y:y+6,w:35,h:22});Classic.text(p,String(n),x+16,y+22,12,frac<.25?0xff5544:0x75ed40,true,'center');
      const cx=x+46,cy=y+16;const g=p.createRadialGradient(cx-5,cy-7,1,cx,cy,15);g.addColorStop(0,color);g.addColorStop(.68,color);g.addColorStop(1,'#231711');p.fillStyle=g;p.beginPath();p.arc(cx,cy,14,0,TAU);p.fill();Classic.ring(p,cx,cy,17,3);p.drawImage(Classic.icon(id),cx-11,cy-11,22,22);
    }
    for(const [i,id]of ['bank','stats','world'].entries()){const x=224,y=39+i*50;p.fillStyle='#54482e';p.beginPath();p.arc(x,y,17,0,TAU);p.fill();Classic.ring(p,x,y,20,4);p.drawImage(Classic.icon(id),x-12,y-12,24,24);}
    p.restore();
  };
  C.drawInventory=p=>{
    const roomy=C.L?.phoneLandscape;
    G.player.inv.forEach((s,i)=>{
      if(!s||(UI.drag?.active&&UI.drag.from===i))return;
      const r=C.L.slots[i],size=Math.round(Math.min(r.w*(roomy?.82:.72),r.h*(roomy?.94:.86),roomy?68:56)),x=Math.round(r.x+(r.w-size)/2),y=Math.round(r.y+(r.h-size)/2);
      p.drawImage(itemIcon(s.id),x,y,size,size);
      if(ITEMS[s.id].stack){const st=stackText(s.n);Classic.text(p,st.t,x-1,y+Math.min(roomy?14:12,r.h*(roomy?.37:.32)),Math.min(roomy?16:15,Math.max(roomy?11:10,r.h*(roomy?.34:.31))),st.c,true);}
    });
    if(UI.drag?.active){const s=G.player.inv[UI.drag.from];if(s){const pt=C.pointer||C.fromGame(UI.mouse.x,UI.mouse.y),r=C.L.slots[UI.drag.from],size=Math.round(Math.min(r.w*(roomy?.82:.72),r.h*(roomy?.94:.86),roomy?68:56));p.globalAlpha=.85;p.drawImage(itemIcon(s.id),pt.x-size/2,pt.y-size/2,size,size);p.globalAlpha=1;}}
  };
  C.chatLines=(maxWidth,size)=>{
    const latest=G.msgs.at(-1),key=[latest,G.msgs.length,UI.chatTab,maxWidth,size];
    if(C.chatCache&&key.every((v,i)=>v===C.chatCache.key[i]))return C.chatCache.lines;
    const lines=[],scale=size/11;
    for(const m of G.msgs.slice(-100)){
      const filters=['','game','public','private','clan','trade'];if(filters[UI.chatTab]&&m.type!==filters[UI.chatTab])continue;
      const segs=m.type==='public'?[{t:m.name+': ',c:0x211505},{t:m.text,c:0x000099}]:[{t:m.text,c:0x211505}];
      let parts=[],width=0;
      for(const seg of segs){for(const token of stripTags(String(seg.t)).split(/(\s+)/)){
        if(!token)continue;let chunk='';
        const tw=textWidth('p11',token)*scale;
        if(tw<=maxWidth&&width+tw>maxWidth&&parts.length){lines.push(parts);parts=[];width=0;}
        if(width===0&&/^\s+$/.test(token))continue;
        for(const char of token){const cw=textWidth('p11',char)*scale;
          if(width+cw>maxWidth&&width>0){if(chunk)parts.push({t:chunk,c:seg.c});lines.push(parts);parts=[];chunk='';width=0;}
          chunk+=char;width+=cw;
        }
        if(chunk)parts.push({t:chunk,c:seg.c});
      }}if(parts.length)lines.push(parts);
    }
    C.chatCache={key,lines};return lines;
  };
  C.drawChat=p=>{
    const r=C.L.chat,size=clamp(C.width/85,12,17),line=size*1.22,input=C.chatInputRect;
    const top=r.y+10,areaH=Math.max(0,input.y-top-3),rows=Math.max(0,Math.floor(areaH/line));
    const lines=C.chatLines(r.w-43,size),max=Math.max(0,lines.length-rows);G.chatScroll=clamp(G.chatScroll,0,max);
    p.save();p.beginPath();p.rect(r.x+7,r.y+7,r.w-35,Math.max(1,r.h-14));p.clip();
    const end=lines.length-G.chatScroll,start=Math.max(0,end-rows);
    lines.slice(start,end).forEach((parts,i)=>{let x=r.x+10;const y=top+(rows-(end-start)+i+1)*line;for(const part of parts){Classic.text(p,part.t,x,y,size,part.c,false);x+=textWidth('p11',part.t)*size/11;}});
    p.fillStyle='#756444';p.fillRect(r.x+8,input.y-3,r.w-35,1);
    Classic.text(p,G.player.name+': '+UI.chatInput+((G.now/500|0)%2?'*':''),r.x+10,input.y+size,size,0x23160b,false);
    p.restore();
    if(r.h>50){
      const up=C.scrollUp,down=C.scrollDown;Classic.stone(p,up);Classic.stone(p,down);p.drawImage(Classic.icon('up'),up.x+1,up.y+1,up.w-2,up.h-2);p.drawImage(Classic.icon('down'),down.x+1,down.y+1,down.w-2,down.h-2);
      const track={x:up.x,y:up.y+up.h+1,w:up.w,h:Math.max(1,down.y-up.y-up.h-2)};p.fillStyle='#413724';p.fillRect(track.x,track.y,track.w,track.h);
      const th=Math.min(track.h,Math.max(12,track.h*rows/Math.max(rows,lines.length))),yy=track.y+(track.h-th)*(max?1-G.chatScroll/max:1);Classic.stone(p,{x:track.x+1,y:yy,w:track.w-2,h:th});
    }
    const names=['All','Game','Public','Private','Clan','Trade'];
    C.channelRects.forEach((b,i)=>{Classic.stone(p,b,false,C.hover===names[i]);const small=b.w<45,fs=clamp(b.w/5,9,16);Classic.text(p,names[i],b.x+b.w/2,b.y+b.h*(i===0?.61:.44),fs,UI.chatTab===i?0xffe9a6:0xe8e0c6,true,'center');if(i)Classic.text(p,i<3?'On':'Off',b.x+b.w/2,b.y+b.h*.81,Math.max(9,fs-1),i<3?0x38ec2d:0xd09e60,true,'center');});
    Classic.stone(p,C.reportRect,true);Classic.text(p,C.reportRect.w<80?'Report':'Report Abuse',C.reportRect.x+C.reportRect.w/2,C.reportRect.y+C.reportRect.h*.62,clamp(C.reportRect.w/10,11,17),0xf0debf,true,'center');
  };
  C.draw=()=>{
    if(!C.surface||!G.player)return;const p=C.ctx,L=C.L;p.clearRect(0,0,C.width,C.height);p.drawImage(C.back,0,0);
    p.drawImage(INP.canvas,VX,VY,VW,VH,L.world.x,L.world.y,L.world.w,L.world.h);
    if(UI.tab===3)C.drawInventory(p);else {const r=C.panelContent;p.drawImage(INP.canvas,PANEL.x,PANEL.y,PANEL.w,PANEL.h,r.x,r.y,r.w,r.h);}
    C.drawMap(p);L.tabs.forEach((r,i)=>{Classic.stone(p,r,UI.tab===i,C.hover===C.tabButtons[i][0].title);const sz=Math.round(Math.min(r.w*.75,r.h*.78,48));p.drawImage(Classic.icon(TAB_ID[i]),r.x+(r.w-sz)/2,r.y+(r.h-sz)/2,sz,sz);C.tabButtons[i][0].setAttribute('aria-pressed',String(UI.tab===i));});
    C.drawChat(p);
    if(typeof Online!=='undefined'&&Online.active){
      const safe=Online.zone==='safe',label=Online.ready?(safe?'SAFE ZONE':'PVP ZONE'):'CONNECTING',size=L.world.w<420?11:12,bw=Math.max(116,textWidth('p11',label)*size/11+40),badge={x:L.world.x+L.world.w-bw-8,y:L.world.y+7,w:bw,h:43};
      C.zoneBadge=badge;Classic.stone(p,badge,Online.ready&&!safe);p.drawImage(Classic.icon(safe?'bank':'combat'),badge.x+5,badge.y+8,24,24);
      Classic.text(p,label,badge.x+34,badge.y+19,size,safe?0xb9e38f:0xff8b69,true);
      Classic.text(p,Online.ready?'World 1':'Please wait',badge.x+34,badge.y+34,9,0xc9b88f,true);
    }
    if(L.quick){Classic.text(p,Online.active?'World 1':Expedition.active?'Expedition':'Arena',L.quick.x+L.quick.w/2,L.quick.y+14,12,0xd3bf89,true,'center');for(const {key,r}of C.quickButtons){Classic.stone(p,r);const id=key==='Save'?'save':key==='Chat'?'chat':key==='Menu'?'menu':key==='Run'?'run':key==='Special'?'combat':'full',sz=Math.min(27,r.h-6);p.drawImage(key==='Eat'?itemIcon('cookedFish'):key==='Potion'?itemIcon('prayer'):Classic.icon(id),r.x+(r.w-sz)/2,r.y+(r.h-sz)/2,sz,sz);}}
    const action=C.hover||UI.hoverText;
    if(action&&!UI.menu){p.save();p.beginPath();p.rect(L.world.x+4,L.world.y+3,Math.max(45,L.world.w-(Online.active?150:8)),50);p.clip();Classic.text(p,action+(!C.hover&&UI.hoverMore?' / '+UI.hoverMore:''),L.world.x+7,L.world.y+clamp(C.width/90,14,21),clamp(C.width/90,13,19),0xffffff,true,'left',true);p.restore();}
    if(G.spellSel)Classic.text(p,'Cast '+SPELL_BY_ID[G.spellSel].name+' on...',L.world.x+7,L.world.y+40,14,0x8ebde8,true);
    C.syncMenu();C.syncDialog();C.syncTooltip();
    if(!C.lastStatus||G.now-C.lastStatus>1000){C.lastStatus=G.now;C.status.textContent=Profiles.status;}
  };
  C.syncTooltip=()=>{
    const lines=UI.tip;
    if(!lines||UI.menu||C.panel||C.hover||UI.touchMode){C.tooltip.style.display='none';return;}
    C.tooltip.textContent=lines.map(String).join('\n');C.tooltip.style.whiteSpace='pre-line';C.tooltip.style.display='block';
    const pt=C.pointer||C.fromGame(UI.mouse.x,UI.mouse.y),r=C.tooltip.getBoundingClientRect();
    C.tooltip.style.left=clamp(pt.x+14,4,Math.max(4,C.width-r.width-4))+'px';C.tooltip.style.top=clamp(pt.y+16,4,Math.max(4,C.height-r.height-4))+'px';
  };
  C.syncMenu=()=>{
    const m=UI.menu;if(m===C.menu)return;C.menu=m;C.context.replaceChildren();C.context.style.display=m?'block':'none';if(!m)return;
    el('strong',{text:'Choose Option'},C.context);
    for(const entry of m.entries){const b=button(stripTags(entry.text),()=>{if(UI.menu!==m)return;UI.menu=null;C.syncMenu();entry.fn();},C.context);b.setAttribute('role','menuitem');}
    const pt=C.fromGame(UI.mouse.x,UI.mouse.y),b=C.context.getBoundingClientRect();C.context.style.left=clamp(pt.x-12,6,Math.max(6,C.width-b.width-6))+'px';C.context.style.top=clamp(pt.y-15,6,Math.max(6,C.height-b.height-6))+'px';
  };
  C.syncDialog=()=>{
    const d=G.dialog;if(C.dialog===d)return;C.dialog=d;C.dialogRoot.replaceChildren();C.dialogRoot.style.display=d?'block':'none';if(!d)return;
    const r=C.L.chat;Object.assign(C.dialogRoot.style,{left:r.x+'px',top:Math.max(6,Math.min(r.y,C.height-Math.max(r.h,180)-6))+'px',width:r.w+'px',maxHeight:Math.min(C.height-12,Math.max(r.h,180))+'px'});
    el('strong',{text:d.name||d.title||'Conversation'},C.dialogRoot);
    if(d.type==='options')for(const o of d.opts)button(o.t,()=>{if(G.dialog!==d)return;G.dialog=null;o.fn();},C.dialogRoot);
    else{for(const line of d.lines||[])el('p',{text:line},C.dialogRoot);button('Click here to continue',dialogContinue,C.dialogRoot);}
  };
  C.close=()=>{if(App.mode!=='game')return;C.panel=null;C.hover=null;C.shade.style.display='none';C.bar.inert=false;if(typeof Controls!=='undefined')Controls.cancelAll();C.surface.focus({preventScroll:true});};
  C.open=page=>{
    if(!G.player&&!['welcome','menu'].includes(page))page='welcome';
    if(page==='bank'&&!Online.active&&!Expedition.canBank()){gameMsg('Move beside a bank booth and leave combat first.');return;}
    C.panel=page;C.shade.style.display='flex';C.bar.inert=true;UI.menu=null;C.tooltip.style.display='none';if(typeof Controls!=='undefined')Controls.cancelAll();C.renderPanel();
    C.root.querySelector('input,button')?.focus({preventScroll:true});
  };
  C.renderPanel=()=>{
    if(!C.panel)return;const root=C.root;root.replaceChildren();
    if(App.mode==='game')button('×',C.close,root).className='client-close';
    el('div',{class:'client-lead',text:'OLDSKOOL · CLASSIC WEBGL CLIENT'},root);
    const titles={welcome:'OLDSKOOL',menu:'OLDSKOOL',journal:'Expedition journal',skills:'Character progression',bank:Online.active?'Bank of OLDSKOOL':'Camp bank',ge:'Grand Exchange',appearance:'Character design',craft:'The forge',cooking:'Camp cooking',chat:'Chat',map:'World map',report:'Report a problem'};
    el('h1',{text:titles[C.panel]||'SonnetOSRS'},root);
    if(C.panel==='welcome'||C.panel==='menu'){
      if(C.panel==='welcome'){root.querySelector('h1')?.remove();el('div',{class:'oldskool-logo',text:'OLDSKOOL'},root);el('div',{class:'oldskool-sub',text:'GRAND EXCHANGE · WORLD 1'},root);}
      el('p',{text:'A classic WebGL Grand Exchange world. World 1 is multiplayer: the bank interior is protected and PvP begins outside the visible stone boundary. Arena and Expedition remain available as offline modes.'},root);
      const status=el('div',{class:'world-status'},root),dot=el('span',{class:'world-dot'},status),statusText=el('span',{text:Online.status},status);
      if(!/^(localhost|127\.0\.0\.1)$/.test(location.hostname))Online.checkHealth().then(info=>{if(statusText.isConnected){statusText.textContent=Online.status;dot.classList.toggle('online',!!info);}});
      else statusText.textContent='World 1 health check is skipped on local/offline builds';
      const label=el('label',{text:'Character name'},root);label.htmlFor='profile-name';const name=el('input',{id:'profile-name',value:Profiles.name,maxLength:12,placeholder:'Character name',autocomplete:'off'},root);
      const cards=el('div',{class:'client-grid'},root);
      for(const [mode,title,desc]of [
        ['online','World 1 · Online PvP','Persistent Rust world. Safe inside the Grand Exchange; server-authoritative PvP outside the stone boundary.'],
        ['arena','Arena · Offline','Practice against tactical bots with free kits, specials, prayers and magic.'],
        ['expedition','Expedition · Offline','Gather, cook, smith, fight, bank loot and complete contracts.']
      ]){
        const card=el('div',{class:'client-card'+(mode==='online'?' world-online':'')},cards);el('h2',{text:title},card);el('small',{text:desc},card);
        const b=button(mode==='online'?'Enter World 1':'Play '+title.replace(' · Offline',''),()=>startGame(name.value,mode),card);b.dataset.mode=mode;
      }
      el('h2',{text:'Display & comfort'},root);const settings=el('div',{class:'client-grid'},root);
      for(const [key,title,options]of [['quality','Render quality',['low','balanced','high']],['layout','Interface',['auto','classic','touch']]]){
        const card=el('div',{class:'client-card'},settings);el('label',{text:title},card);const s=el('select',{},card);for(const value of options)el('option',{value,text:value,selected:Profiles.settings[key]===value},s);
        s.onchange=()=>{Profiles.settings[key]=s.value;Profiles.saveSettings();Polish.configure();C.layout();};
      }
      const presentation=el('div',{class:'client-controls'},root);
      button(C.compact?'Expand chat':'Collapse chat',refresh(()=>{C.compact=!C.compact;C.layout();}),presentation);
      button('Fullscreen',C.fullscreen,presentation);
      const tog=el('div',{class:'client-controls'},root);
      for(const [key,label]of [['sound','Sound'],['reduceMotion','Reduced motion'],['cameraSmooth','Smooth camera'],['showFps','FPS']])button(label+': '+(Profiles.settings[key]?'on':'off'),refresh(()=>{Profiles.settings[key]=!Profiles.settings[key];UI.sound=Profiles.settings.sound;Profiles.saveSettings();Polish.configure();}),tog);
      if(G.player&&!Online.active){
        el('h2',{text:'Backups'},root);const row=el('div',{class:'client-controls'},root);
        button('Save now',refresh(()=>Profiles.save(true)),row);button('Export save',refresh(()=>Profiles.exportFile()),row);
        const file=el('input',{type:'file',accept:'.json,application/json'},root);file.setAttribute('aria-label','Import a local save');
        file.onchange=async()=>{try{await Profiles.importFile(file.files[0]);}catch(err){Profiles.status=err.message;}C.renderPanel();};
        button('Reset this profile',()=>{if(Profiles.reset())startGame(Profiles.name,Profiles.mode,{skipSave:true});},row);
      }
      if(Online.active){
        el('h2',{text:'World 1 account'},root);
        const worldActions=el('div',{class:'client-controls'},root);
        button('Walk to bank',()=>{C.close();const o=WORLD.objs.filter(o=>o.kind==='bank').sort((a,b)=>dist2(a.x,a.y,G.player.x,G.player.y)-dist2(b.x,b.y,G.player.x,G.player.y))[0];if(o)cmdJob(o.x,o.y,a=>dist2(a.x,a.y,o.x,o.y)<=2,()=>openBank(o));},worldActions);
        button('Grand Exchange',()=>Online.openGe(),worldActions);
        button('Character appearance',()=>C.open('appearance'),worldActions);
        el('p',{class:'client-help',text:'World 1 inventory, equipment, bank, Grand Exchange offers, appearance, position and PvP progress are authoritative on the Rust server.'},root);
      }
      el('div',{class:'client-message',text:Profiles.status},root);
      el('p',{class:'client-help',text:'Touch: tap to act, drag the world to orbit, pinch to zoom, hold for options. Desktop: arrows / middle mouse orbit, wheel zoom, F1–F7 panels. Menus pause local simulation; the online world continues on the server.'},root);
    }else if(C.panel==='journal'){
      if(!Expedition.active){el('p',{text:'Arena is the free-kit combat sandbox. Open Menu → Expedition for persistent gathering, crafting, enemies and contracts.'},root);}
      else{
        el('p',{text:'Camp is the safe zone. Ore seams lie west, coppice trees north and fishing pools east. Bandits are beyond the east arch; the Guardian is farther north on the map. Click a destination below to mark it.'},root);
        const row=el('div',{class:'client-controls'},root);
        for(const [name,x,y]of [['Camp',48,34],['Ore',37,32],['Timber',46,25],['Fish',60,29],['Bandits',63,40],['Guardian',61,67]])button(name,()=>{Expedition.waypoint={name,x,y};C.close();gameMsg(name+' marked on your map.');},row);
        const grid=el('div',{class:'client-grid'},root);
        for(const q of Expedition.quests){const card=el('div',{class:'client-card'},grid),n=Expedition.progress[q.id]||0;el('h2',{text:q.name},card);el('small',{text:q.text},card);el('progress',{value:n,max:q.goal},card);el('small',{text:n+' / '+q.goal+' · '+q.coins+' coins + trail token'},card);button(Expedition.claimed[q.id]?'Claimed':'Claim reward',refresh(()=>Expedition.claim(q.id)),card,n<q.goal||Expedition.claimed[q.id]);}
        el('p',{class:'client-help',text:'PvM defeats: '+Expedition.pvmKills+'. Expedition death returns you to camp with equipment kept. Arena and Expedition profiles are separate.'},root);
      }
    }else if(C.panel==='skills'){
      const grid=el('div',{class:'client-grid'},root);
      for(const k of Expedition.xpKeys){const xp=Expedition.xp[k]||0,l=Expedition.active?Expedition.levelFor(xp):(G.player.stats[k]||0),card=el('div',{class:'client-card'},grid);el('h2',{text:k+' · '+(l||'not trained')},card);if(Expedition.active){el('progress',{value:xp-Expedition.xpFor(l),max:l===99?1:Expedition.xpFor(l+1)-Expedition.xpFor(l)},card);el('small',{text:fmtNum(xp)+' XP'+(l<99?' · '+fmtNum(Expedition.xpFor(l+1)-xp)+' to next level':' · MAX')},card);}else el('small',{text:'Arena uses preset combat stats; no expedition XP is earned.'},card);}
    }else if(C.panel==='bank'){
      const itemButton=(s,text,fn,parent)=>{
        const b=button('',fn,parent),cv=el('canvas',{width:32,height:32},b);
        cv.getContext('2d').drawImage(itemIcon(s.id),0,0);el('span',{text},b);return b;
      };
      const row=el('div',{class:'client-controls'},root);
      const quantity=el('select',{},row);quantity.style.width='auto';quantity.setAttribute('aria-label','Bank quantity');
      for(const v of [1,5,10,'all'])el('option',{value:String(v),text:String(v)==='all'?'All':String(v),selected:C.withdrawQty===v},quantity);
      quantity.onchange=()=>C.withdrawQty=quantity.value==='all'?'all':Number(quantity.value);
      if(Online.active){
        button('Deposit inventory',()=>Online.bankDepositAll(),row);
        button('Deposit worn items',()=>Online.bankDepositEquipment(),row);
        button('Grand Exchange',()=>Online.openGe(),row);
        el('p',{class:'client-help',text:'Server-authoritative bank · '+Online.account.bank.length+' / 400 entries. Select 1, 5, 10 or All, then tap an inventory item to deposit or bank item to withdraw.'},root);
        const search=el('input',{type:'search',placeholder:'Search bank',autocomplete:'off'},root);search.setAttribute('aria-label','Search bank');
        const grid=el('div',{class:'client-grid'},root),left=el('div',{},grid),right=el('div',{},grid);
        el('h2',{text:'Inventory'},left);el('h2',{text:'Bank'},right);
        const inv=el('div',{class:'client-items'},left),bank=el('div',{class:'client-items'},right);
        const renderBank=()=>{
          bank.replaceChildren();const q=search.value.trim().toLowerCase();
          Online.account.bank.forEach((entry,i)=>{
            if(!ITEMS[entry.id])return;
            const name=ITEMS[entry.id].name+(entry.variant?'('+entry.variant+')':'');
            if(q&&!name.toLowerCase().includes(q))return;
            itemButton({id:entry.id,n:entry.variant||entry.quantity},name+' ×'+fmtNum(entry.quantity),()=>Online.bankWithdraw(i,C.withdrawQty),bank);
          });
        };
        G.player.inv.forEach((item,i)=>{if(item)itemButton(item,itemName(item)+(ITEMS[item.id].stack?' ×'+fmtNum(item.n):''),()=>Online.bankDeposit(i,C.withdrawQty),inv);});
        search.oninput=renderBank;renderBank();
      }else{
        button('Deposit inventory',refresh(()=>Expedition.deposit(0,true)),row);button('Export backup',()=>Profiles.exportFile(),row);
        el('p',{class:'client-help',text:'Tap inventory items to deposit. Tap bank entries to withdraw. Potion doses are preserved. '+Expedition.bank.length+' / 120 bank entries.'},root);
        const grid=el('div',{class:'client-grid'},root),left=el('div',{},grid),right=el('div',{},grid);
        el('h2',{text:'Inventory'},left);el('h2',{text:'Bank'},right);const inv=el('div',{class:'client-items'},left),bank=el('div',{class:'client-items'},right);
        G.player.inv.forEach((item,i)=>{if(item)itemButton(item,itemName(item)+(ITEMS[item.id].stack?' ×'+item.n:''),refresh(()=>Expedition.deposit(i)),inv);});
        Expedition.bank.forEach((item,i)=>itemButton(item,itemName(item)+' ×'+(ITEMS[item.id].stack?item.n:item.qty),refresh(()=>{if(!Expedition.withdraw(i,C.withdrawQty))gameMsg('Not enough room to withdraw that quantity.');}),bank));
        if(Expedition.active){el('h2',{text:'Supply counter · costs coins in your bag'},root);const stock=el('div',{class:'client-controls'},root);for(const [id,n,price]of [['cookedFish',1,15],['water',30,20],['blood',10,40],['trailPick',1,5],['trailAxe',1,5],['trailNet',1,5],['ancstaff',1,100],['msb',1,100],['rarrows',50,30]])button(ITEMS[id].name+' ×'+n+' · '+price,refresh(()=>Expedition.buy(id,n,price)),stock);}
        else{el('h2',{text:'Practice loadouts · replaces carried gear'},root);const kits=el('div',{class:'client-controls'},root);for(const [kind,label]of [['main','Hybrid'],['pmelee','Melee'],['pranged','Ranged'],['pmage','Magic']])button(label,refresh(()=>restock(kind)),kits);}
      }
    }else if(C.panel==='ge'){
      if(!Online.active){el('p',{text:'The persistent Grand Exchange is available in World 1.'},root);}
      else{
        el('p',{text:'Six server-authoritative offer slots. Items and coins are escrowed when an offer is placed. Matching uses price-time priority; when prices cross, the older offer sets the trade price and excess buyer coins become collectible.'},root);
        const offers=el('div',{class:'client-grid'},root);
        for(let slot=0;slot<6;slot++){
          const offer=Online.account.offers.find(o=>o.slot===slot&&o.state!=='removed'),card=el('div',{class:'client-card'},offers);el('h2',{text:'Offer slot '+(slot+1)},card);
          if(!offer){el('small',{text:'Empty'},card);continue;}
          const done=offer.quantity-offer.remaining;
          el('small',{text:(offer.sell?'Sell ':'Buy ')+(ITEMS[offer.item]?.name||offer.item)+' · '+fmtNum(offer.quantity)+' @ '+fmtNum(offer.price)+' gp each'},card);
          const progress=el('progress',{value:done,max:Math.max(1,offer.quantity)},card);
          el('small',{text:done+' / '+offer.quantity+' complete · '+offer.state.replaceAll('_',' ')},card);
          if(offer.collected_items||offer.collected_coins){
            button('Collect to inventory'+(offer.collected_items?' · '+fmtNum(offer.collected_items)+' item(s)':'')+(offer.collected_coins?' · '+fmtNum(offer.collected_coins)+' gp':''),()=>Online.geCollect(slot,false),card);
            button('Collect to bank',()=>Online.geCollect(slot,true),card);
          }
          if(offer.state==='registered')button('Cancel offer',()=>Online.geCancel(slot),card);
        }
        el('h2',{text:'Create offer'},root);
        const form=el('form',{},root),grid=el('div',{class:'client-grid'},form);
        const modeCard=el('div',{class:'client-card'},grid),itemCard=el('div',{class:'client-card'},grid),qtyCard=el('div',{class:'client-card'},grid),priceCard=el('div',{class:'client-card'},grid),slotCard=el('div',{class:'client-card'},grid);
        el('label',{text:'Offer type'},modeCard);const mode=el('select',{},modeCard);el('option',{value:'buy',text:'Buy'},mode);el('option',{value:'sell',text:'Sell'},mode);
        el('label',{text:'Item'},itemCard);const item=el('select',{},itemCard);
        for(const c of Online.account.catalog){if(ITEMS[c.id])el('option',{value:c.id,text:ITEMS[c.id].name+' · guide '+fmtNum(c.guide_price)+' gp'},item);}
        el('label',{text:'Quantity'},qtyCard);const qty=el('input',{type:'number',min:1,max:2147483647,value:1},qtyCard);
        el('label',{text:'Price each'},priceCard);const price=el('input',{type:'number',min:1,max:2147483647,value:Online.account.catalog.find(c=>c.id===item.value)?.guide_price||1},priceCard);
        item.onchange=()=>price.value=Online.account.catalog.find(c=>c.id===item.value)?.guide_price||1;
        el('label',{text:'Offer slot'},slotCard);const slot=el('select',{},slotCard);for(let i=0;i<6;i++)el('option',{value:String(i),text:String(i+1)},slot);
        button('Place offer',()=>{},form).type='submit';
        form.onsubmit=e=>{e.preventDefault();Online.gePlace(Number(slot.value),mode.value==='sell',item.value,Number(qty.value),Number(price.value));};
        const nav=el('div',{class:'client-controls'},root);button('Bank',()=>Online.openBank(),nav);button('Return to game',C.close,nav);
      }
    }else if(C.panel==='appearance'){
      if(!Online.active){el('p',{text:'Persistent character appearance is available in World 1.'},root);}
      else{
        el('p',{text:'Choose a classic character palette while you are inside the Grand Exchange safe area and out of combat.'},root);
        const draft={...G.player.kit};
        const colors=[['Skin','skin',SKIN],['Hair','hair',HAIR],['Shirt','shirt',SHIRT],['Trousers','pants',[0x3a3a2a,0x2a3a5a,0x5a3a2a,0x2a2a2a,0x4a4a5a]],['Boots','boots',[0x3a2a1a,0x1a1a1a,0x5a4a3a]]];
        for(const [label,key,values] of colors){
          el('h2',{text:label},root);const row=el('div',{class:'client-controls'},root);
          values.forEach(value=>{const b=button(' ',()=>{draft[key]=value;G.player.kit={...draft};C.renderPanel();},row);b.style.cssText+=';width:46px;min-width:46px;background:#'+value.toString(16).padStart(6,'0');b.setAttribute('aria-label',label+' color');});
        }
        el('h2',{text:'Hair style'},root);const styles=el('div',{class:'client-controls'},root);for(let i=0;i<3;i++)button('Style '+(i+1),()=>{draft.hairStyle=i;G.player.kit={...draft};C.renderPanel();},styles);
        const actions=el('div',{class:'client-controls'},root);button('Save appearance',()=>Online.setAppearance(draft),actions);button('Cancel',()=>{Online.openBank&&0;C.close();},actions);
      }
    }else if(C.panel==='craft'||C.panel==='cooking'){
      el('p',{text:'Ingredients are consumed only when there is space for the complete result.'},root);const grid=el('div',{class:'client-grid'},root);
      for(const r of Expedition.recipes.filter(r=>r.station===(C.panel==='cooking'?'fire':'forge'))){const card=el('div',{class:'client-card'},grid);el('h2',{text:r.name},card);el('small',{text:Object.entries(r.input).map(([id,n])=>n+' '+ITEMS[id].name).join(' + ')+' → '+ITEMS[r.output[0]].name},card);button('Craft · +'+r.xp+' '+r.skill+' XP',refresh(()=>Expedition.craft(r.id)),card);}
    }else if(C.panel==='map'){
      el('p',{text:'This map is drawn from the current world. Markers show the banks, resource nodes and your position.'},root);
      const cv=el('canvas',{width:576,height:576},root);cv.style.cssText='position:static;width:min(100%,576px);height:auto;display:block;margin:auto;image-rendering:pixelated;border:4px ridge #81704d';
      const p=cv.getContext('2d');for(let y=0;y<MAPN;y++)for(let x=0;x<MAPN;x++){p.fillStyle=css(WORLD.mm[y*MAPN+x]);p.fillRect(x*6,(MAPN-y-1)*6,6,6);}
      for(const o of WORLD.objs){p.fillStyle=o.kind==='bank'?'#ede3b3':'#eb9d55';p.fillRect(o.x*6-2,(MAPN-o.y-1)*6-2,8,8);}
      p.fillStyle='#ffffff';p.fillRect(G.player.x*6-3,(MAPN-G.player.y-1)*6-3,10,10);
      const row=el('div',{class:'client-controls'},root);button('Open journal',()=>C.open('journal'),row);button('Return to game',C.close,row);
    }else if(C.panel==='report'){
      el('p',{text:'No online abuse-report service is connected, and nothing will be sent to another player or to Jagex. You can export a local bug report for this project.'},root);
      const area=el('textarea',{placeholder:'Describe what happened...'},root);area.setAttribute('aria-label','Problem description');
      button('Export local report',()=>{
        const text=['SonnetOSRS classic client '+Classic.version,'Mode: '+Profiles.mode,'Description:',area.value].join('\n');
        const url=URL.createObjectURL(new Blob([text],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download='SonnetOSRS-report.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      },root);
    }else if(C.panel==='chat'){
      const form=el('form',{},root),input=el('input',{type:'text',maxLength:78,placeholder:'Message or ::journal',autocomplete:'off'},form);input.setAttribute('aria-label','Chat message');el('button',{type:'submit',text:'Send'},form);form.onsubmit=e=>{e.preventDefault();const t=input.value.trim();C.close();if(t)chatCommand(t);};
    }
  };
  return C;
})();
