'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../js/engine.js'),A=require('../js/ai.js');

// This small DOM exercises the real scripts and saved games. It does not claim
// to measure layout, pointer hit areas, fonts, or browser contrast rendering.
class Element{
  constructor(tag,owner){
    this.localName=tag.toLowerCase();this.tagName=tag.toUpperCase();this.ownerDocument=owner;this.children=[];this.attributes={};this.dataset={};this.style={setProperty(key,value){this[key]=value;}};this.value='';this.disabled=false;this.hidden=false;this.open=false;this.checked=false;this.listeners={};this._text='';
    this.classList={add:(...names)=>{const s=this.classes();names.forEach(n=>s.add(n));this.className=[...s].join(' ');},remove:(...names)=>{const s=this.classes();names.forEach(n=>s.delete(n));this.className=[...s].join(' ');},contains:name=>this.classes().has(name),toggle:(name,force)=>{const on=force??!this.classes().has(name);this.classList[on?'add':'remove'](name);return on;}};
  }
  classes(){return new Set((this.className||'').split(/\s+/).filter(Boolean));}
  contains(node){return node===this||this.children.some(x=>x instanceof Element&&x.contains(node));}
  get textContent(){return this._text+this.children.map(x=>typeof x==='string'?x:x.textContent).join('');}
  set textContent(value){this._text=String(value??'');this.children=[];}
  append(...nodes){for(const n of nodes){if(n instanceof Element)n.parentElement=this;this.children.push(n);}}
  prepend(...nodes){for(const n of nodes)if(n instanceof Element)n.parentElement=this;this.children.unshift(...nodes);}
  replaceChildren(...nodes){if(this.contains(this.ownerDocument.activeElement)&&this.ownerDocument.activeElement!==this)this.ownerDocument.activeElement=this.ownerDocument.body;this._text='';this.children=[];this.append(...nodes);}
  insertBefore(node,before){const index=this.children.indexOf(before);if(index<0)this.append(node);else{node.parentElement=this;this.children.splice(index,0,node);}}
  setAttribute(key,value){this.attributes[key]=String(value);if(key==='class')this.className=String(value);if(key==='id')this.id=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
  getAttribute(key){return this.attributes[key]??null;}
  removeAttribute(key){delete this.attributes[key];}
  matches(selector){return selector.split(',').some(part=>{part=part.trim();const compound=part.match(/^([a-z][\w-]*)(\[.+\])$/i);if(compound)return this.localName===compound[1].toLowerCase()&&this.matches(compound[2]);if(part.startsWith('#'))return this.id===part.slice(1);if(part.startsWith('.'))return this.classList.contains(part.slice(1));const attr=part.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);if(attr)return this.getAttribute(attr[1])!==null&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]);return this.localName===part.toLowerCase();});}
  querySelectorAll(selector){return this.children.filter(x=>x instanceof Element).flatMap(x=>[...(x.matches(selector)?[x]:[]),...x.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)??null;}
  addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);}
  dispatchEvent(event){event.target??=this;for(const f of this.listeners[event.type]??[])f(event);this['on'+event.type]?.(event);return true;}
  click(){if(!this.disabled){this.focus();this.dispatchEvent({type:'click',target:this,preventDefault(){}});}}
  focus(){this.ownerDocument.activeElement=this;}
  showModal(){this.open=true;this.setAttribute('open','');}
  close(){this.open=false;this.removeAttribute('open');}
  remove(){const list=this.parentElement?.children;if(list){const i=list.indexOf(this);if(i>=0)list.splice(i,1);}}
  scrollIntoView(){}
}
function surface(initialStorage={},options={}){
  const nodes=[],ids=new Map(),storage=new Map(Object.entries(initialStorage)),writes=[],workers=[],timers=[],blobs=[],listeners={};
  const document={activeElement:null,getElementById:id=>ids.get(id)??null,querySelectorAll:selector=>nodes.filter(x=>x.matches(selector)),querySelector:selector=>nodes.find(x=>x.matches(selector))??null,createElement:tag=>new Element(tag,document),createElementNS:(_,tag)=>new Element(tag,document),addEventListener:(type,callback)=>{(listeners[type]??=[]).push(callback);},dispatchEvent:event=>{for(const f of listeners[event.type]??[])f(event);}};
  document.documentElement=new Element('html',document);document.body=new Element('body',document);nodes.push(document.documentElement,document.body);
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  for(const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)){
    const el=new Element(match[1],document);for(const attr of match[2].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))el.setAttribute(attr[1],attr[2]??attr[3]??attr[4]??'');
    el.hidden=el.getAttribute('hidden')!==null;el.open=el.getAttribute('open')!==null;if(el.id)ids.set(el.id,el);nodes.push(el);
  }
  class Worker{constructor(){workers.push(this);}postMessage(message){this.request=message;}terminate(){this.terminated=true;}}
  const window={location:{hash:'#play'},matchMedia:()=>({matches:!!options.reducedMotion,addEventListener(){}}),addEventListener(){}};
  const context={window,location:window.location,document,Starhop:E,StarhopAI:A,StarhopRepetition:require('../js/repetition-rule.js'),Worker,performance,console,URL:{createObjectURL:()=> 'blob:presentation-test',revokeObjectURL(){}},Blob:class{constructor(parts){blobs.push(parts.join(''));}},setTimeout:callback=>{timers.push(callback);return timers.length;},clearTimeout(){},localStorage:{getItem:key=>{if(options.blockStorage)throw Error('storage unavailable');return storage.get(key)??null;},setItem:(key,value)=>{if(options.blockStorage)throw Error('storage unavailable');storage.set(key,String(value));writes.push(key);}},MutationObserver:class{observe(){}disconnect(){}}};
  vm.createContext(context);
  if(options.fetch){context.fetch=options.fetch;context.AbortController=AbortController;window.location.protocol='http:';}
  return {context,document,storage,writes,workers,timers,blobs,get:id=>document.getElementById(id),run:file=>vm.runInContext(fs.readFileSync(require.resolve('../'+file),'utf8'),context,{filename:file}),head:()=>{const script=html.match(/<head>[\s\S]*?<script>([\s\S]*?)<\/script>/i)?.[1];assert.ok(script,'early appearance initializer exists');vm.runInContext(script,context,{filename:'index-head-appearance.js'});}};
}

