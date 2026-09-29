'use strict';
/* Fade only a tall structure that intersects the camera-to-character sightline.
 * Collision and input remain unchanged. GPU opacity is reset after every pass.
 */
const WorldVisibility=(()=>{
  const V={faded:[],solid:[],fadedCount:0};
  function intersects(o,from,to){
    let lo=0,hi=1;
    const phi=o.phi||0,c=Math.cos(phi),s=Math.sin(phi);
    const point=a=>o.kind==='arch'?[-(a[0]-o.x)*s+(a[2]-o.y)*c,a[1],(a[0]-o.x)*c+(a[2]-o.y)*s]:[a[0]-o.x,a[1],a[2]-o.y];
    const a=point(from),b=point(to),box=o.kind==='arch'?[[ -o.half,o.half],[-.1,o.height],[-o.thick,o.thick]]:[[-o.radius,o.radius],[-.1,o.height],[-o.radius,o.radius]];
    for(let i=0;i<3;i++){
      const d=b[i]-a[i],[min,max]=box[i];if(Math.abs(d)<1e-8){if(a[i]<min||a[i]>max)return false;continue;}
      let t0=(min-a[i])/d,t1=(max-a[i])/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false;
    }
    if(lo>.99||hi<.01)return false;
    if(o.kind==='arch'){
      // Do not fade an arch when the sightline goes through its open aperture.
      for(const t of [lo,(lo+hi)/2,hi]){
        const u=a[0]+(b[0]-a[0])*t,h=a[1]+(b[1]-a[1])*t;
        if(Math.abs(u)>=o.aperture||h>=o.spring+Math.sqrt(Math.max(0,o.aperture**2-u*u)))return true;
      }return false;
    }
    return true;
  }
  V.intersects=intersects;
  V.update=(cam,dt)=>{
    V.faded=[];V.solid=[];const p=renderPos(G.player,clamp((G.now-G.lastTick)/TICK_MS,0,1)),h=groundH(...p),from=[cam.eye[0],cam.eye[1],-cam.eye[2]];
    for(const o of WORLD.occluders||[]){
      const hiding=intersects(o,from,[p[0],h+1.2,p[1]])||intersects(o,from,[p[0],h+.6,p[1]]);
      const target=hiding?.20:1;
      o.opacity=o.opacity===undefined?target:lerp(o.opacity,target,1-Math.exp(-Math.max(dt,.016)*14));
      if(Math.abs(o.opacity-target)<.01)o.opacity=target;
      o.distance=(o.x-from[0])**2+(o.y-from[2])**2;
      (o.opacity<.99?V.faded:V.solid).push(o);
    }
    V.faded.sort((a,b)=>b.distance-a.distance);V.fadedCount=V.faded.length;
  };
  V.drawOpaque=R=>{for(const o of V.solid)for(const g of o.gpus)R.drawGPU(g);};
  V.drawFaded=R=>{
    R.setDepthWrite(false);
    for(const o of V.faded){R.gl.uniform1f(R.uOpacity,o.opacity);for(const g of o.gpus)R.drawGPU(g);}
    R.gl.uniform1f(R.uOpacity,1);R.setDepthWrite(true);
  };
  return V;
})();
