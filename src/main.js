'use strict';
/* Boot, bounded fixed-step simulation, and lifecycle. No pretend network login. */
const App={mode:'load',progress:0,status:'Preparing the world',ctx:null,R:null,cam:null,glCanvas:null,
  scale:1,prev:0,contextLost:false,manualPause:false,error:null,
  logout(){if(!Profiles.save()&&!Profiles.blocked&&!window.confirm('The save failed. Leave the current session anyway?'))return;if(typeof Online!=='undefined')Online.stop(true);this.mode='login';Controls.cancelAll();Client.open('welcome');},
  onDown(){},onKey(){}};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
/* extra player loadouts (bank restock) */
LOADOUTS.pmelee = {
  eq: { head: 'rhelm', cape: 'firecape', neck: 'glory', weapon: 'whip', body: 'rbody', shield: 'rkite', legs: 'rlegs', hands: 'bgloves', feet: 'rboots' },
  inv: ['dds', 'gmaul', 'ags', 'dscim', 'supstr', 'supdef', 'prayer', 'prayer', 'prayer', 'restore', 'restore', 'shark*16']
};
LOADOUTS.pranged = {
  eq: { head: 'coif', cape: 'firecape', neck: 'glory', weapon: 'rcb', body: 'bdbody', legs: 'bdchaps', hands: 'bgloves', feet: 'rboots', ammo: 'dbolts:400' },
  inv: ['whip', 'rkite', 'ranging', 'prayer', 'prayer', 'prayer', 'restore', 'restore', 'shark*19']
};
LOADOUTS.pmage = {
  eq: { head: 'mhat', cape: 'firecape', neck: 'glory', weapon: 'ancstaff', body: 'mtop', legs: 'mbottom', hands: 'bgloves', feet: 'mboots' },
  inv: ['whip', 'dds', 'death:800', 'blood:600', 'water:1500', 'prayer', 'prayer', 'prayer', 'restore', 'restore', 'shark*16'], autocast: 'iceBarrage'
};


