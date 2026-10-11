(function(root){
  'use strict';
  const KEY='starhop-sound';
  function normalize(value){return {enabled:value?.enabled===true,volume:Number.isFinite(Number(value?.volume))?Math.max(0,Math.min(100,Number(value.volume))):35,style:value?.style==='glass'?'glass':'wood',details:value?.details!==false};}
  // Small, bounded cues. Long jump chains never become a stream of notifications.
  function sequence(kind,options={}){
    const note=(at,freq,level=.12,length=.16)=>({at,freq,level,length});
    if(kind==='select')return [note(0,420,.055,.065)];
    if(kind==='undo')return [note(0,460,.09),note(.11,330,.08)];
    if(kind==='hint')return [note(0,520,.07),note(.12,650,.07)];
    if(kind==='start')return [note(0,330,.09),note(.12,440,.09)];
    if(kind==='move'||kind==='preview'){
      const hops=Math.max(1,Math.min(120,Number(options.hops)||1)),count=Math.min(hops,5),duration=Math.max(0,Math.min(1.5,Number(options.duration)||0));
      const notes=[];
      for(let i=0;i<count;i++)notes.push(note(duration?(i+1)*duration/count:i*.075,280+i*35,i===count-1?.15:.075,.13));
      if(options.finish){const finish=sequence(options.finish);const end=notes.at(-1).at+.2;notes.push(...finish.map(n=>({...n,at:n.at+end})));}
      return notes;
    }
    if(kind==='win')return [note(0,440,.1,.28),note(.13,554,.09,.3),note(.28,660,.1,.45)];
    if(kind==='loss')return [note(0,392,.075,.26),note(.18,330,.07,.36)];
    if(kind==='draw'||kind==='finish')return [note(0,392,.08,.25),note(.18,440,.07,.32)];
    return [];
  }
  function createEngine(env,initial){
    let prefs=normalize(initial),context,master,lastSelect=-Infinity;
    const voices=new Set();
    const available=!!env.AudioContext;
    function stop(){for(const voice of voices){try{voice.stop();}catch{}}voices.clear();}
    function volume(){if(master)master.gain.setTargetAtTime(prefs.enabled?(prefs.volume/100)**2*.8:0,context.currentTime,.015);}
    async function unlock(){
      if(!available||!prefs.enabled||env.hidden?.())return false;
      try{
        if(!context||context.state==='closed'){context=new env.AudioContext();master=context.createGain();master.gain.value=0;master.connect(context.destination);volume();}
        if(context.state==='suspended')await context.resume();
        return context.state==='running';
      }catch{return false;}
    }
    function play(kind,options){
      if(!prefs.enabled||prefs.volume===0||env.hidden?.()||context?.state!=='running')return false;
      if((kind==='select'||kind==='hint')&&!prefs.details)return false;
      if(kind==='select'&&context.currentTime-lastSelect<.065)return false;
      const notes=sequence(kind,options);if(!notes.length)return false;
      if(kind==='select')lastSelect=context.currentTime;
      // A new move replaces an old cue, important during fast AI observation.
      stop();
      try{
        for(const n of notes){
          const time=context.currentTime+.006+n.at,glass=prefs.style==='glass';
          for(const [ratio,gainScale] of [[1,1],[glass?2.01:1.52,glass?.23:.3]]){
            const osc=context.createOscillator(),gain=context.createGain();osc.type='sine';osc.frequency.setValueAtTime(n.freq*(glass?1.65:1)*ratio,time);
            if(!glass)osc.frequency.exponentialRampToValueAtTime(n.freq*ratio*.73,time+n.length);
            gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(n.level*gainScale,time+.004);gain.gain.exponentialRampToValueAtTime(.0001,time+n.length*(glass?1.45:1));
            osc.connect(gain);gain.connect(master);voices.add(osc);osc.onended=()=>{voices.delete(osc);osc.disconnect();gain.disconnect();};osc.start(time);osc.stop(time+n.length*(glass?1.45:1)+.025);
          }
        }
        return true;
      }catch{stop();return false;}
    }
    return {available,unlock,play,stop,settings:()=>({...prefs}),configure(value){prefs=normalize({...prefs,...value});if(!prefs.enabled||prefs.volume===0)stop();volume();return {...prefs};}};
  }
  if(typeof module==='object'&&module.exports){module.exports={normalize,sequence,createEngine};return;}
  const get=id=>document.getElementById(id);let saved;
  try{saved=JSON.parse(localStorage.getItem(KEY));}catch{}
  const engine=createEngine({AudioContext:root.AudioContext||root.webkitAudioContext,hidden:()=>document.hidden},saved);
  root.StarhopSound=engine;
  function update(){
    const p=engine.settings(),audible=p.enabled&&p.volume>0;
    get('sound').classList.toggle('active',audible);get('sound').setAttribute('aria-pressed',String(audible));get('sound').setAttribute('aria-label',audible?'关闭音效':'开启音效');get('sound').title=audible?'关闭音效 · '+p.volume+'%':'开启音效';
    get('sound-enabled').checked=p.enabled;get('sound-volume').value=String(p.volume);get('sound-volume-value').textContent=p.volume+'%';get('sound-style').value=p.style;get('sound-details').checked=p.details;
    get('sound-preview').disabled=!engine.available;get('sound-preview').textContent=p.enabled?'试听三连跳':'开启并试听';
    get('sound-status').textContent=!engine.available?'此浏览器不支持声音播放。':!p.enabled?'当前静音，点击“开启并试听”可体验。':p.volume===0?'音量为 0；调高后即可听见。':'已开启 · 切到后台时自动静音';
  }
  function configure(value){engine.configure(value);try{localStorage.setItem(KEY,JSON.stringify(engine.settings()));}catch{}update();}
  async function preview(){
    const p=engine.settings();configure({enabled:true,volume:p.volume||35});
    if(await engine.unlock()){if(engine.play('preview',{hops:3}))get('sound-status').textContent='试听：三连跳 · '+(engine.settings().style==='glass'?'清透琉璃':'温润木音');}
    else get('sound-status').textContent='声音暂未就绪，请再点击试听。';
  }
  get('sound').onclick=()=>{const p=engine.settings();configure({enabled:!(p.enabled&&p.volume>0),volume:p.volume||35});if(engine.settings().enabled)engine.unlock().then(ok=>{if(ok)engine.play('select');});};
  get('sound-enabled').onchange=()=>{configure({enabled:get('sound-enabled').checked});if(engine.settings().enabled)engine.unlock();};
  get('sound-style').onchange=()=>configure({style:get('sound-style').value});
  get('sound-volume').oninput=()=>configure({volume:get('sound-volume').value});
  get('sound-details').onchange=()=>configure({details:get('sound-details').checked});
  get('sound-preview').onclick=preview;
  document.addEventListener('pointerdown',()=>{engine.unlock();},{passive:true});
  document.addEventListener('keydown',()=>{engine.unlock();},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)engine.stop();});
  root.addEventListener('pagehide',()=>engine.stop());
  update();
})(typeof window!=='undefined'?window:globalThis);