test('appearance changes preserve an active AI request, saved record, source, and visible last move',()=>{
  const record={...require('./fixtures/user-blockade-28.json'),options:{...require('./fixtures/user-blockade-28.json').options,mode:'human-ai',humanSeat:0,level:4},studySource:{title:'大师棋谱续弈',url:'https://tiaoqi.top/thread-43.htm',branch:true}};
  const ui=surface({'starhop-session':JSON.stringify({record,preferences:{}}),'starhop-archive':JSON.stringify([record])},{reducedMotion:true});
  ui.run('js/app.js');ui.run('js/presentation.js');
  ui.get('pause').click();
  const current=E.replay(record).state,move=E.legalMoves(current.board,current.players[current.turn],current.rules)[0];
  for(const i of [move.from,move.to])ui.get('board').dispatchEvent({type:'click',target:ui.get('board').querySelector('[data-i="'+i+'"]')});
  ui.timers.at(-1)();assert.equal(ui.workers.length,1);
  const worker=ui.workers[0],request=worker.request,session=ui.storage.get('starhop-session'),archive=ui.storage.get('starhop-archive'),lastText=ui.get('last-action-path').textContent,route=ui.get('board').querySelector('.last-route');
  ui.get('analysis-disclosure').open=false;ui.get('search-disclosure').open=true;ui.get('history-disclosure').open=true;
  ui.get('theme-toggle').click();ui.get('focus-mode').click();
  assert.equal(ui.document.body.dataset.theme,'light');assert.equal(ui.document.documentElement.dataset.theme,'light');assert.ok(ui.document.body.classList.contains('focus-mode'));
  assert.equal(ui.get('theme-toggle').getAttribute('aria-pressed'),'true');assert.equal(ui.get('theme-toggle').getAttribute('aria-label'),'切换到深色棋室');assert.equal(ui.get('focus-mode').getAttribute('aria-label'),'退出专注模式');
  assert.equal(ui.storage.get('starhop-session'),session);assert.equal(ui.storage.get('starhop-archive'),archive);assert.equal(ui.workers.length,1);assert.equal(worker.request,request);assert.equal(worker.terminated,undefined);
  assert.equal(ui.get('last-action').hidden,false);assert.equal(ui.get('last-action-path').textContent,lastText);assert.equal(ui.get('board').querySelector('.last-route'),route);assert.equal(route.getAttribute('pointer-events'),'none');assert.equal(ui.get('record-source').hidden,false);
  const result=A.search(request.state,{level:1,time:30});worker.onmessage({data:{id:request.id,result}});
  const saved=JSON.parse(ui.storage.get('starhop-session')).record;assert.equal(saved.moves.length,30);assert.deepEqual(saved.studySource,record.studySource);E.replay(saved);
  assert.equal(ui.document.body.dataset.theme,'light');assert.equal(ui.get('analysis-disclosure').open,false);assert.equal(ui.get('search-disclosure').open,true);assert.equal(ui.get('history-disclosure').open,true);
});

test('theme and focus survive reload independently of chess session storage',()=>{
  const session=JSON.stringify({record:require('./fixtures/user-game.json'),preferences:{pace:80}}),ui=surface({'starhop-session':session});
  ui.head();assert.equal(ui.document.documentElement.dataset.theme,'dark');ui.run('js/presentation.js');
  ui.get('theme-toggle').click();ui.get('focus-mode').click();
  assert.deepEqual(JSON.parse(ui.storage.get('starhop-appearance')),{theme:'light',focus:true});assert.equal(ui.storage.get('starhop-session'),session);assert.ok(ui.writes.every(key=>key==='starhop-appearance'));
  const reload=surface(Object.fromEntries(ui.storage));reload.head();assert.equal(reload.document.documentElement.dataset.theme,'light');reload.run('js/presentation.js');
  assert.equal(reload.document.body.dataset.theme,'light');assert.ok(reload.document.body.classList.contains('focus-mode'));assert.equal(reload.get('focus-mode').getAttribute('aria-pressed'),'true');assert.equal(reload.storage.get('starhop-session'),session);
  reload.get('theme-toggle').click();assert.equal(reload.document.body.dataset.theme,'dark');assert.equal(reload.get('theme-toggle').getAttribute('aria-pressed'),'false');assert.equal(reload.get('theme-toggle').getAttribute('aria-label'),'切换到浅色棋室');
});

