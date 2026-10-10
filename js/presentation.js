(function(){
  'use strict';
  const get=id=>document.getElementById(id),KEY='starhop-appearance';
  let appearance={theme:'dark',focus:false};
  let immersive=false,fullscreenPending=false,noticeTimer;
  try{
    const saved=JSON.parse(localStorage.getItem(KEY));
    if(saved&&typeof saved==='object')appearance={theme:saved.theme==='light'?'light':'dark',focus:saved.focus===true};
  }catch{}
  function apply(){
    document.body.dataset.theme=appearance.theme;
    document.documentElement.dataset.theme=appearance.theme;
    document.body.classList.toggle('focus-mode',appearance.focus);
    get('theme-toggle').setAttribute('aria-pressed',String(appearance.theme==='light'));
    get('theme-toggle').setAttribute('aria-label',appearance.theme==='dark'?'切换到浅色棋室':'切换到深色棋室');
    get('theme-toggle').title=appearance.theme==='dark'?'浅色棋室':'深色棋室';
    get('theme-icon').setAttribute('href','#ui-'+(appearance.theme==='dark'?'sun':'moon'));
    get('focus-mode').setAttribute('aria-pressed',String(appearance.focus));
    get('focus-mode').setAttribute('aria-label',appearance.focus?'退出专注模式':'进入专注模式');
    get('focus-mode').title=appearance.focus?'退出专注':'专注棋盘';
  }
  function save(){try{localStorage.setItem(KEY,JSON.stringify(appearance));}catch{}}
  get('theme-toggle').onclick=()=>{appearance.theme=appearance.theme==='dark'?'light':'dark';apply();save();};
  get('focus-mode').onclick=()=>{appearance.focus=!appearance.focus;apply();save();};
  function analysis(open){
    document.body.classList.toggle('analysis-open',open);
    document.body.classList.toggle('analysis-hidden',!open);
    get('toggle-analysis').setAttribute('aria-expanded',String(open));
  }
  get('toggle-analysis').onclick=()=>{
    const visible=document.body.classList.contains('analysis-open')||window.matchMedia('(min-width: 1100px)').matches&&!document.body.classList.contains('analysis-hidden');
    analysis(!visible);
  };
  get('close-analysis').onclick=()=>{analysis(false);get('toggle-analysis').focus();};
  const wide=window.matchMedia('(min-width: 1100px)');
  function analysisLabel(){get('toggle-analysis').setAttribute('aria-expanded',String(document.body.classList.contains('analysis-open')||wide.matches&&!document.body.classList.contains('analysis-hidden')));}
  wide.addEventListener('change',analysisLabel);analysisLabel();
  function display(){
    document.body.classList.toggle('immersive',immersive);
    get('fullscreen').setAttribute('aria-pressed',String(immersive));
    get('fullscreen').setAttribute('aria-label',immersive?'退出全屏':'进入全屏');
    get('fullscreen-label').textContent=immersive?'退出全屏':'全屏';
  }
  function notice(message){
    const el=get('display-notice');el.textContent=message;el.hidden=false;
    clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{el.hidden=true;},4500);
  }
  get('fullscreen').onclick=async()=>{
    if(fullscreenPending)return;
    if(immersive){
      if(document.fullscreenElement){
        try{await document.exitFullscreen();}catch{notice('请按 Esc 退出浏览器全屏');return;}
      }
      immersive=false;display();return;
    }
    immersive=true;display();fullscreenPending=true;
    try{
      if(!document.documentElement.requestFullscreen||document.fullscreenEnabled===false)throw new Error('fullscreen unavailable');
      await document.documentElement.requestFullscreen();
    }catch{
      // Embedded browsers may disable native fullscreen. The playable board
      // still fills this tab, and the same button/Escape restores the layout.
      notice('已铺满当前网页；此内置浏览器不支持系统全屏。独立浏览器可进入全屏。');
    }finally{fullscreenPending=false;}
  };
  document.addEventListener('fullscreenchange',()=>{immersive=!!document.fullscreenElement;display();});
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;
    if(immersive&&!document.fullscreenElement){immersive=false;display();return;}
    if(document.body.classList.contains('analysis-open')){analysis(false);get('toggle-analysis').focus();return;}
    if(appearance.focus&&!document.fullscreenElement){appearance.focus=false;apply();save();}
  });
  apply();display();
})();
