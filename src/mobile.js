'use strict';
/* Touch presentation uses the same game actions and online authority as the
 * classic frame. A roomy sheet supplements, rather than replaces, the 28 slots. */
const Mobile = (() => {
  const M={page:'inventory',options:false,selection:null,signature:null};
  const create=(tag,text,parent)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(parent)parent.appendChild(e);return e;};
  const button=(label,fn,parent)=>{const b=create('button',label,parent);b.type='button';b.onclick=fn;return b;};
  const live=()=>G.player&&!G.player.dead&&(!Online.active||Online.ready);
  M.food=()=>{const a=G.player;if(!live())return;const i=findFoodIdx(a);if(i<0){gameMsg('Your bag has no food. Visit the bank to resupply.');return;}eatFood(a,i);};
  M.potion=()=>{const a=G.player;if(!live())return;let i=findPotIdx(a,'prayer');if(i<0)i=findPotIdx(a,'restore');if(i<0)i=a.inv.findIndex(s=>s&&ITEMS[s.id]?.pot);if(i<0){gameMsg('Your bag has no potion. Visit the bank to resupply.');return;}drinkPotion(a,i);};
  M.prayers=()=>{const a=G.player;if(!live())return;if(a.prayers.size){UI.lastPrayers=[...a.prayers];for(const id of UI.lastPrayers)togglePrayer(a,id,true);}else if(UI.lastPrayers?.length){for(const id of UI.lastPrayers)togglePrayer(a,id,true);}else M.open('prayers');};
  M.special=()=>{const a=G.player;if(!live())return;const special=weaponOf(a).spec;if(!special){gameMsg('Equip a weapon with a special attack first.');return;}if(a.spec<special.cost){gameMsg('Your special attack energy is too low.');return;}a.specOn=!a.specOn;};
  M.open=page=>{M.page=page||'inventory';M.selection=null;M.options=false;Client.open('touch');};
  const dockActions=[['Eat',M.food],['Potion',M.potion],['Prayers',M.prayers],['Special',M.special],['Run',()=>{if(live())G.player.runOn=!G.player.runOn;}],['Bag',()=>M.open('inventory')],['More',()=>Client.open('menu')]];
  const baseLayout=Client.layout;
  Client.layout=()=>{
    baseLayout();if(!Client.surface)return;
    if(!document.getElementById('mobile-style')){const style=create('style');style.id='mobile-style';style.textContent=`
      #touch-dock{position:absolute;display:flex;gap:3px;pointer-events:auto;padding:2px;background:linear-gradient(#514834,#2d271c);border-radius:4px;box-shadow:inset 0 1px #9d845344}
      #touch-dock button{flex:1;min-width:0;min-height:44px;padding:3px 1px;font:12px Georgia,serif;line-height:1.15;white-space:pre-line;border-radius:4px;background:linear-gradient(#5e523a55,#322b20);border-color:#19140e;box-shadow:inset 0 1px #a78c4e33;text-shadow:0 1px #000}
      #touch-dock button[aria-pressed=true]{background:linear-gradient(#71672e,#46451e);box-shadow:inset 0 0 0 1px #d6bf64}
      .touch-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px;padding:4px;background:#201b1380;border:1px solid #806c4633;border-radius:6px}.touch-tabs button{flex:1;min-width:70px;padding:7px}
      .touch-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;padding:6px;border-radius:5px;background:#201b1477;border:1px solid #75613d44}.touch-grid button{min-height:66px;padding:5px;font-size:12px;overflow-wrap:anywhere;line-height:1.15;background:radial-gradient(ellipse at 50% 15%,#87704922,transparent 80%);border:1px solid #8d76432b;border-radius:4px;box-shadow:none;color:#d4c7a5}
      .touch-grid canvas{position:static!important;display:block;margin:0 auto 3px;width:32px;height:32px;image-rendering:auto;filter:drop-shadow(0 2px 2px #0008)}
      .touch-grid button[aria-pressed=true]{outline:2px solid #d9c268;outline-offset:-2px}.touch-actions{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
      #world-connection{position:absolute;pointer-events:auto;background:linear-gradient(#453a2bef,#2c241bef);border:1px solid #9c8258;border-radius:6px;box-shadow:0 4px 12px #0008;padding:8px;color:#eee0b9;font:13px Georgia,serif;max-width:330px}
      #world-connection p{margin:0 0 6px}#world-connection button{min-height:44px;padding:7px;margin-right:5px;font-size:13px}
      @media(max-width:350px){#touch-dock{gap:0}}
      @media(orientation:landscape){.touch-grid{grid-template-columns:repeat(7,minmax(0,1fr))}}
    `;document.head.appendChild(style);}
    M.buttons=[];
    if(Client.mobile){
      // The mobile action row occupies the old channel row, never the world.
      for(const b of [...Client.bar.querySelectorAll('button')])if(['All','Game','Public','Private','Clan','Trade','Report Abuse'].includes(b.getAttribute('aria-label')))b.remove();
      // Portrait duplicate quick buttons become utility shortcuts instead.
      if(Client.L.quick){for(const b of [...Client.bar.querySelectorAll('button')])if(['Eat','Potion','Run','Special','Menu'].includes(b.getAttribute('aria-label')))b.remove();}
      const r=Client.L.channels,dock=create('div',null,Client.bar);dock.id='touch-dock';dock.setAttribute('aria-label','Touch combat controls');Object.assign(dock.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});
      for(const [label,action]of dockActions){const b=button(label,()=>{if(App.mode==='game'&&!Client.panel)action();},dock);b.setAttribute('aria-label',label==='Bag'?'Open large inventory':label);M.buttons.push([label,b]);}
    }
    M.connection=create('div',null,Client.bar);M.connection.id='world-connection';M.connection.style.display='none';M.connectionKey=null;
  };
  const baseDraw=Client.draw;
  Client.draw=()=>{baseDraw();const a=G.player;if(!a)return;
    for(const [label,b]of M.buttons||[]){
      let value='';if(label==='Eat')value=a.inv.filter(s=>s&&ITEMS[s.id]?.food).length+' food';
      if(label==='Potion')value=a.inv.filter(s=>s&&ITEMS[s.id]?.pot).reduce((n,s)=>n+s.n,0)+' doses';
      if(label==='Special')value=Math.floor(a.spec)+'%';if(label==='Run')value=Math.floor(a.run)+'%';
      if(label==='Prayers')value=Math.ceil(a.pp)+' PP';const text=label+(value?'\n'+value:'');if(b.textContent!==text)b.textContent=text;
      b.disabled=!['Bag','More'].includes(label)&&!live();b.setAttribute('aria-pressed',String(label==='Run'?a.runOn:label==='Special'?a.specOn:label==='Prayers'?a.prayers.size>0:false));
    }
    if(!M.connection)return;
    const show=Online.active&&!Online.ready&&!Client.panel,key=show?Online.status:'';
    M.connection.style.display=show?'block':'none';
    if(show){const r=Client.L.world;Object.assign(M.connection.style,{left:r.x+8+'px',top:r.y+58+'px',width:Math.max(100,Math.min(330,r.w-16))+'px'});}
    if(key!==M.connectionKey){M.connectionKey=key;M.connection.replaceChildren();if(show){create('p',Online.status,M.connection);create('p','Movement waits for the server. Offline modes are available right away.',M.connection);if(Online.manualClose)button('Retry connection',()=>{Online.manualClose=false;Online.attempts=0;Online.connect();},M.connection);button('Choose another mode',()=>Client.open('menu'),M.connection);}}
  };
  const baseChat=Client.drawChat;
  Client.drawChat=p=>{baseChat(p);if(Client.mobile){Classic.fill(p,Client.L.channels,'stone');Classic.frame(p,Client.L.channels,2);}};
  const basePanel=Client.renderPanel;
  Client.renderPanel=()=>{basePanel();if(Client.panel!=='touch')return;const root=Client.root,a=G.player;
    const tabs=create('div',null,root);tabs.className='touch-tabs';for(const [page,label]of [['inventory','Bag'],['equipment','Gear'],['prayers','Prayers'],['spells','Spells'],['combat','Combat']]){const b=button(label,()=>{M.page=page;M.selection=null;Client.renderPanel();},tabs);b.setAttribute('aria-pressed',String(M.page===page));}
    const note=create('p',Online.active?'World 1 keeps running while this panel is open.':'Local play pauses while this panel is open.',root);note.className='client-help';
    const grid=create('div',null,root);grid.className='touch-grid';
    const item=(label,id,fn)=>{const b=button('',fn,grid);if(id){const c=create('canvas',null,b);c.width=c.height=32;c.getContext('2d').drawImage(itemIcon(id),0,0);}create('span',label,b);return b;};
    if(M.page==='inventory'){
      const actions=create('div',null,root);actions.className='touch-actions';button(M.options?'Done with item options':'Item options',()=>{M.options=!M.options;M.selection=null;Client.renderPanel();},actions);
      a.inv.forEach((s,i)=>{const b=item(s?itemName(s):'Empty',s?.id,()=>{if(!s)return;if(M.options){M.selection={index:i,id:s.id,n:s.n};Client.renderPanel();}else{invDefault(i);if(!Online.active)Client.renderPanel();}});b.disabled=!s;b.dataset.inventorySlot=i;});
      const selected=M.selection;if(selected){const s=a.inv[selected.index];if(s&&s.id===selected.id&&s.n===selected.n){create('h2',itemName(s),root);const row=create('div',null,root);row.className='touch-actions';for(const entry of itemMenu(a,selected.index))button(stripTags(entry.text),()=>{const now=a.inv[selected.index];if(!now||now.id!==selected.id||now.n!==selected.n)return;M.selection=null;entry.fn();Client.renderPanel();},row);}else M.selection=null;}
    }else if(M.page==='equipment'){
      for(const slot of SLOTS){const s=a.eq[slot];const b=item(slot+': '+(s?itemName(s):'empty'),s?.id,()=>{unequipSlot(a,slot);if(!Online.active)Client.renderPanel();});b.disabled=!s;}
    }else if(M.page==='prayers'){
      for(const id of PR_ORDER){const pr=PRAYER_BY_ID[id],b=button(pr.name+' · '+pr.lvl,toggle.bind(null,id),grid);b.setAttribute('aria-pressed',String(a.prayers.has(id)));}
      function toggle(id){togglePrayer(a,id);if(!Online.active)Client.renderPanel();}
    }else if(M.page==='spells'){
      for(const sp of SPELLS.filter(sp=>!Online.active||!['frostDart','sanguineDart'].includes(sp.id))){const b=button(sp.name+' · Lv '+sp.lvl,()=>{selectSpell(sp);if(G.spellSel)Client.close();},grid);b.disabled=a.stats.mag<sp.lvl;}
      create('p','Choose a spell, then tap your target in the world.',root);
    }else{
      const w=weaponOf(a),styles=STYLES[w.cat]||STYLES.unarmed;
      styles.forEach((s,i)=>{const b=button(s.n,()=>{a.style=i;a.autocast=null;Client.renderPanel();},grid);b.setAttribute('aria-pressed',String(a.style===i));});
      button('Auto retaliate: '+(a.autoRetal?'on':'off'),()=>{a.autoRetal=!a.autoRetal;Client.renderPanel();},grid);
      button('Special: '+Math.floor(a.spec)+'%',()=>{M.special();Client.renderPanel();},grid);
    }
    button('Return to game',Client.close,root);
  };
  return M;
})();