test('invalid or unavailable appearance storage does not prevent using the controls',()=>{
  for(const [saved,blocked]of [['{not-json',false],[JSON.stringify({theme:'invalid',focus:'yes'}),false],[JSON.stringify({theme:'light',focus:true}),true]]){
    const ui=surface({'starhop-appearance':saved},{blockStorage:blocked});assert.doesNotThrow(()=>{ui.head();ui.run('js/presentation.js');});
    assert.equal(ui.document.body.dataset.theme,'dark');assert.equal(ui.document.body.classList.contains('focus-mode'),false);
    assert.doesNotThrow(()=>{ui.get('theme-toggle').click();ui.get('focus-mode').click();});assert.equal(ui.document.body.dataset.theme,'light');assert.ok(ui.document.body.classList.contains('focus-mode'));
  }
});

test('Escape closes focus mode while giving an open match dialog priority',()=>{
  const ui=surface({'starhop-appearance':JSON.stringify({theme:'light',focus:true})});ui.run('js/presentation.js');
  ui.get('match-dialog').showModal();ui.document.dispatchEvent({type:'keydown',key:'Escape'});assert.ok(ui.document.body.classList.contains('focus-mode'));assert.equal(ui.get('match-dialog').open,true);
  ui.get('match-dialog').close();ui.document.dispatchEvent({type:'keydown',key:'Escape'});assert.equal(ui.document.body.classList.contains('focus-mode'),false);assert.equal(ui.get('focus-mode').getAttribute('aria-pressed'),'false');assert.deepEqual(JSON.parse(ui.storage.get('starhop-appearance')),{theme:'light',focus:false});
});

test('keyboard selection retains focus after redraw and a legal Space move saves the shared-rule path',()=>{
  const ui=surface();ui.run('js/app.js');const board=ui.get('board'),initial=E.createGame({players:2,jump:'short',goalLock:false}),move=E.legalMoves(initial.board,initial.players[initial.turn],initial.rules)[0];
  const entries=()=>board.querySelectorAll('.hole').filter(cell=>cell.getAttribute('tabindex')==='0');assert.equal(entries().length,1);
  let prevented=false;const original=board.querySelector('[data-i="'+move.from+'"]');original.focus();board.dispatchEvent({type:'keydown',key:'Enter',target:original,preventDefault(){prevented=true;}});
  const selected=board.querySelector('[data-i="'+move.from+'"]');assert.ok(prevented);assert.notEqual(selected,original);assert.equal(ui.document.activeElement,selected);assert.equal(selected.getAttribute('aria-pressed'),'true');assert.equal(entries().length,1);
  const target=board.querySelector('[data-i="'+move.to+'"]');assert.match(target.getAttribute('aria-label'),/可落点/);target.focus();board.dispatchEvent({type:'keydown',key:' ',target,preventDefault(){}});
  const saved=JSON.parse(ui.storage.get('starhop-session')).record,live=E.replay(saved);assert.equal(saved.moves.length,1);assert.equal(live.state.board[move.to],initial.players[initial.turn]);assert.equal(ui.document.activeElement.dataset.i,String(move.to));assert.equal(entries().length,1);assert.equal(ui.get('last-action').hidden,false);assert.equal(ui.get('last-action-path').textContent,'完整路径：'+live.moves[0].path.map(E.coord).join(' → ')+(live.moves[0].path.length>2?' · '+(live.moves[0].path.length-1)+' 连跳':''));
});

test('arrow navigation after a risk-style focus keeps one Tab entry and follows the displayed board direction',()=>{
  const ui=surface();ui.run('js/app.js');const board=ui.get('board'),center=E.at(8,12),entries=()=>board.querySelectorAll('.hole').filter(cell=>cell.getAttribute('tabindex')==='0');
  const external=board.querySelector('[data-i="'+center+'"]');external.focus();board.dispatchEvent({type:'keydown',key:'ArrowRight',target:external,preventDefault(){}});
  assert.equal(Number(ui.document.activeElement.dataset.i),E.at(8,14));assert.equal(entries().length,1);
  ui.get('flip').click();assert.equal(ui.get('flip').getAttribute('aria-pressed'),'true');const flipped=board.querySelector('[data-i="'+center+'"]');flipped.focus();board.dispatchEvent({type:'keydown',key:'ArrowRight',target:flipped,preventDefault(){}});
  assert.equal(Number(ui.document.activeElement.dataset.i),E.at(8,10));assert.equal(entries().length,1);
  ui.run('js/sound.js');
  for(const id of ['coordinates','sound']){ui.get(id).click();assert.equal(ui.get(id).getAttribute('aria-pressed'),'true');ui.get(id).click();assert.equal(ui.get(id).getAttribute('aria-pressed'),'false');}
});

test('AI self-play identifies the second AI turn without asking the spectator to move',()=>{
  const record={...require('./fixtures/user-blockade-28.json'),options:{...require('./fixtures/user-blockade-28.json').options,mode:'ai-ai',humanSeat:0,level:4,secondLevel:1}},ui=surface({'starhop-session':JSON.stringify({record,preferences:{}})},{reducedMotion:true});
  ui.run('js/app.js');ui.get('pause').click();assert.equal(ui.get('profile-status').textContent,'轮到 AI');ui.timers.at(-1)();
  const worker=ui.workers[0],request=worker.request,result=A.search(request.state,{level:1,time:30});worker.onmessage({data:{id:request.id,result}});
  const saved=JSON.parse(ui.storage.get('starhop-session')).record;assert.equal(saved.moves.length,29);assert.equal(saved.options.mode,'ai-ai');E.replay(saved);
  assert.equal(ui.get('profile-status').textContent,'轮到另一位 AI');assert.equal(ui.get('turn-message').textContent,'轮到 '+A.LEVELS[1].name+' AI');assert.equal(ui.get('profile-name').textContent,A.LEVELS[4].name);
});

