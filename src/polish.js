'use strict';
/* Presentation-only changes: simulation rules stay at 600 ms.
 * Dynamic buffers grow on demand and reuse storage between frames.
 */
const Polish = (() => {
  const P={fps:0,particles:[],serial:0,snapCamera:true,dt:1/60,drawCalls:0,vertices:0,extra:null};
  const settings=()=>Profiles.settings;
  P.configure=()=>{
    UI.sound=settings().sound;
    if(App.R){App.R.fogCol=[.26,.34,.33];App.R.fogRange=settings().quality==='low'?[28,49]:[34,62];}
    if(settings().reduceMotion)P.particles.length=0;
    P.resize();
  };
  P.resize=()=>{
    if(!App.glCanvas)return;
    const aspect=Client.mobile&&Client.world?Client.world.w/Client.world.h:VW/VH;
    const cap=settings().quality==='low'?512:settings().quality==='high'?1536:1024;
    const cssWidth=Client.mobile&&Client.world?Client.world.w:VW*(App.scale||1);
    const factor=settings().quality==='low'?1:Math.min(devicePixelRatio||1,settings().quality==='high'?2:1.5);
    const width=Math.round(clamp(cssWidth*factor,256,cap)),height=Math.round(width/aspect);
    if(App.glCanvas.width!==width)App.glCanvas.width=width;
    if(App.glCanvas.height!==height)App.glCanvas.height=height;
  };
  Renderer.prototype.pack=function(mesh){
    const need=mesh.count*24;
    if(!mesh._packed||mesh._packed.byteLength<need){let cap=1024;while(cap<need)cap*=2;mesh._packed=new ArrayBuffer(cap);mesh._f32=new Float32Array(mesh._packed);mesh._u8=new Uint8Array(mesh._packed);}
    const f=mesh._f32,u=mesh._u8;
    for(let i=0;i<mesh.count;i++){const a=i*6,b=i*5,c=i*4;f[a]=mesh.p[b];f[a+1]=mesh.p[b+1];f[a+2]=mesh.p[b+2];f[a+3]=mesh.p[b+3];f[a+4]=mesh.p[b+4];const off=(a+5)*4;u[off]=mesh.c[c];u[off+1]=mesh.c[c+1];u[off+2]=mesh.c[c+2];u[off+3]=mesh.c[c+3];}
    return new Uint8Array(mesh._packed,0,need);
  };
  Renderer.prototype.drawDynamic=function(mesh){
    if(!mesh.count)return;const gl=this.gl,data=this.pack(mesh);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.dynBuf);
    if(!this.dynamicCapacity||data.byteLength>this.dynamicCapacity){let n=1024;while(n<data.byteLength)n*=2;this.dynamicCapacity=n;gl.bufferData(gl.ARRAY_BUFFER,n,gl.DYNAMIC_DRAW);}
    gl.bufferSubData(gl.ARRAY_BUFFER,0,data);this.bindAttribs();
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[mesh.tex]||this.textures.white);gl.uniform1i(this.uTex,0);
    gl.drawArrays(gl.TRIANGLES,0,mesh.count);P.drawCalls++;P.vertices+=mesh.count;
  };
  const oldGPU=Renderer.prototype.drawGPU;
  Renderer.prototype.drawGPU=function(g){oldGPU.call(this,g);if(g.count){P.drawCalls++;P.vertices+=g.count;}};
  Renderer.prototype.begin=function(cam){
    const gl=this.gl;P.drawCalls=0;P.vertices=0;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(...this.fogCol,1);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.prog);
    if(!this.vpBuffer)this.vpBuffer=new Float32Array(16);this.vpBuffer.set(cam.vp);
    gl.uniformMatrix4fv(this.uVP,false,this.vpBuffer);gl.uniform3f(this.uEye,...cam.eye);gl.uniform2f(this.uFog,...this.fogRange);gl.uniform3f(this.uFogCol,...this.fogCol);
  };
  Camera.prototype.update=function(){
    const smooth=settings().cameraSmooth&&!settings().reduceMotion;
    this._visibleDist=this._visibleDist===undefined?this.dist:lerp(this._visibleDist,this.dist,smooth?1-Math.exp(-P.dt*16):1);
    this.pitch=clamp(this.pitch,.25,1.35);this.yaw=((this.yaw%TAU)+TAU)%TAU;
    const dh=Math.cos(this.pitch)*this._visibleDist,dv=Math.sin(this.pitch)*this._visibleDist;
    this.eye=[this.tx-Math.sin(this.yaw)*dh,this.ty+dv,this.tz+Math.cos(this.yaw)*dh];
    this.view=M4.lookAt(this.eye,[this.tx,this.ty,this.tz],[0,1,0]);
    const aspect=this.aspect||VW/VH;this.vp=M4.mul(M4.persp(this.fovy,aspect,.25,90),this.view);
    let fx=this.tx-this.eye[0],fy=this.ty-this.eye[1],fz=this.tz-this.eye[2];const l=Math.hypot(fx,fy,fz)||1;fx/=l;fy/=l;fz/=l;
    let rx=-fz,rz=fx;const rl=Math.hypot(rx,rz)||1;rx/=rl;rz/=rl;
    this.fwd=[fx,fy,fz];this.right=[rx,0,rz];this.up=[-rz*fy,rz*fx-rx*fz,rx*fy];
    this.tanY=Math.tan(this.fovy/2);this.tanX=this.tanY*aspect;
  };
  P.camera=(cam,rp,gh,dt)=>{
    P.dt=dt;const snap=P.snapCamera||Math.hypot(cam.tx-rp[0],cam.tz+rp[1])>8;
    const t=snap||!settings().cameraSmooth||settings().reduceMotion?1:1-Math.exp(-dt*20);
    cam.tx=lerp(cam.tx,rp[0],t);cam.ty=lerp(cam.ty,gh+.75,t);cam.tz=lerp(cam.tz,-rp[1],t);P.snapCamera=false;cam.update();
    P.fps=lerp(P.fps,dt>0?1/dt:P.fps,.035);
  };
  P.burst=(x,y,color,n=8)=>{
    if(settings().reduceMotion||settings().quality==='low')return;
    const rng=mulberry32(++P.serial*131+G.tick);
    for(let i=0;i<n&&P.particles.length<160;i++){const a=rng()*TAU,s=.4+rng()*1.2;P.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,vz:1+rng()*2,t:G.now,color,dur:500+rng()*450});}
  };
  const SHADOW=new Mesh('white');SHADOW.blend=true;
  function ring(mesh,x,y,r,width,color,alpha=180){
    const N=settings().quality==='low'?12:24;
    for(let i=0;i<N;i++){
      const a=i/N*TAU,b=(i+1)/N*TAU;
      const v=(ang,rr)=>{const px=x+Math.cos(ang)*rr,py=y+Math.sin(ang)*rr;return[px,groundH(px,py)+.025,-py];};
      mesh.quad(v(a,r),v(b,r),v(b,r-width),v(a,r-width),color,false,null,alpha);
    }
  }
  function shadow(a,frac){
    if(a.dead)return;const p=renderPos(a,frac),r=a.monster==='guardian'?.56:.32;
    for(let j=0;j<3;j++)ring(SHADOW,p[0],p[1],r+j*.10,.12,0x1c2926,28-j*7);
  }
  function drawNode(o){
    const x=o.x+.5,y=o.y+.5,h=groundH(x,y),m=M4.trans(x,h,-y),live=o.charges>0;
    if(o.station==='forge'){
      DYN.box(m,0,.28,0,.47,.28,.42,0x6a7066);DYN.box(m,0,.62,0,.38,.08,.30,0xadb4ad);DYN.box(m,.27,.88,-.28,.13,.40,.12,0x7d8073);
      DYN.box(m,-.20,.36,.43,.16,.11,.014,0xf4a85d);
    }else if(o.station==='fire'){
      for(let i=0;i<6;i++){const a=i/6*TAU;DYN.box(m,Math.cos(a)*.36,.12,Math.sin(a)*.36,.13,.10,.13,0x81877a);}
      DYN.box(m,0,.13,0,.24,.05,.10,0x8a613a);
      const pulse=settings().reduceMotion?0:Math.sin(G.now*.012)*.08;
      BLD.blob(m,0,.35,0,.20,.28+pulse,.20,6,3,0xffb55a,0,null,185);DYN.blob(m,0,.27,0,.11,.17,.11,6,3,0xffde8b);
    }else if(o.skill==='mining'){
      const scale=live?1:.42;DYN.blob(m,0,.35*scale,0,.47,.48*scale,.43,7,4,live?0x8d9690:0x616d66,.10,mulberry32(o.x*71+o.y));
      if(live)for(let i=0;i<3;i++)DYN.box(m,-.2+i*.19,.48,.22,.06,.09,.045,0xcdaf80);
    }else if(o.skill==='woodcutting'){
      DYN.prism(m,0,0,0,live?1.55:.28,.15,.15,7,0x775737);
      if(live){DYN.blob(m,0,1.85,0,.72,.68,.65,8,4,0x63865c,.12,mulberry32(o.x));DYN.blob(m,.33,1.48,.2,.50,.45,.50,7,3,0x81985f,.08,mulberry32(o.y));}
      else DYN.prism(m,0,0,.28,.30,.14,.14,7,0xc3aa78);
    }else if(o.skill==='fishing'){
      for(let i=0;i<16;i++){const a=i/16*TAU,b=(i+1)/16*TAU;DYN.tri([x,h+.016,-y],[x+Math.cos(a)*.7,h+.016,-(y+Math.sin(a)*.7)],[x+Math.cos(b)*.7,h+.016,-(y+Math.sin(b)*.7)],0x437d89,false);}
      if(live)ring(BLD,x,y,.20+((G.now/1800)%1)*.45,.027,0xb5e1db,150);
    }
  }
  function guardian(a,frac,dt){
    const p=renderPos(a,frac),h=groundH(...p),t=G.now/700;
    a.faceR+=angDiff(a.faceR,a.face)*(1-Math.exp(-dt*10));
    const fallen=a.dead?clamp((G.now-a.anim.t0)/1200,0,1):0;
    const root=M4.mul(M4.trans(p[0],h,-p[1]),M4.mul(M4.rotY(Math.PI-a.faceR),M4.rotX(-fallen*1.45)));
    const glow=a.hp<a.maxHp/2?0xf1bf69:0x7fdbdf,stone=0x899c98;
    DYN.box(root,0,.97,0,.33,.35,.22,stone);DYN.box(root,0,1.46,0,.24,.22,.23,0xa3b0a7);
    DYN.box(root,0,1.44,.235,.15,.036,.02,glow);DYN.box(root,0,1.05,.23,.08,.11,.025,glow);
    for(const s of [-1,1]){
      const swing=!a.dead&&a.seg.length?Math.sin(t*6)*.28*s:0;
      const leg=M4.mul(root,M4.mul(M4.trans(s*.18,.59,0),M4.rotX(swing)));
      DYN.box(leg,0,-.20,0,.14,.25,.16,0x718783);DYN.box(leg,0,-.48,.045,.17,.08,.22,0x536e6d);
      const arm=M4.mul(root,M4.mul(M4.trans(s*.48,1.12,0),M4.rotX(-swing)));
      DYN.box(arm,0,-.12,0,.18,.22,.19,0x899c98);DYN.box(arm,0,-.47,.06,.20,.18,.21,0x5d7774);
    }
    a.wx=p[0];a.wy=h;a.wz=-p[1];
  }
  const oldActor=drawActor,oldWeapon=drawWeapon;
  drawActor=(a,frac,dt,cam)=>{if(a.monster==='guardian')guardian(a,frac,dt);else oldActor(a,frac,dt,cam);};
  drawWeapon=(m,model,it)=>{
    if(model==='scim'&&it.color){
      DYN.box(m,0,0,.05,.022,.028,.07,0x684c33);DYN.box(m,0,0,.13,.09,.022,.022,0xc9a86b);
      DYN.box(m,0,.014,.32,.018,.040,.19,it.color);
      DYN.tri(M4.pt(m,-.019,-.02,.48),M4.pt(m,.019,.04,.48),M4.pt(m,0,.12,.64),shadeCol(it.color,1.2),false);
    }else if(model==='whip'){
      DYN.box(m,0,0,.08,.026,.026,.10,0x6d4d2b);
      const wave=settings().reduceMotion?0:Math.sin(G.now/140)*.10;
      for(let i=0;i<8;i++){
        const z=.19+i*.07,yy=-i*i*.006,xx=Math.sin(i*.6+G.now/230)*wave*i/8;
        const b=M4.mul(m,basisMat(xx,yy,z,0,-.012*i,.07));DYN.box(b,0,0,.035,.016,.016,.044,i%2?0xd2b95b:0xefd880);
      }
    }else oldWeapon(m,model,it);
  };
  drawDynamic=(frac,dt,cam)=>{
    DYN.clear();BLD.clear();SHADOW.clear();
    for(const a of G.actors)if(dist2(a.x,a.y,G.player.x,G.player.y)<42){drawActor(a,frac,dt,cam);shadow(a,frac);}
    drawGround();drawProjectiles();
    if(Expedition.active){
      for(const o of Expedition.nodes)if(dist2(o.x,o.y,G.player.x,G.player.y)<32)drawNode(o);
      for(const w of Expedition.warnings){const pulse=settings().reduceMotion?1:.75+.25*Math.sin(G.now/80);ring(BLD,w.x,w.y,w.radius,.13,w.enraged?0xffc46d:0xe99b76,Math.floor(210*pulse));}
      if(Expedition.gather){const o=Expedition.gather.node;ring(BLD,o.x+.5,o.y+.5,.77,.055,0xd8cd95,180);}
    }
    if(G.player.target&&!G.player.target.dead){const rp=renderPos(G.player.target,frac);ring(BLD,rp[0],rp[1],.62,.055,0xf1ba7a,205);}
    if(G.player.path.length){const last=G.player.path[G.player.path.length-1];ring(BLD,last.x+.5,last.y+.5,.34,.045,0xd9e5ac,175);}
    P.particles=P.particles.filter(q=>G.now<q.t+q.dur);
    for(const q of P.particles){const t=(G.now-q.t)/1000,f=clamp((G.now-q.t)/q.dur,0,1);BLD.box(null,q.x+q.vx*t,groundH(q.x,q.y)+.35+q.vz*t-1.7*t*t,-(q.y+q.vy*t),.027,.027,.027,q.color,0,Math.floor(220*(1-f)));}
  };
  P.drawShadows=()=>{App.R.setDepthWrite(false);App.R.drawDynamic(SHADOW);App.R.setDepthWrite(true);};
  const oldCursor=drawCursor,oldMenu=drawMenu,oldStats=drawStatsTab,oldQuest=drawQuestTab,oldOverlays=drawOverlays;
  drawCursor=ctx=>{if(!UI.touchMode)oldCursor(ctx);};
  drawMenu=ctx=>{if(!Client.mobile)oldMenu(ctx);};
  drawStatsTab=(ctx,a)=>{
    const keys={Attack:'atk',Strength:'str',Defence:'def',Ranged:'rng',Magic:'mag',Prayer:'pray',Hitpoints:'hp',Mining:'mining',Woodcutting:'woodcutting',Fishing:'fishing',Cooking:'cooking',Smithing:'smithing'};
    let total=0;
    for(let i=0;i<SKILLS.length;i++){
      const x=PANEL.x+3+(i%3)*63,y=PANEL.y+4+Math.floor(i/3)*32,k=keys[SKILLS[i][0]];
      const level=k?(Expedition.active?Expedition.levelFor(Expedition.xp[k]||0):(a.stats[k]||0)):0;if(level)total+=level;
      fillR(ctx,x,y,61,30,0x344235);frameR(ctx,x,y,61,30,0x57604b);ctx.drawImage(IC['sk_'+SKILLS[i][2]],x+3,y+8);
      drawTextR(ctx,'p11',level||'--',x+56,y+20,level?0xf2d994:0x8c9c8d,true);
    }
    drawTextC(ctx,'p11','Trained total: '+total,PANEL.x+95,PANEL.y+257,0xe2d8b2,true);
  };
  drawQuestTab=(ctx,a)=>{
    if(!Expedition.active){oldQuest(ctx,a);return;}
    drawTextC(ctx,'b12','Expedition',PANEL.x+95,PANEL.y+20,0xe6cf96,true);
    Expedition.quests.forEach((q,i)=>{const y=PANEL.y+46+i*30;drawText(ctx,'p11',q.name,PANEL.x+6,y,0xc9d9c9,true);drawTextR(ctx,'p11',Expedition.claimed[q.id]?'Done':(Expedition.progress[q.id]||0)+'/'+q.goal,PANEL.x+182,y,0xe5ca80,true);});
    drawTextC(ctx,'p11','Open Journal to claim rewards.',PANEL.x+95,PANEL.y+246,0xc4d0c1,true);
  };
  drawOverlays=(ctx,cam)=>{
    oldOverlays(ctx,cam);
    if(Profiles.settings.showFps){drawText(ctx,'p11',Math.round(P.fps)+' fps | '+P.drawCalls+' draws',VX+8,VY+VH-9,0xe4e8c7,true);}
    if(Expedition.active&&Expedition.waypoint){const w=Expedition.waypoint,d=Math.round(Math.hypot(w.x-G.player.x,w.y-G.player.y));
      drawText(ctx,'p11',w.name+' · '+d+' tiles',VX+8,VY+VH-25,0xeac786,true);
      const s=cam.project(w.x+.5,groundH(w.x+.5,w.y+.5)+.15,-(w.y+.5));
      if(s&&s[0]>=8&&s[0]<VW-8&&s[1]>=25&&s[1]<VH-10){ctx.save();ctx.strokeStyle='#efd598';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(VX+s[0]-6,VY+s[1]-12);ctx.lineTo(VX+s[0],VY+s[1]-4);ctx.lineTo(VX+s[0]+6,VY+s[1]-12);ctx.stroke();ctx.restore();}
    }
  };
  P.buildScenery=()=>{
    const mesh=new Mesh('white'),rng=mulberry32(11291);
    for(let i=0;i<120;i++){
      const x=16+rng()*65,y=10+rng()*63;if(poly12(x-GEC,y-GEC)<23||!passable(Math.floor(x),Math.floor(y)))continue;
      const h=groundH(x,y),c=i%4?0x82915a:0xc1b772;
      for(let j=0;j<3;j++){const a=j*1.05;mesh.tri([x-Math.cos(a)*.13,h,-y+Math.sin(a)*.13],[x+Math.cos(a)*.13,h,-y-Math.sin(a)*.13],[x,h+.20+rng()*.18,-y],c,false);}
    }
    P.extra=App.R.upload(mesh);
  };
  P.drawExtra=()=>{if(P.extra&&settings().quality!=='low')App.R.drawGPU(P.extra);};
  return P;
})();
