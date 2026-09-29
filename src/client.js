'use strict';
/* Responsive presentation of the existing logical client. The original UI
 * remains the source of inventory/prayer/combat interactions; touch crops map
 * back to those exact logical coordinates rather than approximating clicks.
 */
const Client = (() => {
  const C={mobile:false,regions:[],panel:null,menu:null,dialog:null,withdrawQty:1,width:0,height:0};
  const el=(tag,props={},parent)=>{const e=document.createElement(tag);for(const [k,v]of Object.entries(props)){if(k==='text')e.textContent=v;else if(k==='class')e.className=v;else if(k==='onClick')e.addEventListener('click',v);else e[k]=v;}if(parent)parent.appendChild(e);return e;};
  const button=(text,fn,parent,disabled=false)=>el('button',{type:'button',text,onClick:fn,disabled},parent);
  const refresh=fn=>()=>{fn();C.renderPanel();};
  C.init=()=>{
    const style=el('style',{text:`
      :root{color-scheme:dark;--ink:#d7e0db;--muted:#9bafa4;--gold:#d6bb7f;--edge:#415448;--bg:#121b18}
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101715;color:var(--ink);font-family:system-ui,sans-serif}
      button,input,select{font:inherit}button{border:1px solid var(--edge);border-radius:7px;background:#26382f;color:var(--ink);padding:9px 12px;min-height:44px;cursor:pointer;touch-action:manipulation}
      button:hover,button:focus-visible{border-color:var(--gold);background:#354a3d;outline:2px solid transparent}button:disabled{opacity:.45;cursor:default}
      input,select{min-height:44px;border:1px solid #536358;border-radius:6px;background:#1a2821;color:var(--ink);padding:8px;width:100%}
      #client-bar{position:fixed;inset:0 0 auto;z-index:20;min-height:48px;display:flex;gap:6px;align-items:center;padding:4px max(8px,env(safe-area-inset-right)) 4px max(8px,env(safe-area-inset-left));background:#18251fed;border-bottom:1px solid #3b5142;padding-top:max(4px,env(safe-area-inset-top))}
      #client-bar strong{font-size:13px;letter-spacing:2px;color:var(--gold);margin-right:auto;white-space:nowrap}#client-bar button{min-height:40px;padding:7px 11px;font-size:13px}
      #client-surface{position:fixed;inset:0;z-index:3;touch-action:none;display:none}
      #client-footer{position:fixed;inset:auto 0 0;z-index:21;background:#14231fee;border-top:1px solid #455646;padding:5px 6px max(5px,env(safe-area-inset-bottom));display:none}
      .client-row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;margin:2px 0}.client-row button{padding:6px 2px;font-size:12px}.client-row button.active{border-color:var(--gold);color:#ffe1a0;background:#3e4832}
      #client-status{position:fixed;inset:auto 0 4px;text-align:center;color:var(--muted);font-size:12px;z-index:10;pointer-events:none}
      #client-shade{position:fixed;inset:0;z-index:40;background:#080e0bd9;display:none;align-items:center;justify-content:center;padding:14px}
      #client-panel{position:relative;width:min(760px,100%);max-height:calc(100dvh - 28px);overflow:auto;border:1px solid #819477;border-radius:14px;background:linear-gradient(145deg,#22362c,#14221c);padding:22px;box-shadow:0 24px 90px #0009;overscroll-behavior:contain}
      #client-panel h1{font-size:29px;letter-spacing:-1px;color:#f0d49a;margin:2px 0 10px}#client-panel h2{font-size:17px;margin:15px 0 8px;color:#dfd5b7}#client-panel p{line-height:1.6;margin:8px 0;color:#bed0c1}.client-close{position:absolute;right:14px;top:12px;min-width:44px}
      .client-lead{font-size:13px;letter-spacing:2px;color:#95c3a1}.client-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:12px 0}.client-card{background:#1021199c;border:1px solid #405748;padding:15px;border-radius:10px}.client-card h2{margin-top:0!important}.client-card small{display:block;color:#abc0ad;margin:6px 0 12px;line-height:1.5}
      .client-card progress{width:100%;height:9px;accent-color:#b8cb8a}.client-card label{display:block;font-size:13px;margin:10px 0 5px;color:#c8d9cd}.client-controls{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.client-help{font-size:13px;color:#a4b9ab!important}
      .client-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px}.client-items button{font-size:11px;min-height:86px;padding:6px;overflow-wrap:anywhere}.client-items canvas{display:block;position:static!important;width:32px;height:32px;margin:0 auto 4px;image-rendering:pixelated}
      .client-message{padding:10px;border:1px solid #657551;background:#263724;color:#e5dfb8;font-size:13px;border-radius:6px;margin:10px 0}
      #client-context{position:fixed;z-index:35;display:none;max-width:calc(100vw - 16px);width:260px;max-height:60dvh;overflow:auto;background:#1d2d25;border:1px solid #b2a575;box-shadow:0 8px 30px #0008;border-radius:8px;padding:5px}#client-context button{display:block;width:100%;text-align:left;border:0;background:transparent;font-size:14px;min-height:44px}
      #client-dialog{position:fixed;z-index:34;inset:auto 10px 106px;padding:14px;background:#25382bed;border:1px solid #8da37a;border-radius:10px;max-height:50dvh;overflow:auto;display:none}#client-dialog p{font-size:14px;margin:6px 0}#client-dialog button{margin:4px;width:calc(100% - 8px)}
      @media(max-width:580px){#client-bar strong{font-size:11px;letter-spacing:1px}#client-bar button{padding:6px 8px;font-size:12px}#client-panel{padding:18px 14px}#client-panel h1{font-size:25px;padding-right:46px}}
      @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
    `},document.head);
    C.bar=el('div',{id:'client-bar'},document.body);
    el('strong',{text:'SONNET / LEEFY'},C.bar);
    button('Journal',()=>C.open('journal'),C.bar);button('Bank',()=>Expedition.goBank(),C.bar);button('Save',()=>{Profiles.save(true);C.status.textContent=Profiles.status;},C.bar);button('Menu',()=>C.open('menu'),C.bar);
    C.surface=el('canvas',{id:'client-surface'},document.body);C.ctx=C.surface.getContext('2d');
    C.footer=el('div',{id:'client-footer'},document.body);
    const tabs=el('div',{class:'client-row'},C.footer);C.tabButtons=[];
    for(const [text,tab]of [['Bag',3],['Gear',4],['Prayer',5],['Magic',6],['Fight',0]])C.tabButtons.push([button(text,()=>{UI.tab=tab;G.spellSel=null;},tabs),tab]);
    button('Skills',()=>C.open('skills'),tabs);
    const quick=el('div',{class:'client-row'},C.footer);
    button('Eat',()=>{if(G.player)eatFood(G.player,findFoodIdx(G.player));},quick);
    button('Potion',()=>{if(G.player){let i=findPotIdx(G.player,'prayer');if(i<0)i=findPotIdx(G.player,'restore');drinkPotion(G.player,i);}},quick);
    button('Run',()=>{if(G.player)G.player.runOn=!G.player.runOn;},quick);
    button('Special',()=>{if(G.player&&weaponOf(G.player).spec)G.player.specOn=!G.player.specOn;},quick);
    button('Chat',()=>C.open('chat'),quick);
    button('Full',async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch(_){gameMsg('Fullscreen is unavailable in this browser.');}},quick);
    C.status=el('div',{id:'client-status'},document.body);
    C.shade=el('div',{id:'client-shade'},document.body);
    C.root=el('section',{id:'client-panel',role:'dialog'},C.shade);C.root.setAttribute('aria-modal','true');C.root.setAttribute('aria-label','Game menu');
    C.context=el('div',{id:'client-context'},document.body);C.dialogRoot=el('div',{id:'client-dialog'},document.body);
    C.root.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&App.mode==='game'){e.preventDefault();C.close();}
      if(e.key==='Tab'){
        const nodes=[...C.root.querySelectorAll('button:not(:disabled),input,select,[tabindex="0"]')].filter(x=>x.offsetParent);
        if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    C.layout();
  };
  C.layout=()=>{
    if(!C.surface)return;
    C.width=Math.max(1,document.documentElement.clientWidth||innerWidth);C.height=Math.max(1,innerHeight);
    C.mobile=Profiles.settings.layout==='touch'||(Profiles.settings.layout==='auto'&&matchMedia('(pointer: coarse)').matches);
    const gl=App.glCanvas,wrap=document.getElementById('wrap'),top=C.bar.getBoundingClientRect().bottom+6;
    C.surface.style.display=C.mobile?'block':'none';C.footer.style.display=C.mobile?'block':'none';C.status.style.display=C.mobile?'none':'block';
    C.regions=[];
    if(C.mobile){
      if(gl.parentNode!==document.body)document.body.insertBefore(gl,C.surface);
      wrap.style.display='none';
      const bottom=C.footer.getBoundingClientRect().height+10,avail=C.height-top-bottom,w=C.width;
      const landscape=w>C.height;
      let world,panel,map;
      if(landscape){
        const panelW=Math.min(206,w*.27),s=Math.min(panelW/200,Math.max(1,avail)/265),ph=265*s;
        panel={x:w-panelW-8,y:top,w:200*s,h:ph};
        world={x:8,y:top,w:Math.max(120,w-panelW-24),h:Math.max(80,avail)};
        // The minimap is available in the classic client; on short landscape
        // screens the panel receives the space instead of covering combat.
        map=null;
      }else{
        const wh=Math.max(120,Math.min(w*.74,avail*.47));world={x:8,y:top,w:w-16,h:wh};
        const ph=Math.max(90,avail-wh-12),s=Math.min((w*.53)/200,ph/265);
        panel={x:w-200*s-8,y:top+wh+10,w:200*s,h:265*s};
        const mw=Math.max(70,panel.x-16);map={x:8,y:panel.y,w:mw,h:mw*166/238};
      }
      C.world=world;C.panelRect=panel;C.mapRect=map;
      C.regions.push({src:{x:VX,y:VY,w:VW,h:VH},dst:world},{src:{x:543,y:201,w:200,h:265},dst:panel});
      if(map)C.regions.push({src:{x:523,y:0,w:238,h:166},dst:map});
      Object.assign(gl.style,{position:'fixed',left:world.x+'px',top:world.y+'px',width:world.w+'px',height:world.h+'px',zIndex:'1',imageRendering:Profiles.settings.quality==='low'?'pixelated':'auto'});
      const dpr=Math.min(devicePixelRatio||1,2);C.surface.width=Math.round(w*dpr);C.surface.height=Math.round(C.height*dpr);C.surface.style.width=w+'px';C.surface.style.height=C.height+'px';C.ctx.setTransform(dpr,0,0,dpr,0,0);
      if(App.cam)App.cam.aspect=world.w/world.h;
    }else{
      if(gl.parentNode!==wrap)wrap.insertBefore(gl,document.getElementById('ui'));
      wrap.style.display='block';
      Object.assign(gl.style,{position:'absolute',left:VX+'px',top:VY+'px',width:VW+'px',height:VH+'px',zIndex:'',imageRendering:'auto'});
      const max=Math.max(.01,Math.min(C.width/W,(C.height-top-26)/H,4));
      let s=max;const dpr=devicePixelRatio||1;
      if(UI.sharp&&s*dpr>=1)s=Math.floor(s*dpr)/dpr;
      App.scale=s;wrap.style.transform='translate('+Math.max(0,Math.floor((C.width-W*s)/2))+'px,'+Math.max(top,Math.floor(top+(C.height-top-26-H*s)/2))+'px) scale('+s+')';
      if(App.cam)App.cam.aspect=VW/VH;
    }
    if(typeof Polish!=='undefined')Polish.resize();
  };
  C.toGame=(x,y)=>{
    if(!C.mobile){const r=INP.canvas.getBoundingClientRect();return{x:(x-r.left)*W/r.width,y:(y-r.top)*H/r.height};}
    for(const r of C.regions)if(inRect(x,y,r.dst))return{x:r.src.x+(x-r.dst.x)*r.src.w/r.dst.w,y:r.src.y+(y-r.dst.y)*r.src.h/r.dst.h};
    return{x:-100,y:-100};
  };
  C.fromGame=(x,y)=>{for(const r of C.regions)if(inRect(x,y,r.src))return{x:r.dst.x+(x-r.src.x)*r.dst.w/r.src.w,y:r.dst.y+(y-r.src.y)*r.dst.h/r.src.h};return{x:8,y:60};};
  C.draw=()=>{
    if(!C.surface)return;
    if(C.mobile){
      const p=C.ctx;p.clearRect(0,0,C.width,C.height);p.imageSmoothingEnabled=false;
      for(const r of C.regions)p.drawImage(INP.canvas,r.src.x,r.src.y,r.src.w,r.src.h,r.dst.x,r.dst.y,r.dst.w,r.dst.h);
      if(C.mapRect){
        const r=C.mapRect,x=r.x,y=r.y+r.h+16,w=r.w;
        p.font='12px system-ui';p.fillStyle='#d8c99d';p.fillText(Expedition.active?'EXPEDITION':'ARENA',x,y);
        p.fillStyle='#c4d7c8';p.fillText('HP '+Math.ceil(G.player.hp)+' / '+G.player.maxHp,x,y+22);p.fillText('Run '+Math.floor(G.player.run)+'%  Spec '+Math.floor(G.player.spec)+'%',x,y+42);
        const lines=G.msgs.slice(-3).map(m=>stripTags(m.text||'').slice(0,Math.max(10,Math.floor(w/6))));
        p.fillStyle='#96b6a3';lines.forEach((line,i)=>p.fillText(line,x,y+66+i*17,w));
      }
      for(const [b,tab]of C.tabButtons)b.classList.toggle('active',UI.tab===tab);
    }
    C.syncMenu();C.syncDialog();
    if(!C.lastStatus||G.now-C.lastStatus>1000){C.lastStatus=G.now;C.status.textContent=Profiles.status+' · '+(Expedition.active?'Offline Expedition':'Offline Arena')+' · '+(Profiles.settings.showFps?Math.round(Polish.fps)+' fps · ':'')+'600 ms simulation';}
  };
  C.syncMenu=()=>{
    if(!C.mobile){C.context.style.display='none';return;}
    const m=UI.menu;if(m===C.menu)return;C.menu=m;C.context.replaceChildren();
    if(!m){C.context.style.display='none';return;}
    for(const entry of m.entries)button(stripTags(entry.text),()=>{if(UI.menu!==m)return;UI.menu=null;C.menu=null;C.context.style.display='none';entry.fn();},C.context);
    C.context.style.display='block';const pt=C.fromGame(UI.mouse.x,UI.mouse.y),h=C.context.getBoundingClientRect().height;
    C.context.style.left=clamp(pt.x-30,8,Math.max(8,C.width-268))+'px';C.context.style.top=clamp(pt.y-20,58,Math.max(58,C.height-h-12))+'px';
  };
  C.syncDialog=()=>{
    const d=C.mobile?G.dialog:null;if(C.dialog===d)return;C.dialog=d;C.dialogRoot.replaceChildren();C.dialogRoot.style.display=d?'block':'none';if(!d)return;
    el('strong',{text:d.name||d.title||'Conversation'},C.dialogRoot);
    if(d.type==='options'){for(const o of d.opts)button(o.t,()=>{if(G.dialog!==d)return;G.dialog=null;o.fn();},C.dialogRoot);}
    else{for(const l of d.lines||[])el('p',{text:l},C.dialogRoot);button('Continue',dialogContinue,C.dialogRoot);}
  };
  C.close=()=>{if(App.mode!=='game')return;C.panel=null;C.shade.style.display='none';if(typeof Controls!=='undefined')Controls.cancelAll();};
  C.open=page=>{
    if(!G.player && !['menu','welcome'].includes(page))page='welcome';
    if(page==='bank'&&!Expedition.canBank()){gameMsg('Move beside a bank booth and leave combat first.');return;}
    C.panel=page;C.shade.style.display='flex';UI.menu=null;if(typeof Controls!=='undefined')Controls.cancelAll();C.renderPanel();
    const f=C.root.querySelector('input,button');if(f)f.focus({preventScroll:true});
  };
  C.renderPanel=()=>{
    if(!C.panel)return;const root=C.root;root.replaceChildren();
    if(App.mode==='game')button('×',C.close,root).className='client-close';
    el('div',{class:'client-lead',text:'LEEFY EXPANSION · v0.2'},root);
    const titles={welcome:'Choose your adventure',menu:'Your local world',journal:'Expedition journal',skills:'Character progression',bank:'Camp bank',craft:'The forge',cooking:'Camp cooking',chat:'Say something'};
    el('h1',{text:titles[C.panel]||'SonnetOSRS'},root);
    if(C.panel==='welcome'||C.panel==='menu'){
      el('p',{text:'The original PvP sandbox, plus a persistent gathering and PvM expedition. Everything runs locally. No RuneScape account or password is needed.'},root);
      const label=el('label',{text:'Local profile name'},root);label.htmlFor='profile-name';const name=el('input',{id:'profile-name',value:Profiles.name,maxLength:12,placeholder:'Your name',autocomplete:'off'},root);
      const cards=el('div',{class:'client-grid'},root);
      for(const [mode,title,desc]of [['arena','Arena','Practice PvP against tactical bots. Free kits, specials, prayers and magic.'],['expedition','Expedition','Gather, cook, smith, fight, bank your loot and complete six contracts.']]){
        const card=el('div',{class:'client-card'},cards);el('h2',{text:title},card);el('small',{text:desc},card);
        const b=button('Play '+title,()=>startGame(name.value,mode),card);b.dataset.mode=mode;
      }
      el('h2',{text:'Display & comfort'},root);const settings=el('div',{class:'client-grid'},root);
      for(const [key,title,options]of [['quality','Render quality',['low','balanced','high']],['layout','Interface',['auto','classic','touch']]]){
        const card=el('div',{class:'client-card'},settings);el('label',{text:title},card);const s=el('select',{},card);for(const value of options)el('option',{value,text:value,selected:Profiles.settings[key]===value},s);
        s.onchange=()=>{Profiles.settings[key]=s.value;Profiles.saveSettings();Polish.configure();C.layout();};
      }
      const tog=el('div',{class:'client-controls'},root);
      for(const [key,label]of [['sound','Sound'],['reduceMotion','Reduced motion'],['cameraSmooth','Smooth camera'],['showFps','FPS']])button(label+': '+(Profiles.settings[key]?'on':'off'),refresh(()=>{Profiles.settings[key]=!Profiles.settings[key];UI.sound=Profiles.settings.sound;Profiles.saveSettings();Polish.configure();}),tog);
      if(G.player){
        el('h2',{text:'Backups'},root);const row=el('div',{class:'client-controls'},root);
        button('Save now',refresh(()=>Profiles.save(true)),row);button('Export save',refresh(()=>Profiles.exportFile()),row);
        const file=el('input',{type:'file',accept:'.json,application/json'},root);file.setAttribute('aria-label','Import a local save');
        file.onchange=async()=>{try{await Profiles.importFile(file.files[0]);}catch(err){Profiles.status=err.message;}C.renderPanel();};
        button('Reset this profile',()=>{if(Profiles.reset())startGame(Profiles.name,Profiles.mode,{skipSave:true});},row);
      }
      el('div',{class:'client-message',text:Profiles.status},root);
      el('p',{class:'client-help',text:'Touch: tap to act, drag the world to orbit, pinch to zoom, hold for options. Desktop: arrows / middle mouse orbit, wheel zoom, F1–F7 panels. Menus pause this offline simulation.'},root);
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
      const row=el('div',{class:'client-controls'},root);button('Deposit inventory',refresh(()=>Expedition.deposit(0,true)),row);button('Export backup',()=>Profiles.exportFile(),row);
      const quantity=el('select',{},row);quantity.style.width='auto';quantity.setAttribute('aria-label','Withdraw quantity');for(const v of [1,5,10,'all'])el('option',{value:String(v),text:'Withdraw '+v,selected:C.withdrawQty===v},quantity);quantity.onchange=()=>C.withdrawQty=quantity.value==='all'?'all':Number(quantity.value);
      el('p',{class:'client-help',text:'Tap inventory items to deposit. Tap bank entries to withdraw. Potion doses are preserved. '+Expedition.bank.length+' / 120 bank entries.'},root);
      const grid=el('div',{class:'client-grid'},root);const left=el('div',{},grid),right=el('div',{},grid);el('h2',{text:'Inventory'},left);el('h2',{text:'Bank'},right);const inv=el('div',{class:'client-items'},left),bank=el('div',{class:'client-items'},right);
      const itemButton=(s,text,fn,parent)=>{const b=button('',refresh(fn),parent),cv=el('canvas',{width:32,height:32},b);cv.getContext('2d').drawImage(itemIcon(s.id),0,0);el('span',{text},b);return b;};
      G.player.inv.forEach((s,i)=>{if(s)itemButton(s,itemName(s)+(ITEMS[s.id].stack?' ×'+s.n:''),()=>Expedition.deposit(i),inv);});
      Expedition.bank.forEach((s,i)=>itemButton(s,itemName(s)+' ×'+(ITEMS[s.id].stack?s.n:s.qty),()=>{if(!Expedition.withdraw(i,C.withdrawQty))gameMsg('Not enough room to withdraw that quantity.');},bank));
      if(Expedition.active){el('h2',{text:'Supply counter · costs coins in your bag'},root);const stock=el('div',{class:'client-controls'},root);for(const [id,n,price]of [['cookedFish',1,15],['water',30,20],['blood',10,40],['trailPick',1,5],['trailAxe',1,5],['trailNet',1,5],['ancstaff',1,100],['msb',1,100],['rarrows',50,30]])button(ITEMS[id].name+' ×'+n+' · '+price,refresh(()=>Expedition.buy(id,n,price)),stock);}
      else{el('h2',{text:'Practice loadouts · replaces carried gear'},root);const kits=el('div',{class:'client-controls'},root);for(const [kind,label]of [['main','Hybrid'],['pmelee','Melee'],['pranged','Ranged'],['pmage','Magic']])button(label,refresh(()=>restock(kind)),kits);}
    }else if(C.panel==='craft'||C.panel==='cooking'){
      el('p',{text:'Ingredients are consumed only when there is space for the complete result.'},root);const grid=el('div',{class:'client-grid'},root);
      for(const r of Expedition.recipes.filter(r=>r.station===(C.panel==='cooking'?'fire':'forge'))){const card=el('div',{class:'client-card'},grid);el('h2',{text:r.name},card);el('small',{text:Object.entries(r.input).map(([id,n])=>n+' '+ITEMS[id].name).join(' + ')+' → '+ITEMS[r.output[0]].name},card);button('Craft · +'+r.xp+' '+r.skill+' XP',refresh(()=>Expedition.craft(r.id)),card);}
    }else if(C.panel==='chat'){
      const form=el('form',{},root),input=el('input',{type:'text',maxLength:78,placeholder:'Message or ::journal',autocomplete:'off'},form);input.setAttribute('aria-label','Chat message');el('button',{type:'submit',text:'Send'},form);form.onsubmit=e=>{e.preventDefault();const t=input.value.trim();C.close();if(t)chatCommand(t);};
    }
  };
  return C;
})();
