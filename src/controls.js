'use strict';
/* One gesture state machine. Cancellations never take the pointerup path. */
const Controls = (() => {
  const C={points:new Map(),mouseDown:false,timer:null,gesture:null,clickBlock:new Map()};
  clientPos=e=>{const p=Client.toGame(e.clientX,e.clientY);return{x:Math.floor(p.x),y:Math.floor(p.y)};};
  const virtual=(x,y,button=0)=>({clientX:x,clientY:y,button,preventDefault(){}});
  const domUI=e=>e.target&&e.target.closest&&e.target.closest('#client-panel,#client-bar,#client-footer,#client-context,#client-dialog');
  const playable=()=>App.mode==='game'&&!Client.panel&&!App.contextLost&&!App.manualPause&&!document.hidden;
  const clearTimer=()=>{if(C.timer!==null)clearTimeout(C.timer);C.timer=null;};
  function release(p){try{if(p.target.hasPointerCapture(p.id))p.target.releasePointerCapture(p.id);}catch(_){}}
  C.cancelAll=()=>{
    clearTimer();const points=[...C.points.values()];C.points.clear();C.gesture=null;C.mouseDown=false;
    UI.drag=null;INP.mmb=false;INP.keys={};
    for(const p of points)release(p);
    // Clear the old compatibility structure as well for tooling/extensions.
    if(INP.touch){INP.touch.points.clear();clearTouchLongPress();resetTouchGesture();}
  };
  function pair(){const p=[...C.points.values()];return p.length>=2?{dist:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)}:null;}
  C.down=e=>{
    if(!playable())return;e.preventDefault();sndInit();
    const pos=clientPos(e);if(pos.x<0||pos.y<0||pos.x>=W||pos.y>=H)return;
    UI.touchMode=e.pointerType==='touch';UI.mouse=pos;
    if(e.pointerType!=='touch'){
      C.mouseDown=true;onDown(e);
      try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}return;
    }
    const world=inRect(pos.x,pos.y,{x:VX,y:VY,w:VW,h:VH})&&!UI.menu&&!UI.bonusWin;
    const inventory=!world&&UI.tab===3&&inRect(pos.x,pos.y,PANEL)&&!UI.menu;
    const p={id:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,lastX:e.clientX,lastY:e.clientY,
      target:e.currentTarget,kind:world?'world':inventory?'inventory':'ui',moved:false,held:false,consumed:false,dragging:false};
    C.points.set(p.id,p);try{p.target.setPointerCapture(p.id);}catch(_){}
    if(C.points.size>1){
      clearTimer();UI.drag=null;for(const point of C.points.values())point.consumed=true;
      C.gesture=[...C.points.values()].every(point=>point.kind==='world')?pair():null;return;
    }
    if(world||(!UI.menu&&inRect(pos.x,pos.y,PANEL)&&[3,4,5,6].includes(UI.tab))){
      C.timer=setTimeout(()=>{
        C.timer=null;
        if(!playable()||C.points.get(p.id)!==p||C.points.size!==1||p.moved||p.consumed)return;
        p.held=true;p.consumed=true;onDown(virtual(p.x,p.y,2));
      },480);
    }
  };
  C.move=e=>{
    if(e.pointerType!=='touch'){
      if(!playable())return;
      if(domUI(e)&&!C.mouseDown)return;
      if(INP.mmb && !(e.buttons&4))INP.mmb=false;
      UI.touchMode=false;onMove(e);return;
    }
    const p=C.points.get(e.pointerId);if(!p)return;
    if(!playable()){C.cancelAll();return;}
    e.preventDefault();p.x=e.clientX;p.y=e.clientY;UI.mouse=clientPos(e);
    if(C.points.size>=2){
      clearTimer();const now=pair();
      if(C.gesture&&now&&C.gesture.dist>0)INP.cam.dist=clamp(INP.cam.dist* C.gesture.dist/Math.max(1,now.dist),8,26);
      if(C.gesture)C.gesture=now;return;
    }
    if(p.held)return;
    const delta=Math.hypot(p.x-p.sx,p.y-p.sy);
    if(delta>7){p.moved=true;clearTimer();}
    if(p.kind==='world'&&p.moved){
      const scale=Client.mobile?Math.min(2,Math.max(.5,512/Client.world.w)):1;
      INP.cam.yaw+=(p.x-p.lastX)*.006*scale;
      INP.cam.pitch=clamp(INP.cam.pitch+(p.y-p.lastY)*.004*scale,.25,1.35);
    }else if(p.kind==='inventory'&&p.moved&&!p.consumed){
      if(!p.dragging){onDown(virtual(p.sx,p.sy));p.dragging=true;}
      onMove(virtual(p.x,p.y));
    }
    p.lastX=p.x;p.lastY=p.y;
  };
  C.up=e=>{
    if(e.pointerType!=='touch'){
      if(!C.mouseDown)return;C.mouseDown=false;
      if(!playable()){UI.drag=null;INP.mmb=false;return;}
      if(UI.drag&&!UI.drag.active){const p=clientPos(e);if(!inRect(p.x,p.y,invSlotRect(UI.drag.from))){UI.drag=null;return;}}
      onUp(e);return;
    }
    const p=C.points.get(e.pointerId);if(!p)return;
    e.preventDefault();clearTimer();
    if(playable()&&!p.consumed&&!p.held&&C.points.size===1){
      if(p.dragging)onUp(virtual(e.clientX,e.clientY));
      else if(!p.moved){onDown(virtual(e.clientX,e.clientY));onUp(virtual(e.clientX,e.clientY));}
    }
    // Chromium may retarget the synthetic click to a newly opened DOM menu.
    // Canvas actions already ran above; this compatibility click must not run
    // a second action (e.g. eat food immediately after opening its menu).
    C.clickBlock.set(p.id,performance.now()+800);
    C.points.delete(p.id);release(p);
    if(!C.points.size){C.gesture=null;UI.drag=null;}
    else{C.gesture=pair();for(const other of C.points.values()){other.consumed=true;other.lastX=other.x;other.lastY=other.y;}}
  };
  C.cancel=e=>{if(C.points.has(e.pointerId)||C.mouseDown)C.cancelAll();};
  C.bind=()=>{
    const targets=[INP.canvas,Client.surface];
    addEventListener('pointerdown',e=>C.clickBlock.delete(e.pointerId),true);
    addEventListener('click',e=>{
      const until=C.clickBlock.get(e.pointerId);
      if(until!==undefined){C.clickBlock.delete(e.pointerId);if(performance.now()<until){e.preventDefault();e.stopImmediatePropagation();}}
      for(const [id,t]of C.clickBlock)if(t<performance.now())C.clickBlock.delete(id);
    },true);
    if('PointerEvent'in window){
      for(const t of targets){t.style.touchAction='none';t.addEventListener('pointerdown',C.down,{passive:false});t.addEventListener('lostpointercapture',C.cancel);}
      addEventListener('pointermove',C.move,{passive:false});addEventListener('pointerup',C.up,{passive:false});addEventListener('pointercancel',C.cancel);
    }else{
      // Conservative legacy mouse fallback; no fake touch-event translation.
      for(const t of targets)t.addEventListener('mousedown',onDown);
      addEventListener('mousemove',onMove);addEventListener('mouseup',onUp);
    }
    window.addEventListener('contextmenu',e=>e.preventDefault());
    for(const t of targets){t.addEventListener('contextmenu',e=>e.preventDefault());t.addEventListener('wheel',e=>{if(playable())onWheel(e);},{passive:false});}
    addEventListener('keydown',e=>{
      if(e.key==='Escape'&&Client.panel&&App.mode==='game'){e.preventDefault();Client.close();return;}
      if(domUI(e)||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target&&e.target.tagName||''))return;
      if(!playable())return;onKeyDown(e);
    });
    addEventListener('keyup',e=>onKeyUp(e));addEventListener('blur',C.cancelAll);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){C.cancelAll();Profiles.save();}});
    addEventListener('pagehide',()=>{C.cancelAll();Profiles.save();});
  };
  return C;
})();
