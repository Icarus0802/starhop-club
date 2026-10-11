(function(root){
  'use strict';
  const palettes=['graphite','midnight','sand','anime'],KEY='starhop-room';
  const pieceColors={
    gold:{color:'#caa873',name:'香槟金',short:'金'},teal:{color:'#8eb4bc',name:'雾青',short:'青'},violet:{color:'#a99cca',name:'鸢尾紫',short:'紫'},blue:{color:'#709be0',name:'钴蓝',short:'蓝'},rose:{color:'#c78ca4',name:'玫瑰灰',short:'玫瑰'},silver:{color:'#c5cbd7',name:'月光银',short:'银'},
    sakura:{color:'#f0a9c7',name:'樱花粉',short:'樱粉'},sky:{color:'#85c8ee',name:'晴空蓝',short:'天蓝'},mint:{color:'#72cfb1',name:'薄荷青',short:'薄荷'},amethyst:{color:'#b490e0',name:'紫水晶',short:'紫晶'},amber:{color:'#eda35b',name:'琥珀橙',short:'琥珀'},pearl:{color:'#e6e2d6',name:'珍珠白',short:'珍珠'}
  };
  const pieceSchemes={classic:['gold','teal','violet','blue','rose','silver'],sakura:['sky','mint','amethyst','sakura','amber','pearl'],mint:['amber','sakura','amethyst','mint','sky','pearl'],amethyst:['pearl','sky','mint','amethyst','sakura','amber'],sunset:['blue','mint','violet','amber','sakura','pearl']};
  function normalize(value){return {palette:palettes.includes(value?.palette)?value.palette:'graphite',dim:Number.isFinite(Number(value?.dim))?Math.max(20,Math.min(85,Number(value.dim))):55,artwork:value?.artwork!==false,motion:value?.motion===true,pieceScheme:Object.hasOwn(pieceSchemes,value?.pieceScheme)?value.pieceScheme:'classic',ownColor:Object.hasOwn(pieceColors,value?.ownColor)?value.ownColor:'auto',boardStyle:['auto','sakura','rosewood','porcelain','wood','crystal','ink'].includes(value?.boardStyle)?value.boardStyle:'auto',moveEffect:['classic','glow','none'].includes(value?.moveEffect)?value.moveEffect:'classic',showPath:value?.showPath!==false,autoReplay:value?.autoReplay!==false};}
  function resolvePieces(value,players=[3,0],humanSeat=0){
    const options=normalize(value),ids=pieceSchemes[options.pieceScheme].slice(),own=players[Math.max(0,Math.min(players.length-1,Number(humanSeat)||0))];
    if(options.ownColor!=='auto'){
      const other=ids.indexOf(options.ownColor);if(other>=0&&other!==own)ids[other]=ids[own];
      ids[own]=options.ownColor;
    }
    return {colors:ids.map(id=>pieceColors[id].color),names:ids.map(id=>pieceColors[id].name),shortNames:ids.map(id=>pieceColors[id].short)};
  }
  function validateFile(file){
    if(!file||!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type))throw new Error('请选择 JPG、PNG、WebP 或 AVIF 图片');
    if(file.size>20*1024*1024)throw new Error('图片超过 20 MB，请选择小一点的图片');
  }
  if(typeof module==='object'&&module.exports){module.exports={normalize,validateFile,resolvePieces,pieceColors,pieceSchemes};return;}
  const get=id=>document.getElementById(id);
  let prefs=normalize(null),imageURL=null,revision=0,databasePromise,writeQueue=Promise.resolve(),piecesChanged=null;
  try{prefs=normalize(JSON.parse(localStorage.getItem(KEY)));}catch{}
  function status(message){get('background-status').textContent=message;}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch{status('当前外观已生效；浏览器未允许保存配色设置。');}}
  function apply(){
    document.body.dataset.room=prefs.palette;
    document.body.dataset.board=prefs.boardStyle;document.body.dataset.moveEffect=prefs.moveEffect;
    document.body.classList.toggle('hide-move-path',!prefs.showPath);
    for(const style of ['auto','sakura','rosewood','porcelain','wood','crystal','ink'])get('board-choice-'+style).setAttribute('aria-pressed',String(style===prefs.boardStyle));
    get('board-style').value=prefs.boardStyle;get('move-effect').value=prefs.moveEffect;
    get('show-move-path').checked=prefs.showPath;get('auto-replay').checked=prefs.autoReplay;
    document.body.classList.toggle('theme-artwork',prefs.artwork);
    document.body.classList.toggle('theme-motion',prefs.motion);
    const theme=prefs.palette==='sand'?'light':'dark';
    if(document.body.dataset.theme!==theme)get('theme-toggle').click();
    for(const palette of palettes)get('palette-'+palette).setAttribute('aria-pressed',String(palette===prefs.palette));
    get('anime-options').hidden=prefs.palette!=='anime';
    get('theme-artwork').checked=prefs.artwork;get('theme-motion').checked=prefs.motion;
    get('piece-scheme').value=prefs.pieceScheme;get('own-piece-color').value=prefs.ownColor;
    const preview=resolvePieces(prefs);get('piece-palette-preview').replaceChildren();
    for(let p=0;p<6;p++){const chip=document.createElement('span');chip.style.setProperty('--piece-color',preview.colors[p]);chip.title=preview.names[p];chip.setAttribute('aria-label',preview.names[p]);get('piece-palette-preview').append(chip);}
    get('background-empty').textContent=prefs.palette==='anime'&&prefs.artwork?'星梦庭院 · 主题插画':'使用棋室默认背景';
    document.body.style.setProperty('--background-dim',String(prefs.dim/100));
    get('background-dim').value=String(prefs.dim);get('background-dim-value').textContent=prefs.dim+'%';
  }
  function showImage(url,name='自定义背景'){
    const previous=imageURL;imageURL=url;
    document.body.style.setProperty('--room-image',url?'url("'+url+'")':'none');
    document.body.classList.toggle('custom-background',!!url);
    get('background-preview').style.backgroundImage=url?'url("'+url+'")':'';
    get('background-empty').hidden=!!url;get('remove-background').disabled=!url;
    get('background-name').textContent=url?name:'';
    if(previous)URL.revokeObjectURL(previous);
  }
  function database(){
    if(!databasePromise)databasePromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open('starhop-appearance',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('images');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('图片存储被其他页面占用'));
    }).catch(error=>{databasePromise=null;throw error;});
    return databasePromise;
  }
  async function readImage(){
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('images','readonly'),request=tx.objectStore('images').get('background');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
  }
  function writeImage(blob){
    // Serialize replacements/removal so the last UI action also wins on disk.
    const task=writeQueue.catch(()=>{}).then(async()=>{
      const db=await database();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('images','readwrite'),store=tx.objectStore('images');
        if(blob)store.put(blob,'background');else store.delete('background');
        tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });
    });writeQueue=task;return task;
  }
  function decode(blob){
    const url=URL.createObjectURL(blob);
    return new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve(url);
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('图片无法读取，请换一张图片'));};image.src=url;
    });
  }
  for(const palette of palettes)get('palette-'+palette).onclick=()=>{prefs.palette=palette;apply();save();};
  get('theme-artwork').onchange=()=>{prefs.artwork=get('theme-artwork').checked;apply();save();};
  get('theme-motion').onchange=()=>{prefs.motion=get('theme-motion').checked;apply();save();};
  get('piece-scheme').onchange=()=>{prefs=normalize({...prefs,pieceScheme:get('piece-scheme').value});apply();save();piecesChanged?.();};
  get('own-piece-color').onchange=()=>{prefs=normalize({...prefs,ownColor:get('own-piece-color').value});apply();save();piecesChanged?.();};
  const sections=['background','board','pieces','effects'];
  function selectSection(selected){for(const section of sections){const active=selected===section,tab=get('appearance-tab-'+section);tab.setAttribute('aria-selected',String(active));tab.setAttribute('tabindex',active?'0':'-1');get('appearance-panel-'+section).hidden=!active;}}
  for(const [index,section] of sections.entries()){const tab=get('appearance-tab-'+section);tab.onclick=()=>selectSection(section);tab.onkeydown=event=>{let next;if(event.key==='ArrowRight')next=(index+1)%4;else if(event.key==='ArrowLeft')next=(index+3)%4;else if(event.key==='Home')next=0;else if(event.key==='End')next=3;else return;event.preventDefault();selectSection(sections[next]);get('appearance-tab-'+sections[next]).focus();};}
  for(const [id,key] of [['board-style','boardStyle'],['move-effect','moveEffect'],['show-move-path','showPath'],['auto-replay','autoReplay']])get(id).onchange=()=>{const checkbox=key==='showPath'||key==='autoReplay';prefs=normalize({...prefs,[key]:checkbox?get(id).checked:get(id).value});apply();save();};
  for(const style of ['auto','sakura','rosewood','porcelain','wood','crystal','ink'])get('board-choice-'+style).onclick=()=>{prefs.boardStyle=style;apply();save();};
  window.StarhopRoom={effects:()=>({style:prefs.moveEffect,autoReplay:prefs.autoReplay}),pieces:(players,humanSeat)=>resolvePieces(prefs,players,humanSeat),onPiecesChange:fn=>{piecesChanged=fn;}};
  get('appearance-settings').onclick=()=>get('appearance-dialog').showModal();
  get('close-appearance').onclick=()=>get('appearance-dialog').close();
  get('background-dim').oninput=()=>{prefs=normalize({...prefs,dim:get('background-dim').value});apply();save();};
  get('upload-background').onclick=()=>get('background-file').click();
  get('background-file').onchange=async()=>{
    const file=get('background-file').files?.[0];get('background-file').value='';if(!file)return;
    const current=++revision;
    try{
      validateFile(file);status('正在读取图片…');const url=await decode(file);
      if(current!==revision){URL.revokeObjectURL(url);return;}
      showImage(url,file.name);
      try{await writeImage(file);if(current===revision)status('背景已保存到此浏览器。');}
      catch{if(current===revision)status('背景已应用，但浏览器无法保存图片；刷新后需要重新选择。');}
    }catch(error){if(current===revision)status(error.message);}
  };
  get('remove-background').onclick=async()=>{
    const current=++revision;showImage(null);
    try{await writeImage(null);if(current===revision)status('已恢复当前主题的默认背景。');}
    catch{if(current===revision)status('已恢复默认背景，但未能删除浏览器保存的图片。');}
  };
  apply();
  const loadingRevision=revision;
  readImage().then(async blob=>{
    if(!blob||revision!==loadingRevision)return;
    validateFile(blob);const url=await decode(blob);
    if(revision===loadingRevision)showImage(url,blob.name);else URL.revokeObjectURL(url);
  }).catch(()=>{});
})(typeof window!=='undefined'?window:globalThis);