test('an AI reply redraws the trend while retaining focus at its sole current Tab entry',()=>{
  const record={...require('./fixtures/user-blockade-28.json'),options:{...require('./fixtures/user-blockade-28.json').options,mode:'human-ai',humanSeat:0,level:4}},ui=surface({'starhop-session':JSON.stringify({record,preferences:{}})},{reducedMotion:true});
  ui.context.StarhopAnalysis=require('../js/analysis.js');ui.run('js/analysis-ui.js');ui.context.StarhopAnalysisUI=ui.context.window.StarhopAnalysisUI;ui.run('js/app.js');ui.get('pause').click();
  const state=E.replay(record).state,move=E.legalMoves(state.board,state.players[state.turn],state.rules)[0];for(const i of [move.from,move.to])ui.get('board').dispatchEvent({type:'click',target:ui.get('board').querySelector('[data-i="'+i+'"]')});ui.timers.at(-1)();
  const chart=ui.get('trend-chart'),oldEntry=chart.querySelector('[tabindex="0"]');oldEntry.focus();assert.equal(oldEntry.dataset.ply,'29');
  const worker=ui.workers[0],request=worker.request;worker.onmessage({data:{id:request.id,result:A.search(request.state,{level:1,time:30})}});
  const entries=chart.querySelectorAll('circle').filter(c=>c.getAttribute('tabindex')==='0');assert.equal(entries.length,1);assert.notEqual(entries[0],oldEntry);assert.equal(entries[0].dataset.ply,'30');assert.equal(ui.document.activeElement,entries[0]);
  const saved=JSON.parse(ui.storage.get('starhop-session')).record;assert.equal(saved.moves.length,30);E.replay(saved);
  // Updating another point must leave a person focused outside the chart alone.
  ui.get('prev-move').click();assert.equal(ui.document.activeElement,ui.get('prev-move'));assert.equal(chart.querySelector('[tabindex="0"]').dataset.ply,'29');
});

