'use strict';
/* Original procedural interface art. No screenshot crops, branded sprites, or
 * fabricated minimap data. CSS-pixel layout is independent of game coordinates. */
const Classic = (() => {
  const S={textures:{},icons:{},version:'0.3.0'};
  function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  S.texture=kind=>{
    if(S.textures[kind])return S.textures[kind];
    const c=canvas(128,128),ctx=c.getContext('2d'),im=ctx.createImageData(128,128),rng=mulberry32(kind==='paper'?198:kind==='brown'?331:82);
    const base=kind==='paper'?[203,185,143]:kind==='brown'?[57,49,37]:[76,71,54];
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const n=(rng()-.5)*(kind==='paper'?13:19)+Math.sin(x*.055+y*.024)*3+Math.cos(x*.12-y*.095)*2;
      const k=(y*128+x)*4;for(let j=0;j<3;j++)im.data[k+j]=base[j]+n;im.data[k+3]=255;
    }
    ctx.putImageData(im,0,0);
    if(kind==='stone')for(let i=0;i<95;i++){
      const x=(rng()*128)|0,y=(rng()*128)|0,w=1+(rng()*4)|0;
      ctx.fillStyle='rgba(10,8,4,.24)';ctx.fillRect(x,y,w,1);ctx.fillStyle='rgba(209,191,142,.12)';ctx.fillRect(x,y+1,w,1);
    }
    return S.textures[kind]=c;
  };
  S.fill=(ctx,r,kind)=>{ctx.save();ctx.translate(r.x,r.y);ctx.fillStyle=ctx.createPattern(S.texture(kind),'repeat');ctx.fillRect(0,0,r.w,r.h);ctx.restore();};
  S.frame=(p,r,width=7)=>{
    const colors=['#17150e','#716951','#342d1e','#96896b','#4e4936','#211d13','#c0ac7b'];
    p.save();for(let i=0;i<width;i++){p.strokeStyle=colors[Math.min(i,colors.length-1)];p.lineWidth=1;p.strokeRect(Math.round(r.x)+i+.5,Math.round(r.y)+i+.5,Math.max(0,Math.round(r.w)-i*2-1),Math.max(0,Math.round(r.h)-i*2-1));}
    const rng=mulberry32(Math.round(r.w*7+r.h*11));p.fillStyle='#201b12';
    for(let i=0;i<r.w/70;i++){const x=r.x+10+rng()*(r.w-20);p.fillRect(x|0,r.y+2,1,Math.min(3,width));p.fillRect(x|0,r.y+r.h-width,1,3);}p.restore();
  };
  function cutPath(p,r,inset=0){const x=r.x+inset,y=r.y+inset,w=r.w-inset*2,h=r.h-inset*2,c=Math.min(6,w*.12,h*.15);p.beginPath();p.moveTo(x+c,y);p.lineTo(x+w-c,y);p.lineTo(x+w,y+c);p.lineTo(x+w,y+h-c);p.lineTo(x+w-c,y+h);p.lineTo(x+c,y+h);p.lineTo(x,y+h-c);p.lineTo(x,y+c);p.closePath();}
  S.stone=(p,r,selected=false,hover=false)=>{
    p.save();cutPath(p,r);p.fillStyle='#110f09';p.fill();p.lineWidth=1;p.strokeStyle='#090805';p.stroke();
    cutPath(p,r,2);p.clip();S.fill(p,r,'stone');
    const g=p.createLinearGradient(r.x,r.y,r.x+r.w*.3,r.y+r.h);g.addColorStop(0,selected?'#853724':'rgba(203,185,141,.25)');g.addColorStop(.5,selected?'#682014':hover?'rgba(192,165,109,.2)':'rgba(0,0,0,0)');g.addColorStop(1,selected?'#2f100b':'rgba(0,0,0,.57)');p.fillStyle=g;p.fillRect(r.x,r.y,r.w,r.h);p.restore();
    p.save();cutPath(p,r,2);p.strokeStyle=selected?'#a9643b':'#7d755b';p.stroke();cutPath(p,r,4);p.strokeStyle=selected?'#521409':'#393222';p.stroke();p.restore();
  };
  S.ring=(p,x,y,r,thick=7)=>{
    p.save();p.beginPath();p.arc(x,y,r,0,TAU);p.arc(x,y,Math.max(1,r-thick),0,TAU,true);p.clip();
    S.fill(p,{x:x-r,y:y-r,w:r*2,h:r*2},'stone');
    const g=p.createLinearGradient(x-r,y-r,x+r,y+r);g.addColorStop(0,'rgba(225,210,160,.44)');g.addColorStop(.45,'rgba(130,120,88,.05)');g.addColorStop(1,'rgba(0,0,0,.7)');p.fillStyle=g;p.fillRect(x-r,y-r,r*2,r*2);p.restore();
    for(const [off,c]of [[0,'#17130c'],[2,'#8c8260'],[thick-2,'#2e2719'],[thick,'#100d09']]){p.beginPath();p.arc(x,y,r-off,0,TAU);p.strokeStyle=c;p.lineWidth=1;p.stroke();}
  };
  S.text=(p,str,x,y,size=14,color=0xe5dcc3,shadow=true,align='left',bold=false)=>{
    if(!Fonts.p11)return;
    const f=bold?'b12':'p11',scale=size/(bold?12:11);p.save();p.translate(Math.round(x),Math.round(y));p.scale(scale,scale);p.imageSmoothingEnabled=false;
    let offset=align==='center'?-textWidth(f,str)/2:align==='right'?-textWidth(f,str):0;
    drawText(p,f,str,offset,0,color,shadow);p.restore();
  };
  S.icon=id=>{
    if(S.icons[id])return S.icons[id];
    const p=new Pix(36,36),steel=0xd0d2c7,gold=0xc99c46,skin=0xc8ad82;
    const sword=(flip)=>{const a=flip?7:28,b=flip?28:7;p.line(a,6,b,29,0x14120e,5);p.line(a,6,b,29,steel,3);p.line(flip?22:6,22,flip?30:14,29,gold,3);p.line(a,6,flip?13:22,13,0xf9f4dc,1);};
    switch(id){
      case'combat':sword(false);sword(true);break;
      case'stats':for(const [x,h,c]of [[5,17,0xb95e45],[15,27,0x658f4e],[25,12,0x587bb8]]){p.rect(x,32-h,7,h,0x171710);p.rect(x+1,33-h,5,h-2,c);p.line(x+1,33-h,x+5,33-h,shadeCol(c,1.6),1);}break;
      case'inv':case'bank':p.poly([[9,5],[27,5],[30,12],[29,30],[9,32],[5,26],[6,12]],0x72502b);p.poly([[8,6],[27,6],[24,17],[11,17],[6,11]],0x9d723b);p.line(9,9,12,14,0xc39c64,2);p.line(26,12,24,28,0x47301c,2);p.rect(17,14,6,5,0x241b10);p.frame(17,14,6,5,0xc7a35c);p.line(7,21,8,28,0xb69050,1);break;
      case'equip':p.disc(18,5,3,skin);p.line(18,10,18,21,0x9b875d,5);p.line(18,11,8,13,skin,3);p.line(8,13,5,6,skin,3);p.line(18,11,27,12,skin,3);p.line(27,12,30,6,skin,3);p.line(16,22,11,32,0xb6aa8a,4);p.line(21,22,25,32,0xb6aa8a,4);p.rect(14,14,8,7,0x847247);break;
      case'prayer':p.poly([[18,2],[23,13],[34,18],[23,22],[18,34],[13,23],[2,18],[13,13]],0x91b5b1);p.poly([[18,4],[20,15],[31,18],[20,19],[18,31],[16,20],[5,18],[16,16]],0xd9e4cb);break;
      case'magic':p.poly([[5,12],[23,5],[32,20],[15,31],[4,22]],0x796144);p.poly([[7,12],[24,8],[28,19],[15,26],[6,21]],0xd6c9a3);p.line(15,27,29,20,0xe9d9aa,2);p.line(8,13,12,24,0x756248,2);p.rect(18,10,4,6,0xa28966);break;
      case'quests':case'journal':p.disc(18,18,14,0x7287af);p.disc(18,18,12,0xcbd0c8);p.disc(18,18,9,0x4261ac);p.line(18,7,18,29,0xd7e1ea,2);p.line(7,18,29,18,0xd7e1ea,2);p.line(11,11,25,25,0xa4c0ed,2);p.line(11,25,25,11,0xa4c0ed,2);p.disc(18,18,4,0xf0edcf);break;
      case'friends':case'ignore':p.disc(18,18,14,id==='friends'?0xc8a128:0xb9271e);p.disc(16,16,11,id==='friends'?0xf5c338:0xf55030);p.rect(11,12,3,5,0x211a11);p.rect(23,12,3,5,0x211a11);p.line(11,23,16,id==='friends'?27:21,0x2a2112,2);p.line(16,id==='friends'?27:21,23,id==='friends'?25:22,0x2a2112,2);p.set(11,12,0xffeb9b);break;
      case'logout':p.rect(7,3,23,31,0x9d906f);p.rect(10,5,17,27,0x29251a);p.poly([[11,6],[24,8],[24,32],[11,30]],0x81734d);p.line(13,10,13,28,0xa39873,1);p.rect(20,20,3,2,gold);break;
      case'options':case'menu':p.line(9,29,24,13,0x2c2b23,7);p.line(9,28,24,12,0xa6a38b,5);p.poly([[21,4],[27,3],[24,9],[28,13],[33,9],[33,16],[29,21],[21,19],[17,12]],0xa6a38b);p.line(9,27,22,14,0xd5d0b0,1);p.disc(8,29,2,0x3f3925);break;
      case'music':p.line(7,7,27,4,gold,3);p.line(27,4,17,31,gold,4);p.line(7,7,14,30,0xd2b45d,4);p.line(14,30,19,31,gold,3);for(let i=0;i<5;i++)p.line(10+i*3,8,16+i,28-i*4,0xe2d9a8,1);break;
      case'clan':p.disc(11,11,5,skin);p.poly([[4,32],[5,19],[15,18],[19,32]],0x8a5443);p.disc(26,11,5,skin);p.poly([[19,32],[20,19],[30,18],[34,32]],0x758186);break;
      case'emotes':p.disc(19,6,4,skin);p.line(18,13,15,23,0x697a44,6);p.line(15,15,6,7,skin,3);p.line(23,12,30,20,skin,3);p.line(14,24,8,32,0x606c3c,4);p.line(18,24,25,33,0x606c3c,4);break;
      case'heart':p.disc(11,12,7,0xc82316);p.disc(24,12,7,0xc82316);p.poly([[4,14],[32,14],[18,31]],0xc82316);p.line(8,9,13,7,0xffa553,2);p.line(22,8,27,9,0xf56231,2);break;
      case'run':p.poly([[10,5],[21,5],[23,10],[18,15],[23,21],[30,24],[27,30],[9,30],[6,25],[13,20],[10,13]],0xdcc154);p.line(12,8,19,8,0xffe7a0,2);p.line(10,26,25,26,0x8e7026,2);break;
      case'world':p.disc(18,18,14,0x496983);p.disc(16,16,11,0x5e9eb0);p.poly([[9,7],[18,6],[22,12],[16,15],[13,22],[8,18]],0x9dba70);p.poly([[23,20],[29,18],[27,27],[21,30],[19,26]],0x798e4e);p.line(11,5,17,4,0xcedbca,2);break;
      case'save':p.rect(6,5,25,28,0x817956);p.rect(10,6,16,10,0xb5b299);p.rect(10,20,17,12,0xc8c2a4);p.rect(23,7,2,7,0x504836);break;
      case'full':p.frame(5,8,27,21,0xd5c6a1);p.frame(8,11,21,15,0x837c60);p.line(5,8,13,8,0xf5e7b6,2);p.line(32,29,25,29,0xf5e7b6,2);break;
      case'chat':p.rect(4,6,27,19,0xc8b48c);p.poly([[9,23],[16,23],[9,32]],0xc8b48c);for(let i=0;i<3;i++)p.line(8,11+i*4,26-i*3,11+i*4,0x75613e,1);break;
      case'up':case'down':p.poly(id==='up'?[[8,23],[18,11],[28,23]]:[[8,12],[18,24],[28,12]],0x262214);break;
      default:{const orig=IC['tab_'+id]||IC.o_map;if(orig){const c=canvas(36,36),q=c.getContext('2d');q.imageSmoothingEnabled=false;q.drawImage(orig,3,3,30,30);return S.icons[id]=c;}}
    }
    p.bevel(1.17,.7);p.outline(0x17140c,true);return S.icons[id]=p.canvas();
  };
  S.layout=(w,h,compact=false)=>{
    w=Math.max(240,w);h=Math.max(240,h);const m=clamp(Math.round(w/250),3,8),gap=Math.max(3,m),portrait=h>w*1.15;
    const L={w,h,m,portrait,frame:{x:0,y:0,w,h}};
    const footer=clamp(h*.077,30,60);
    if(!portrait){
      const sw=clamp(w*.279,Math.min(185,w*.36),Math.min(490,w*.36)),sx=w-sw-m,lw=sx-m-gap;
      const ch=compact?28:Math.max(70,h*.251);const worldH=h-2*m-footer-ch-gap;
      L.world={x:m,y:m,w:lw,h:worldH};L.chat={x:m,y:m+worldH+gap,w:lw,h:ch};L.channels={x:m,y:h-m-footer,w:lw,h:footer};
      const mapH=Math.min(sw*.665,h*.369),tabH=clamp(h*.079,29,62),bottom=h-m-footer;
      L.map={x:sx,y:m,w:sw,h:mapH};L.top={x:sx,y:m+mapH,w:sw,h:tabH};L.bottom={x:sx,y:bottom,w:sw,h:footer};
      L.panelFrame={x:sx,y:L.top.y+tabH,w:sw,h:bottom-(L.top.y+tabH)};
    }else{
      const worldH=compact?Math.min(w*.95,h*.45):Math.min(w*.76,h*.355),ch=compact?30:Math.min(155,h*.19);
      L.world={x:m,y:m,w:w-2*m,h:worldH};L.channels={x:m,y:h-m-38,w:w-2*m,h:38};L.chat={x:m,y:L.channels.y-ch-gap,w:w-2*m,h:ch};
      const my=m+worldH+gap,mh=L.chat.y-my-gap,sw=(w-3*m)*.54,sx=w-sw-m,th=34,bh=34;
      L.map={x:m,y:my,w:sx-2*m,h:Math.min((sx-2*m)*.79,mh*.55)};
      L.top={x:sx,y:my,w:sw,h:th};L.bottom={x:sx,y:my+mh-bh,w:sw,h:bh};L.panelFrame={x:sx,y:my+th,w:sw,h:mh-th-bh};
      L.quick={x:m,y:my+L.map.h+gap,w:L.map.w,h:Math.max(1,mh-L.map.h-gap)};
    }
    const f=L.panelFrame,pillar=clamp(f.w*.052,8,24);
    L.panel={x:f.x+pillar,y:f.y+6,w:f.w-pillar*2,h:Math.max(7,f.h-12)};
    L.slots=Array.from({length:28},(_,i)=>({x:L.panel.x+4+(i%4)*(L.panel.w-8)/4,y:L.panel.y+Math.floor(i/4)*L.panel.h/7,w:(L.panel.w-8)/4,h:L.panel.h/7}));
    L.tabs=Array.from({length:14},(_,i)=>{const r=i<7?L.top:L.bottom;return{x:r.x+(i%7)*r.w/7,y:r.y,w:r.w/7,h:r.h};});
    const ms=Math.min(L.map.w/246,L.map.h/168),mx=L.map.x+(L.map.w-246*ms)/2,my=L.map.y+(L.map.h-168*ms)/2;
    L.mapTransform={x:mx,y:my,s:ms};L.mapCircle={x:mx+124*ms,y:my+84*ms,r:73*ms};
    const mr=(x,y,w,h)=>({x:mx+x*ms,y:my+y*ms,w:w*ms,h:h*ms});
    L.orbs=[mr(1,43,63,31),mr(1,79,63,31),mr(7,113,63,31),mr(49,139,58,28)];
    L.compass=mr(2,0,51,46);L.utilities=[mr(204,20,38,38),mr(204,70,38,38),mr(204,120,38,38)];
    return L;
  };
  S.background=(p,L)=>{
    S.fill(p,L.frame,'stone');
    S.frame(p,{x:0,y:0,w:L.w,h:L.h},Math.min(5,L.m));
    S.fill(p,L.panelFrame,'stone');S.fill(p,L.panel,'brown');S.frame(p,L.panelFrame,5);
    const f=L.panelFrame,pillar=(f.w-L.panel.w)/2;
    for(const x of [f.x+4,f.x+f.w-pillar]){
      const r={x,y:f.y+4,w:pillar-4,h:f.h-8};S.fill(p,r,'stone');
      const g=p.createLinearGradient(x,0,x+r.w,0);g.addColorStop(0,'#17140e');g.addColorStop(.32,'rgba(211,197,151,.24)');g.addColorStop(.8,'rgba(0,0,0,.1)');g.addColorStop(1,'#19160f');p.fillStyle=g;p.fillRect(r.x,r.y,r.w,r.h);
      for(let y=r.y+29;y<r.y+r.h-2;y+=Math.max(25,pillar*2)){p.fillStyle='#201c12';p.fillRect(x,y,r.w,2);p.fillStyle='#776c50';p.fillRect(x,y+2,r.w,1);}
    }
    S.fill(p,L.chat,'paper');S.frame(p,L.chat,6);
    p.save();p.beginPath();p.rect(L.chat.x+6,L.chat.y+6,L.chat.w-12,L.chat.h-12);p.clip();
    const g=p.createLinearGradient(0,L.chat.y,0,L.chat.y+L.chat.h);g.addColorStop(0,'rgba(46,32,16,.30)');g.addColorStop(.13,'rgba(0,0,0,0)');g.addColorStop(.84,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(46,32,16,.17)');p.fillStyle=g;p.fillRect(L.chat.x,L.chat.y,L.chat.w,L.chat.h);p.restore();
    S.frame(p,{x:L.world.x-2,y:L.world.y-2,w:L.world.w+4,h:L.world.h+4},5);
    for(const r of L.tabs)S.stone(p,r);
    S.fill(p,L.map,'stone');
  };
  return S;
})();
