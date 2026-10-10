(function(){
  'use strict';
  const get=id=>document.getElementById(id),KEY='starhop-appearance';
  let appearance={theme:'dark',focus:false};
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
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&appearance.focus&&!document.querySelector('dialog[open]')){appearance.focus=false;apply();save();}
  });
  apply();
})();