test('offline icon references resolve locally without colliding with the real board ID',()=>{
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),elements=[...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].map(match=>({tag:match[1].toLowerCase(),attributes:new Map([...match[2].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(attr=>[attr[1],attr[2]??attr[3]??attr[4]??'']))})),ids=new Map();
  for(const el of elements){const id=el.attributes.get('id');if(id===undefined)continue;assert.ok(id,'IDs are nonempty');assert.ok(!ids.has(id),'duplicate ID: '+id);ids.set(id,el);}
  assert.equal(ids.get('board')?.tag,'svg','app lookup must resolve to the real chessboard');
  const uses=elements.filter(el=>el.tag==='use');assert.ok(uses.length>0);
  for(const el of uses){const href=el.attributes.get('href');assert.match(href??'',/^#[^#\s]+$/,'icons must not fetch an external file');assert.equal(ids.get(href.slice(1))?.tag,'symbol','missing inline icon symbol: '+href);}
});

test('theme controls reference the existing inline sun and moon symbols on both initial themes',()=>{
  for(const theme of ['dark','light']){
    const ui=surface({'starhop-appearance':JSON.stringify({theme,focus:false})});ui.head();ui.run('js/presentation.js');
    for(let i=0;i<3;i++){
      const current=ui.document.body.dataset.theme,href=ui.get('theme-icon').getAttribute('href'),expected=current==='dark'?'#ui-sun':'#ui-moon';assert.equal(href,expected);assert.equal(ui.get(href.slice(1))?.localName,'symbol','theme icon resolves inside this HTML document');
      ui.get('theme-toggle').click();
    }
    assert.equal(ui.workers.length,0);
  }
});

test('native fullscreen enters and exits without changing the chess record or focus preference',async()=>{
  const session=JSON.stringify({record:require('./fixtures/user-game.json')}),ui=surface({'starhop-session':session});
  ui.document.fullscreenEnabled=true;
  ui.document.documentElement.requestFullscreen=async()=>{ui.document.fullscreenElement=ui.document.documentElement;ui.document.dispatchEvent({type:'fullscreenchange'});};
  ui.document.exitFullscreen=async()=>{ui.document.fullscreenElement=null;ui.document.dispatchEvent({type:'fullscreenchange'});};
  ui.run('js/presentation.js');await ui.get('fullscreen').onclick();
  assert.ok(ui.document.fullscreenElement);assert.ok(ui.document.body.classList.contains('immersive'));
  assert.equal(ui.get('fullscreen-label').textContent,'退出全屏');
  await ui.get('fullscreen').onclick();assert.equal(ui.document.fullscreenElement,null);assert.equal(ui.document.body.classList.contains('immersive'),false);
  assert.equal(ui.storage.get('starhop-session'),session);assert.equal(ui.storage.has('starhop-appearance'),false);
});

test('blocked native fullscreen fills the tab and Escape restores the page after a dialog closes',async()=>{
  for(const reject of [false,true]){
    const ui=surface();ui.document.fullscreenEnabled=reject;
    ui.document.documentElement.requestFullscreen=async()=>{throw new Error('denied');};
    ui.run('js/presentation.js');await ui.get('fullscreen').onclick();
    assert.ok(ui.document.body.classList.contains('immersive'));assert.match(ui.get('display-notice').textContent,/已铺满当前网页/);
    ui.get('appearance-dialog').showModal();ui.document.dispatchEvent({type:'keydown',key:'Escape'});assert.ok(ui.document.body.classList.contains('immersive'));
    ui.get('appearance-dialog').close();ui.document.dispatchEvent({type:'keydown',key:'Escape'});
    assert.equal(ui.document.body.classList.contains('immersive'),false);assert.equal(ui.get('fullscreen').getAttribute('aria-pressed'),'false');
  }
});

test('native fullscreen Escape notification resets the button and analysis can close with keyboard focus restored',async()=>{
  const ui=surface();ui.run('js/presentation.js');await ui.get('fullscreen').onclick();
  ui.document.fullscreenElement=null;ui.document.dispatchEvent({type:'fullscreenchange'});
  assert.equal(ui.get('fullscreen-label').textContent,'全屏');assert.equal(ui.document.body.classList.contains('immersive'),false);
  ui.get('toggle-analysis').click();assert.equal(ui.get('toggle-analysis').getAttribute('aria-expanded'),'true');
  ui.get('close-analysis').click();assert.equal(ui.get('toggle-analysis').getAttribute('aria-expanded'),'false');assert.equal(ui.document.activeElement,ui.get('toggle-analysis'));
});

test('room palettes and background dim persist independently of the active chess game',()=>{
  const session=JSON.stringify({record:require('./fixtures/user-game.json')}),ui=surface({'starhop-session':session});
  ui.run('js/presentation.js');ui.run('js/room-appearance.js');assert.equal(ui.document.body.dataset.room,'graphite');
  ui.get('palette-midnight').click();assert.equal(ui.document.body.dataset.room,'midnight');
  ui.get('palette-sand').click();assert.equal(ui.document.body.dataset.theme,'light');
  ui.get('background-dim').value='70';ui.get('background-dim').oninput();
  assert.equal(ui.get('background-dim-value').textContent,'70%');assert.equal(ui.document.body.style['--background-dim'],'0.7');
  const reload=surface(Object.fromEntries(ui.storage));reload.run('js/presentation.js');reload.run('js/room-appearance.js');
  assert.equal(reload.document.body.dataset.room,'sand');assert.equal(reload.document.body.dataset.theme,'light');assert.equal(reload.get('background-dim').value,'70');
  assert.equal(reload.storage.get('starhop-session'),session);
  reload.get('palette-graphite').click();assert.equal(reload.document.body.dataset.theme,'dark');
});

test('anime theme switches during a search without canceling it and remembers its artwork controls',()=>{
  const ui=surface();ui.run('js/app.js');ui.run('js/presentation.js');ui.run('js/room-appearance.js');
  ui.get('hint').click();const worker=ui.workers.at(-1),request=worker.request,session=ui.storage.get('starhop-session'),record=ui.get('history-index').textContent;
  for(const palette of ['anime','sand','midnight','graphite','anime']){
    ui.get('palette-'+palette).click();assert.equal(ui.document.body.dataset.room,palette);
    assert.equal(ui.get('palette-'+palette).getAttribute('aria-pressed'),'true');
    assert.equal(ui.get('anime-options').hidden,palette!=='anime');
    assert.equal(ui.workers.at(-1),worker);assert.equal(worker.request,request);assert.equal(worker.terminated,undefined);
    assert.equal(ui.storage.get('starhop-session'),session);assert.equal(ui.get('history-index').textContent,record);
  }
  ui.get('theme-artwork').checked=false;ui.get('theme-artwork').onchange();
  ui.get('theme-motion').checked=true;ui.get('theme-motion').onchange();
  assert.equal(ui.document.body.classList.contains('theme-artwork'),false);
  assert.equal(ui.document.body.classList.contains('theme-motion'),true);
  const reload=surface(Object.fromEntries(ui.storage));reload.run('js/presentation.js');reload.run('js/room-appearance.js');
  assert.equal(reload.document.body.dataset.room,'anime');assert.equal(reload.get('theme-artwork').checked,false);assert.equal(reload.get('theme-motion').checked,true);
  assert.equal(reload.get('background-empty').textContent,'使用棋室默认背景');
});

test('piece colors update board, labels and analysis during a live search without changing game data',()=>{
  const ui=surface();ui.context.StarhopAnalysis=require('../js/analysis.js');ui.run('js/analysis-ui.js');ui.context.StarhopAnalysisUI=ui.context.window.StarhopAnalysisUI;
  ui.run('js/presentation.js');ui.run('js/room-appearance.js');ui.run('js/app.js');
  ui.get('hint').click();const worker=ui.workers.at(-1),saved=ui.storage.get('starhop-session'),request=worker.request;
  ui.get('piece-scheme').value='sakura';ui.get('piece-scheme').onchange();
  assert.match(ui.get('human-strip').textContent,/樱花粉/);assert.match(ui.get('analysis-perspective').textContent,/樱粉方/);
  assert.match(ui.get('board').querySelector('[data-i="'+E.at(16,12)+'"]').getAttribute('aria-label'),/樱花粉棋子/);
  assert.equal(ui.get('assessment-fill').style.background,'#f0a9c7');assert.equal(ui.get('assessment-meter').style.background,'#85c8ee');
  ui.get('own-piece-color').value='amethyst';ui.get('own-piece-color').onchange();assert.match(ui.get('human-strip').textContent,/紫水晶/);
  assert.equal(worker.terminated,undefined);assert.equal(worker.request,request);assert.equal(ui.storage.get('starhop-session'),saved);
  ui.get('palette-sand').click();assert.match(ui.get('human-strip').textContent,/紫水晶/);
  const reload=surface(Object.fromEntries(ui.storage));reload.run('js/presentation.js');reload.run('js/room-appearance.js');reload.run('js/app.js');
  assert.match(reload.get('human-strip').textContent,/紫水晶/);assert.equal(reload.get('piece-scheme').value,'sakura');assert.equal(reload.get('own-piece-color').value,'amethyst');
});

test('visible compact analysis follows replay and reports the real winner instead of a probability',()=>{
  const record=require('./fixtures/user-loss-93.json'),ui=surface({'starhop-session':JSON.stringify({record})});
  ui.context.StarhopAnalysis=require('../js/analysis.js');ui.run('js/analysis-ui.js');ui.context.StarhopAnalysisUI=ui.context.window.StarhopAnalysisUI;ui.run('js/app.js');
  assert.equal(ui.get('compact-verdict').textContent,'已获胜');assert.equal(ui.get('compact-score').textContent,'');
  assert.equal(ui.get('assessment-fill').style.width,'100%');assert.match(ui.get('assessment-meter').getAttribute('aria-label'),/非胜率/);
  assert.equal(ui.get('position-score').textContent,'胜');
  ui.get('first-move').click();assert.equal(ui.get('compact-verdict').textContent,'棋形接近');assert.equal(ui.get('compact-score').textContent,'+0.0');
  assert.equal(ui.get('assessment-fill').style.width,'50%');assert.equal(ui.get('history-index').textContent,'0 / 93');
  assert.equal(ui.get('compact-engine').textContent,'复盘 · 第 0 手');assert.equal(ui.get('engine-status').textContent,'复盘中');
});

test('native hints show network output without inventing depth and paused replies cannot change the board',async()=>{
  let finish,signal;const ui=surface({}, {fetch:async(url,options)=>{
    if(url.endsWith('/status'))return {ok:true,json:async()=>({state:'ready'})};
    signal=options.signal;return new Promise(resolve=>{finish=()=>resolve({ok:true,json:async()=>({result:{move:E.legalMoves(E.createGame().board,3,{jump:'short'})[0],native:true,time:300,depth:null,nodes:null,candidates:[]}})});});
  }});
  ui.run('js/app.js');await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.get('profile-level').textContent,/本机神经网络/);
  ui.get('hint').click();assert.equal(ui.workers.length,0);finish();await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.get('compact-engine').textContent,/神经网络/);assert.equal(ui.get('search-depth').textContent,'—');assert.equal(ui.get('search-nodes').textContent,'—');
  const before=ui.get('history-index').textContent;ui.get('hint').click();ui.get('pause').click();assert.equal(signal.aborted,true);finish();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.get('history-index').textContent,before);assert.equal(ui.workers.length,0);assert.match(ui.get('turn-message').textContent,/已暂停/);
});

