'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const dir of ['src','tools','tests'])for(const file of fs.readdirSync(path.join(root,dir))){
 if(!/\.(?:js|cjs)$/.test(file))continue;
 const result=cp.spawnSync(process.execPath,['--check',path.join(root,dir,file)],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
console.log('All project JavaScript passed syntax checks.');