function startGame(name,mode='arena',options={}){
  if(mode==='online'&&!options.onlineBootstrap){Online.start(name);return;}
  if(typeof Online!=='undefined'&&Online.active&&!options.onlineBootstrap){Online.stop(true);options={...options,skipSave:true};}
  if(App.mode==='game'&&!options.skipSave){
    const ok=Profiles.save();
    if(!ok&&!window.confirm('Your current profile could not be saved. Continue anyway? Export a backup to keep it.'))return;
  }
  Controls.cancelAll();Expedition.uninstallWorld();
  G.tick=0;G.now=0;G.lastTick=0;G.nextId=1;G.actors=[];G.player=null;
  G.ground=[];G.projs=[];G.effects=[];G.msgs=[];G.hitQ=[];G.dialog=null;G.spellSel=null;
  for(const k of ['kills','deaths','streak','best','dmgDealt','dmgTaken','chatScroll'])G[k]=0;
  Profiles.select(name,mode);createPlayer();G.player.name=Profiles.name;G.player.loadoutKind='main';createClerks();UI.botCount=0;
  Expedition.begin(Profiles.mode);
  if(!Expedition.active)setBotCount(6);
  const saved=options.onlineBootstrap?null:Profiles.read();if(saved)Profiles.apply(saved);
  UI.tab=3;UI.menu=null;UI.drag=null;UI.chatInput='';UI.bonusWin=false;UI.mouse={x:-100,y:-100};
  G.player.protectUntil=G.tick+25;App.mode='game';App.manualPause=false;App.prev=performance.now();
  Polish.snapCamera=true;Polish.particles.length=0;App.cam._visibleDist=App.cam.dist;
  Client.close();Client.layout();
  if(!options.onlineBootstrap){gameMsg('Welcome, '+Profiles.name+'. '+(Expedition.active?'Your expedition begins at the safe camp.':'You are in the offline PvP practice arena.'));
  gameMsg(Expedition.active?'Journal marks gathering spots and enemy camps. Bank your supplies; craft at the forge.':'Free combat kits are available at bank booths. Bots and specials use the 600 ms game tick.');}
  if(Profiles.blocked)gameMsg(Profiles.status);
}
function respawnNow(a){if(!Online.active)respawn(a);}
function fit(){Client.layout();}
function drawLoading(ctx){
  ctx.fillStyle='#211a10';ctx.fillRect(0,0,W,H);
  if(!Fonts.b12)return;
  drawTextC(ctx,'q16','OLDSKOOL',W/2,210,0xe9d099,true);
  drawTextC(ctx,'p11',App.status,W/2,246,0xcab98b,true);
  fillR(ctx,W/2-150,268,300,7,0x3c3221);frameR(ctx,W/2-150,268,300,7,0x7f704c);fillR(ctx,W/2-149,269,Math.round(App.progress*298),5,0xb99b54);
}
function fatal(err){
  if(App.error)return;App.error=err;console.error(err);App.mode='error';Controls.cancelAll();
  const box=document.createElement('section');box.style.cssText='position:fixed;inset:20px;z-index:100;background:#1b2c22;color:#eadfbf;padding:24px;border:1px solid #cfb777;overflow:auto;font:16px system-ui';
  const title=document.createElement('h2');title.textContent='The game could not continue';box.appendChild(title);
  const pre=document.createElement('pre');pre.style.whiteSpace='pre-wrap';pre.textContent=String(err&&err.stack||err);box.appendChild(pre);
  const b=document.createElement('button');b.textContent='Reload';b.onclick=()=>location.reload();box.appendChild(b);document.body.appendChild(box);
}
function frame(t){
  requestAnimationFrame(frame);
  if(App.error)return;
  try{
    let elapsed=App.prev?t-App.prev:0;App.prev=t;
    if(!Number.isFinite(elapsed)||elapsed<0||elapsed>3000)elapsed=0;
    if(App.mode==='load'){drawLoading(App.ctx);return;}
    if(App.mode!=='game')return;
    const paused=document.hidden||App.contextLost||(!Online.active&&(!!Client.panel||App.manualPause));
    const dt=paused?0:Math.min(.1,elapsed/1000);
    Online.frame();
    if(!paused){
      G.now+=elapsed;
      let steps=0;while(G.now-G.lastTick>=TICK_MS&&steps<4){G.lastTick+=TICK_MS;gameTick();steps++;}
      // Drop an extreme backlog rather than spending seconds in catch-up.
      if(G.now-G.lastTick>=TICK_MS)G.lastTick=G.now;
      if(performance.now()-Profiles.lastSave>15000){Profiles.lastSave=performance.now();Profiles.save();}
    }
    if(App.contextLost)return;
    const frac=clamp((G.now-G.lastTick)/TICK_MS,0,1),cam=App.cam;
    if(!paused&&!Client.panel)updateCameraKeys(dt);
    const rp=renderPos(G.player,frac);Polish.camera(cam,rp,groundH(...rp),dt);
    drawDynamic(frac,dt,cam);updateScreenInfo(cam,frac);
    const R=App.R;R.begin(cam);R.gl.uniform1f(R.uOpacity,1);WorldVisibility.update(cam,dt);for(const g of WORLD.statics)R.drawGPU(g);Polish.drawExtra();WorldVisibility.drawOpaque(R);Polish.drawShadows();
    R.drawDynamic(DYN);R.setDepthWrite(false);R.drawDynamic(BLD);R.setDepthWrite(true);WorldVisibility.drawFaded(R);
    if(!paused)updateHover();drawUI(App.ctx,cam);Client.draw();
  }catch(err){fatal(err);}
}
async function boot(){
  const ui=document.getElementById('ui'),glc=document.getElementById('gl');
  App.ctx=ui.getContext('2d');if(!App.ctx)throw new Error('Canvas 2D is unavailable.');
  App.ctx.imageSmoothingEnabled=false;App.glCanvas=glc;INP.canvas=ui;INP.glCanvas=glc;
  Profiles.loadSettings();Client.init();fit();addEventListener('resize',fit);window.fitClient=fit;
  if(window.visualViewport)window.visualViewport.addEventListener('resize',fit);
  let timer;try{await Promise.race([initFonts(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Embedded font loading timed out.')),15000);})]);}finally{clearTimeout(timer);}
  requestAnimationFrame(frame);
  const steps=[
    ['Preparing renderer',()=>{App.R=new Renderer(glc);Polish.configure();}],
    ['Building the Grand Exchange',()=>{COL.grass=0x65794d;COL.grass2=0x89945c;buildWorld(App.R);initLoS();}],
    ['Preparing interface',()=>{buildAllIcons();buildFrame();}],
    ['Preparing items',()=>{for(const id of Object.keys(ITEMS))itemIcon(id);}],
    ['Detailing the world',()=>Polish.buildScenery()],
    ['Preparing camera',()=>{App.cam=new Camera();App.cam.yaw=0;App.cam.pitch=.88;App.cam.dist=15;INP.cam=App.cam;}]
  ];
  for(let i=0;i<steps.length;i++){App.status=steps[i][0];App.progress=i/steps.length;await tick();await tick();steps[i][1]();}
  App.progress=1;Controls.bind();fit();
  glc.addEventListener('webglcontextlost',e=>{
    e.preventDefault();Profiles.save();App.contextLost=true;Controls.cancelAll();Profiles.status='Graphics context lost. Your local save was attempted; reload to rebuild the renderer.';
    Client.open('menu');const b=document.createElement('button');b.textContent='Reload renderer';b.onclick=()=>location.reload();Client.root.appendChild(b);
  });
  document.addEventListener('visibilitychange',()=>{App.prev=performance.now();});
  App.mode='login';Client.open('welcome');
  const q=new URLSearchParams(location.search);if(q.get('auto')==='1')startGame(q.get('profile')||'Leefy',q.get('mode')||'arena',{skipSave:true});
}
boot().catch(fatal);