test('upgraded native profile sends the advertised budget and allows enough time for its reply',async()=>{
  let sent;const ui=surface({}, {fetch:async(url,options)=>{
    if(url.endsWith('/status'))return {ok:true,json:async()=>({state:'ready',budgetMs:2500})};
    sent=JSON.parse(options.body);return {ok:true,json:async()=>({result:{move:E.legalMoves(sent.state.board,3,sent.state.rules)[0],native:true,time:2400,nodes:12000,depth:null,candidates:[]}})};
  }});
  const delays=[];ui.context.setTimeout=(f,delay)=>{delays.push(delay);ui.timers.push(f);return ui.timers.length;};
  ui.run('js/app.js');await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.get('profile-level').textContent,/2\.5 秒/);
  ui.get('hint').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sent.options.time,2500);assert.equal(ui.workers.length,0);assert.ok(delays.includes(3500));
  assert.equal(ui.get('search-nodes').textContent,'—'); // Root visits alone are not a full-search node count.
});

test('an unavailable local search falls back to the browser worker',async()=>{
  const ui=surface({}, {fetch:async url=>url.endsWith('/status')?{ok:true,json:async()=>({state:'ready'})}:{ok:false}});
  ui.run('js/app.js');await new Promise(resolve=>setImmediate(resolve));ui.get('hint').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.workers.length,1);assert.equal(ui.workers[0].request.options.level,4);
});

test('a longer manual budget keeps the native model and scales its reply watchdog',async()=>{
  let sent;const session={record:{format:'starhop-v1',options:{players:2,jump:'short',goalLock:false,mode:'human-ai',humanSeat:0,level:4},moves:[]},preferences:{time:8000}};
  const ui=surface({'starhop-session':JSON.stringify(session)}, {fetch:async(url,options)=>{
    if(url.endsWith('/status'))return {ok:true,json:async()=>({state:'ready',budgetMs:2500})};
    sent=JSON.parse(options.body);return {ok:true,json:async()=>({result:{move:E.legalMoves(sent.state.board,3,sent.state.rules)[0],native:true,time:7900,candidates:[]}})};
  }});
  const delays=[];ui.context.setTimeout=(f,delay)=>{delays.push(delay);ui.timers.push(f);return ui.timers.length;};
  ui.run('js/app.js');await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.get('profile-level').textContent,/本机神经网络 · 8 秒/);
  ui.get('hint').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sent.options.time,8000);assert.equal(ui.workers.length,0);assert.ok(delays.includes(9000));
});

