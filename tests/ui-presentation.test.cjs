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
  const nodes=[],ids=new Map(),storage=new Map(Object.entries(initialStorage)),writes=[],workers=[],timers=[],listeners={};
  const document={activeElement:null,getElementById:id=>ids.get(id)??null,querySelectorAll:selector=>nodes.filter(x=>x.matches(selector)),querySelector:selector=>nodes.find(x=>x.matches(selector))??null,createElement:tag=>new Element(tag,document),createElementNS:(_,tag)=>new Element(tag,document),addEventListener:(type,callback)=>{(listeners[type]??=[]).push(callback);},dispatchEvent:event=>{for(const f of listeners[event.type]??[])f(event);}};
  document.documentElement=new Element('html',document);document.body=new Element('body',document);nodes.push(document.documentElement,document.body);
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  for(const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)){
    const el=new Element(match[1],document);for(const attr of match[2].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))el.setAttribute(attr[1],attr[2]??attr[3]??attr[4]??'');
    el.hidden=el.getAttribute('hidden')!==null;el.open=el.getAttribute('open')!==null;if(el.id)ids.set(el.id,el);nodes.push(el);
  }
  class Worker{constructor(){workers.push(this);}postMessage(message){this.request=message;}terminate(){this.terminated=true;}}
  const window={location:{hash:'#play'},matchMedia:()=>({matches:!!options.reducedMotion,addEventListener(){}}),addEventListener(){}};
  const context={window,location:window.location,document,Starhop:E,StarhopAI:A,Worker,performance,console,URL:{createObjectURL:()=> 'blob:presentation-test',revokeObjectURL(){}},Blob:class{},setTimeout:callback=>{timers.push(callback);return timers.length;},clearTimeout(){},localStorage:{getItem:key=>{if(options.blockStorage)throw Error('storage unavailable');return storage.get(key)??null;},setItem:(key,value)=>{if(options.blockStorage)throw Error('storage unavailable');storage.set(key,String(value));writes.push(key);}},MutationObserver:class{observe(){}disconnect(){}}};
  vm.createContext(context);
  return {context,document,storage,writes,workers,timers,get:id=>document.getElementById(id),run:file=>vm.runInContext(fs.readFileSync(require.resolve('../'+file),'utf8'),context,{filename:file}),head:()=>{const script=html.match(/<head>[\s\S]*?<script>([\s\S]*?)<\/script>/i)?.[1];assert.ok(script,'early appearance initializer exists');vm.runInContext(script,context,{filename:'index-head-appearance.js'});}};
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
