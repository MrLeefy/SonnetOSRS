'use strict';
/* Presentation adapter only. Retain the original logical panel actions and
 * projection space. The composed frame owns menus, text, orbs and cursors. */
const ClassicPresenter = (() => {
  Polish.resize=()=>{
    if(!App.glCanvas)return;
    const world=Client.world,aspect=world?world.w/world.h:VW/VH;
    const quality=Profiles.settings.quality,cap=quality==='low'?512:quality==='high'?1536:1024;
    const cssWidth=world?world.w:VW*(App.scale||1),factor=quality==='low'?1:Math.min(devicePixelRatio||1,quality==='high'?2:1.5);
    const width=Math.round(clamp(cssWidth*factor,256,cap)),height=Math.max(1,Math.round(width/aspect));
    if(App.glCanvas.width!==width)App.glCanvas.width=width;
    if(App.glCanvas.height!==height)App.glCanvas.height=height;
  };
  drawUI=(ctx,cam)=>{
    ctx.clearRect(0,0,W,H);ctx.drawImage(UI.frame,0,0);UI.tip=null;
    drawOverlays(ctx,cam);
    if(UI.bonusWin)drawBonusWindow(ctx);
    // Produces the actual rotating terrain raster consumed by the new minimap.
    drawMinimap(ctx,cam);
    drawPanel(ctx);
    // Chat and context menus are rendered once by Client, not twice in a hidden
    // 765x503 frame. This also removes the legacy eight-line scroll clamp.
  };
  drawStatsTab=(ctx,a)=>{
    const keys={Attack:'atk',Strength:'str',Defence:'def',Ranged:'rng',Magic:'mag',Prayer:'pray',Hitpoints:'hp',Mining:'mining',Woodcutting:'woodcutting',Fishing:'fishing',Cooking:'cooking',Smithing:'smithing'};
    let total=0;
    for(let i=0;i<SKILLS.length;i++){
      const x=PANEL.x+3+(i%3)*63,y=PANEL.y+4+Math.floor(i/3)*32,k=keys[SKILLS[i][0]];
      const level=k?(Expedition.active?Expedition.levelFor(Expedition.xp[k]||0):(a.stats[k]||0)):0;if(level)total+=level;
      fillR(ctx,x,y,61,30,0x403728);frameR(ctx,x,y,61,30,0x75664b);ctx.drawImage(IC['sk_'+SKILLS[i][2]],x+3,y+8);
      drawTextR(ctx,'p11',level||'--',x+56,y+20,level?0xf2d994:0x958971,true);
    }
    drawTextC(ctx,'p11','Trained total: '+total,PANEL.x+95,PANEL.y+257,0xe2d8b2,true);
  };
  return {version:Classic.version};
})();