test('first-run GPU tuning can finish after more than two minutes of polling',async()=>{
  let calls=0;const ui=surface({}, {fetch:async()=>({ok:true,json:async()=>({state:++calls>=76?'ready':'loading'})})});
  ui.run('js/app.js');await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.get('compact-engine').textContent,/模型加载中/);
  for(let i=0;i<75;i++){const callback=ui.timers.at(-1);const before=ui.timers.length;callback();await new Promise(resolve=>setImmediate(resolve));if(i<74)assert.ok(ui.timers.length>before);}
  assert.match(ui.get('profile-level').textContent,/本机神经网络/);
  assert.match(ui.get('compact-engine').textContent,/本机神经网络已就绪/);
});


test('manual ending and legacy records preserve assessment and never export draw training labels',()=>{
  const original=require('./fixtures/user-endgame-106.json');
  for(const result of [{winner:null,draw:'手动结束'},{winner:null,draw:null,stopped:'手动结束'}]){
    const record={...original,result},ui=surface({'starhop-session':JSON.stringify({record,preferences:{}})});
    ui.context.StarhopAnalysis=require('../js/analysis.js');ui.run('js/analysis-ui.js');ui.context.StarhopAnalysisUI=ui.context.window.StarhopAnalysisUI;ui.run('js/app.js');
    assert.match(ui.get('turn-message').textContent,/手动结束 · 未判胜负/);
    assert.equal(ui.get('compact-verdict').textContent,'预计收官落后');
    assert.equal(ui.get('pause').disabled,true);assert.equal(ui.get('hint').disabled,true);assert.equal(ui.get('resign').disabled,true);
    ui.get('export-training').click();const rows=ui.blobs.at(-1).split('\n').map(x=>JSON.parse(x));
    assert.equal(rows.length,106);assert.ok(rows.every(x=>x.outcome===null));
    ui.get('export-game').click();const saved=JSON.parse(ui.blobs.at(-1));
    assert.equal(saved.result.draw,null);assert.equal(saved.result.stopped,'手动结束');
    assert.equal(saved.moves.length,106);
  }
  const ui=surface({'starhop-session':JSON.stringify({record:{...original,result:null},preferences:{}})});ui.run('js/app.js');
  ui.get('resign').click();const stored=JSON.parse(ui.storage.get('starhop-session')).record;
  assert.equal(stored.result.draw,null);assert.equal(stored.result.stopped,'手动结束');assert.equal(stored.moves.length,106);
});

test('room insights follow the displayed game and clear endgame estimates when reviewing the opening',()=>{
  const record=require('./fixtures/user-endgame-106.json'),ui=surface({'starhop-session':JSON.stringify({record,preferences:{}})});
  ui.context.StarhopAnalysis=require('../js/analysis.js');ui.run('js/analysis-ui.js');ui.context.StarhopAnalysisUI=ui.context.window.StarhopAnalysisUI;ui.run('js/app.js');
  const before=ui.storage.get('starhop-session');
  assert.equal(ui.get('race-caption').textContent,'收官竞速');assert.equal(ui.get('game-phase').textContent,'收官');
  const sides=ui.get('race-sides').children;
  assert.match(sides[0].textContent,/本方 · 蓝方4步收官还有 2 子在营外/);
  assert.match(sides[1].textContent,/对手 · 金方1步收官还有 1 子在营外/);
  assert.match(ui.get('race-note').textContent,/固定对方/);
  assert.equal(ui.get('opponent-strip').querySelectorAll('.arrived').length,9);
  assert.equal(ui.get('human-strip').querySelectorAll('.arrived').length,8);
  ui.get('first-move').click();
  assert.equal(ui.get('race-caption').textContent,'十子入营');assert.equal(ui.get('game-phase').textContent,'开局');
  assert.ok(ui.get('race-sides').children.every(side=>side.textContent.includes('0/ 10 入营')));
  assert.equal(ui.get('opponent-strip').querySelectorAll('.arrived').length,0);
  assert.equal(ui.storage.get('starhop-session'),before);
  ui.get('last-move').click();assert.equal(ui.get('race-sides').children[0].textContent,sides[0].textContent);
});

test('ended and review positions keep the correct next action on the board without replacing the record',()=>{
  const record=require('./fixtures/user-endgame-106.json'),ui=surface({'starhop-session':JSON.stringify({record})});ui.run('js/app.js');
  const saved=ui.storage.get('starhop-session');
  assert.equal(ui.get('new-game-inline').hidden,false);assert.equal(ui.get('return-live-board').hidden,true);
  ui.get('new-game-inline').click();assert.equal(ui.get('match-dialog').open,true);assert.equal(ui.storage.get('starhop-session'),saved);
  ui.get('close-dialog').click();ui.get('first-move').click();
  assert.equal(ui.get('new-game-inline').hidden,true);assert.equal(ui.get('return-live-board').hidden,false);
  ui.get('return-live-board').click();assert.equal(ui.get('history-index').textContent,'106 / 106');assert.equal(ui.get('new-game-inline').hidden,false);
  assert.equal(ui.storage.get('starhop-session'),saved);
});

