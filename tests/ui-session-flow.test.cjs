'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../js/engine.js'),A=require('../js/ai.js'),D=require('../js/analysis.js');
class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.attributes={};this.dataset={};this.style={};this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.classList={add(){},remove(){},toggle(){}};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;this.textContent='';}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(name,handler){(this.listeners??={})[name]=handler;}
  querySelector(){return null;}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
function surface(){
  const elements=new Map(),workers=[],storage=new Map(),timers=[];
  const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  class Worker{
    constructor(){workers.push(this);this.terminated=false;}
    postMessage(message){this.request=message;}
    terminate(){this.terminated=true;}
  }
  const window={location:{hash:'#archive'},matchMedia:()=>({matches:true}),addEventListener(){}};
  const context={window,location:window.location,document:{getElementById:get,querySelectorAll:()=>[],createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},Starhop:E,StarhopAI:A,StarhopAnalysis:D,Worker,performance,URL:{createObjectURL:()=> 'blob:ui-test',revokeObjectURL(){}},Blob:class{},setTimeout:callback=>{timers.push(callback);return timers.length;},clearTimeout(){},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}};
  vm.createContext(context);return {context,get,workers,storage,timers};
}
function allButtons(node){return [node,...node.children.filter(x=>x instanceof Element).flatMap(allButtons)].filter(x=>x.tag==='button');}
test('opening archives and branching a master game preserve the previous session and reset new-game attribution',()=>{
  const ui=surface(),original={...require('./fixtures/user-blockade-28.json'),id:'in-progress-28',options:{...require('./fixtures/user-blockade-28.json').options,mode:'human',level:4}},target={...require('./fixtures/user-game.json'),id:'archive-24',savedAt:'2026-10-10T00:00:00Z'};
  ui.storage.set('starhop-session',JSON.stringify({record:original,preferences:{}}));ui.storage.set('starhop-archive',JSON.stringify([target]));
  vm.runInContext(fs.readFileSync(require.resolve('../js/master-games.js'),'utf8'),ui.context);ui.context.window.STARHOP_MASTER_GAMES=ui.context.STARHOP_MASTER_GAMES;
  vm.runInContext(fs.readFileSync(require.resolve('../js/app.js'),'utf8'),ui.context);
  allButtons(ui.get('archive-list')).find(b=>b.textContent==='打开复盘 →').onclick();
  const archived=JSON.parse(ui.storage.get('starhop-archive')),saved=archived.find(r=>r.id==='in-progress-28'),session=JSON.parse(ui.storage.get('starhop-session'));
  assert.deepEqual(saved.moves,original.moves.map(m=>({from:m.from,to:m.to})));assert.deepEqual(E.replay(saved).state.board,E.replay(original).state.board);assert.equal(session.record.moves.length,24);
  allButtons(ui.get('master-library')).find(b=>b.textContent==='从第 40 手挑战 AI').onclick();
  const branch=JSON.parse(ui.storage.get('starhop-session')).record;assert.equal(branch.moves.length,40);assert.equal(branch.studySource.branch,true);assert.equal(branch.studySource.url,'https://tiaoqi.top/thread-43.htm');E.replay(branch);
  for(const [id,value]of Object.entries({'player-count':'2',mode:'human','human-seat':'0',difficulty:'4','difficulty-second':'4','jump-rule':'short'}))ui.get(id).value=value;
  ui.get('match-form').onsubmit({preventDefault(){}});
  const fresh=JSON.parse(ui.storage.get('starhop-session')).record;assert.equal(fresh.moves.length,0);assert.equal(fresh.studySource,undefined);
  const retained=JSON.parse(ui.storage.get('starhop-archive'));assert.ok(retained.some(r=>r.moves.length===40&&r.studySource?.branch));assert.ok(retained.some(r=>r.id==='in-progress-28'&&r.moves.length===28));
});
test('an obsolete comparison-worker error cannot cancel a newer comparison or re-enable an ended board',()=>{
  const ui=surface();vm.runInContext(fs.readFileSync(require.resolve('../js/analysis-ui.js'),'utf8'),ui.context);
  const s=E.createGame(),next=E.applyMove(s,E.legalMoves(s.board,3,s.rules)[0]).state;
  ui.context.window.StarhopAnalysisUI.update([s],0,3,()=>{});ui.get('compare-levels').onclick();const old=ui.workers[0];
  ui.context.window.StarhopAnalysisUI.update([s,next],1,3,()=>{});ui.get('compare-levels').onclick();const current=ui.workers[1],before=ui.get('level-comparison').textContent;
  old.onerror();assert.equal(current.terminated,false);assert.equal(ui.get('compare-levels').disabled,true);assert.equal(ui.get('level-comparison').textContent,before);
  // Reloading another record can have the same current board and move count,
  // while its historical repetitions and trend belong to a different game.
  ui.context.window.StarhopAnalysisUI.update([s,{...next,board:next.board.slice()}],1,3,()=>{});assert.equal(current.terminated,true);assert.equal(ui.get('level-comparison').children.length,0);
  ui.context.window.StarhopAnalysisUI.update([s,{...next,draw:'手动结束'}],1,3,()=>{});ui.context.window.StarhopAnalysisUI.cancel();assert.equal(ui.get('compare-levels').disabled,true);
});
test('paused AI replies cannot alter the saved game and completed workers are reused for the next turn',()=>{
  const ui=surface(),record={...require('./fixtures/user-blockade-28.json'),options:{...require('./fixtures/user-blockade-28.json').options,mode:'human-ai',humanSeat:0,level:4}};
  ui.storage.set('starhop-session',JSON.stringify({record,preferences:{}}));vm.runInContext(fs.readFileSync(require.resolve('../js/app.js'),'utf8'),ui.context);
  const saved=()=>JSON.parse(ui.storage.get('starhop-session')).record;
  const humanMove=()=>{const s=E.replay(saved()).state,m=E.legalMoves(s.board,s.players[s.turn],s.rules)[0];for(const i of [m.from,m.to])ui.get('board').listeners.click({target:{closest:()=>({dataset:{i:String(i)}})}});};
  ui.get('pause').onclick();humanMove();ui.timers.at(-1)();const obsolete=ui.workers[0],obsoleteId=obsolete.request.id;
  ui.get('pause').onclick();assert.equal(obsolete.terminated,true);obsolete.onmessage({data:{id:obsoleteId,result:{move:E.legalMoves(obsolete.request.state.board,0,obsolete.request.state.rules)[0]}}});assert.equal(saved().moves.length,29);
  ui.get('pause').onclick();ui.timers.at(-1)();const active=ui.workers[1],firstId=active.request.id;
  const result=A.search(active.request.state,{level:1,time:30});active.onmessage({data:{id:firstId,result}});assert.equal(saved().moves.length,30);
  humanMove();ui.timers.at(-1)();assert.equal(ui.workers.length,2);assert.ok(active.request.id!==firstId);
  active.onmessage({data:{id:firstId,result}});assert.equal(saved().moves.length,31);
  const next=A.search(active.request.state,{level:1,time:30});active.onmessage({data:{id:active.request.id,result:next}});assert.equal(saved().moves.length,32);E.replay(saved());
});
