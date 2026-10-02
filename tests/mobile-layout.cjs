'use strict';
// Pure geometry checks, not a substitute for rendering/device verification.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ctx=vm.createContext({Math,assert,console});
vm.runInContext('const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));',ctx);
vm.runInContext(fs.readFileSync(path.join(root,'src/classic.js'),'utf8'),ctx);
let count=0;
for(const [w,h]of [[320,568],[360,640],[390,844],[412,839],[568,320],[740,360],[844,390],[839,412],[1024,768]]){
 const l=vm.runInContext(`Classic.layout(${w},${h},false,true)`,ctx);
 for(const r of [l.world,l.chat,l.channels,l.map,l.panel,...l.tabs,...l.slots])assert.ok(r.w>0&&r.h>0&&r.x>=0&&r.y>=0&&r.x+r.w<=w+1&&r.y+r.h<=h+1,`${w}×${h} geometry`);
 assert.ok(l.channels.h>=48);assert.ok(l.channels.y>=l.world.y+l.world.h);
 assert.ok((l.channels.w-4-(w<=350?0:6*3))/7>=44,`${w}×${h} dock width`);
 const original=vm.runInContext(`Classic.layout(${w},${h},false,false)`,ctx);assert.ok(l.world.h>=original.world.h,`${w}×${h} world is no smaller`);
 console.log(`PASS mobile layout ${w}×${h}`);count++;
}
console.log('MOBILE_LAYOUT_TESTS_PASSED='+count);