test('four appearance sections and independent board/effect settings preserve a searching game across reload',()=>{
  const ui=surface();ui.run('js/presentation.js');ui.run('js/room-appearance.js');ui.run('js/app.js');ui.get('hint').click();
  const worker=ui.workers.at(-1),saved=ui.storage.get('starhop-session'),request=worker.request;
  ui.get('appearance-tab-board').click();assert.equal(ui.get('appearance-panel-background').hidden,true);assert.equal(ui.get('appearance-panel-board').hidden,false);
  ui.get('board-style').value='wood';ui.get('board-style').onchange();
  ui.get('appearance-tab-board').onkeydown({key:'End',preventDefault(){}});assert.equal(ui.get('appearance-panel-effects').hidden,false);assert.equal(ui.get('appearance-tab-effects').getAttribute('aria-selected'),'true');
  ui.get('move-effect').value='none';ui.get('move-effect').onchange();ui.get('show-move-path').checked=false;ui.get('show-move-path').onchange();ui.get('auto-replay').checked=false;ui.get('auto-replay').onchange();
  ui.get('palette-anime').click();assert.equal(ui.document.body.dataset.board,'wood');assert.equal(ui.document.body.dataset.moveEffect,'none');assert.equal(ui.document.body.classList.contains('hide-move-path'),true);
  assert.equal(ui.storage.get('starhop-session'),saved);assert.equal(worker.request,request);assert.equal(worker.terminated,undefined);
  const reload=surface(Object.fromEntries(ui.storage));reload.run('js/presentation.js');reload.run('js/room-appearance.js');reload.run('js/app.js');
  assert.equal(reload.get('board-style').value,'wood');assert.equal(reload.get('move-effect').value,'none');assert.equal(reload.get('show-move-path').checked,false);assert.equal(reload.get('auto-replay').checked,false);
});

test('sound settings remain independent of a live search, and restored games do not play a result cue',()=>{
  const ui=surface();ui.run('js/sound.js');ui.run('js/app.js');ui.get('hint').click();
  const worker=ui.workers.at(-1),request=worker.request,saved=ui.storage.get('starhop-session');
  ui.get('sound').click();ui.get('sound-volume').value='25';ui.get('sound-volume').oninput();ui.get('sound-style').value='glass';ui.get('sound-style').onchange();ui.get('sound-details').checked=false;ui.get('sound-details').onchange();
  assert.deepEqual(JSON.parse(ui.storage.get('starhop-sound')),{enabled:true,volume:25,style:'glass',details:false});assert.equal(ui.get('sound').getAttribute('aria-pressed'),'true');assert.equal(worker.request,request);assert.equal(worker.terminated,undefined);assert.equal(ui.storage.get('starhop-session'),saved);
  const reload=surface(Object.fromEntries(ui.storage));reload.run('js/sound.js');reload.run('js/app.js');assert.equal(reload.get('sound-volume').value,'25');assert.equal(reload.get('sound-style').value,'glass');assert.equal(reload.get('sound-details').checked,false);
  reload.get('sound').click();assert.equal(JSON.parse(reload.storage.get('starhop-sound')).enabled,false);
});

test('real moves emit selection, landing and undo cues while replay and game restoration stay quiet',()=>{
  const ui=surface(),events=[];ui.context.window.StarhopSound={play:(kind,options)=>events.push({kind,options}),stop(){}};ui.run('js/app.js');assert.equal(events.length,0);
  const initial=E.createGame(),move=E.legalMoves(initial.board,initial.players[initial.turn],initial.rules).find(m=>m.path.length>1);
  for(const i of [move.from,move.to])ui.get('board').dispatchEvent({type:'click',target:ui.get('board').querySelector('[data-i="'+i+'"]')});
  assert.deepEqual(events.map(e=>e.kind),['select','move']);assert.equal(events[1].options.hops,move.path.length-1);assert.equal(events[1].options.duration,0);assert.equal(events[1].options.finish,null);
  ui.get('first-move').click();assert.equal(events.length,2);ui.get('last-move').click();ui.get('undo').click();assert.equal(events.at(-1).kind,'undo');assert.equal(JSON.parse(ui.storage.get('starhop-session')).record.moves.length,0);
});

test('a genuine final move emits victory once, never when that saved result is reloaded or reviewed',()=>{
  const complete=require('./fixtures/user-loss-93.json'),before={...complete,moves:complete.moves.slice(0,-1),result:{winner:null,draw:null}},events=[];
  const ui=surface({'starhop-session':JSON.stringify({record:before})},{reducedMotion:true});ui.context.window.StarhopSound={play:(kind,options)=>events.push({kind,options}),stop(){}};ui.run('js/app.js');
  const move=complete.moves.at(-1);for(const i of [move.from,move.to])ui.get('board').dispatchEvent({type:'click',target:ui.get('board').querySelector('[data-i="'+i+'"]')});
  assert.equal(events.filter(e=>e.options?.finish==='win').length,1);assert.equal(JSON.parse(ui.storage.get('starhop-session')).record.result.winner,3);
  ui.get('first-move').click();ui.get('last-move').click();assert.equal(events.filter(e=>e.options?.finish==='win').length,1);
  const reload=surface(Object.fromEntries(ui.storage));reload.context.window.StarhopSound={play:()=>assert.fail('restoring a result must be silent'),stop(){}};reload.run('js/app.js');
});
