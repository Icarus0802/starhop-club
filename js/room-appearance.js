(function(root){
  'use strict';
  const palettes=['graphite','midnight','sand'],KEY='starhop-room';
  function normalize(value){return {palette:palettes.includes(value?.palette)?value.palette:'graphite',dim:Number.isFinite(Number(value?.dim))?Math.max(20,Math.min(85,Number(value.dim))):55};}
  function validateFile(file){
    if(!file||!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type))throw new Error('请选择 JPG、PNG、WebP 或 AVIF 图片');
    if(file.size>20*1024*1024)throw new Error('图片超过 20 MB，请选择小一点的图片');
  }
  if(typeof module==='object'&&module.exports){module.exports={normalize,validateFile};return;}
  const get=id=>document.getElementById(id);
  let prefs=normalize(null),imageURL=null,revision=0,databasePromise,writeQueue=Promise.resolve();
  try{prefs=normalize(JSON.parse(localStorage.getItem(KEY)));}catch{}
  function status(message){get('background-status').textContent=message;}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch{status('当前外观已生效；浏览器未允许保存配色设置。');}}
  function apply(){
    document.body.dataset.room=prefs.palette;
    const theme=prefs.palette==='sand'?'light':'dark';
    if(document.body.dataset.theme!==theme)get('theme-toggle').click();
    for(const palette of palettes)get('palette-'+palette).setAttribute('aria-pressed',String(palette===prefs.palette));
    document.body.style.setProperty('--background-dim',String(prefs.dim/100));
    get('background-dim').value=String(prefs.dim);get('background-dim-value').textContent=prefs.dim+'%';
  }
  function showImage(url,name='自定义背景'){
    const previous=imageURL;imageURL=url;
    document.body.style.setProperty('--room-image',url?'url("'+url+'")':'none');
    document.body.classList.toggle('custom-background',!!url);
    get('background-preview').style.backgroundImage=url?'url("'+url+'")':'none';
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
    try{await writeImage(null);if(current===revision)status('已恢复纯色背景。');}
    catch{if(current===revision)status('已恢复纯色，但未能删除浏览器保存的图片。');}
  };
  apply();
  const loadingRevision=revision;
  readImage().then(async blob=>{
    if(!blob||revision!==loadingRevision)return;
    validateFile(blob);const url=await decode(blob);
    if(revision===loadingRevision)showImage(url,blob.name);else URL.revokeObjectURL(url);
  }).catch(()=>{});
})(typeof window!=='undefined'?window:globalThis);
