'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
const E=require('../js/engine.js'),{createNativeApi}=require('../scripts/native-ai-server.cjs');
function request(body,headers={},url='/api/ai/search',method='POST'){
  const req=Readable.from([Buffer.from(JSON.stringify(body))]);Object.assign(req,{url,method,headers:{host:'127.0.0.1:5173','content-type':'application/json',...headers}});
  const res={destroyed:false,writeHead(code){this.status=code;},end(value){this.body=JSON.parse(value);}};return {req,res};
}
const input=()=>({state:E.createGame(),options:{level:4,time:350,algorithm:'auto',repetitions:[]}});
test('local API validates rules, origin, piece counts and the actual engine move',async()=>{
  let calls=0;const api=createNativeApi({enabled:true,engine:{ready:async()=>{},search:async s=>{calls++;return {move:E.legalMoves(s.board,s.players[s.turn],s.rules)[0],native:true};}}});await api.ready;
  const valid=request(input());await api.handle(valid.req,valid.res);assert.equal(valid.res.status,200);E.applyMove(input().state,valid.res.body.result.move);assert.equal(calls,1);
  for(const [body,headers,status]of [[input(),{origin:'http://example.com'},403],[input(),{'content-type':'text/plain'},415],[{...input(),state:E.createGame({jump:'long'})},{},400],[{...input(),state:{...E.createGame(),board:Array(121).fill(-1)}},{},400]]){
    const r=request(body,headers);await api.handle(r.req,r.res);assert.equal(r.res.status,status);
  }
  assert.equal(calls,1);
});
test('local API prevents overlapping searches and reports missing installation without starting an engine',async()=>{
  let finish;const api=createNativeApi({enabled:true,engine:{ready:async()=>{},search:s=>new Promise(resolve=>{finish=()=>resolve({move:E.legalMoves(s.board,s.players[s.turn],s.rules)[0]});})}});await api.ready;
  const first=request(input()),pending=api.handle(first.req,first.res);await new Promise(resolve=>setImmediate(resolve));
  const second=request(input());await api.handle(second.req,second.res);assert.equal(second.res.status,409);finish();await pending;assert.equal(first.res.status,200);
  const absent=createNativeApi(),status=request(null,{},'/api/ai/status','GET');await absent.handle(status.req,status.res);assert.equal(status.res.body.state,'unavailable');
  const unavailable=request(input());await absent.handle(unavailable.req,unavailable.res);assert.equal(unavailable.res.status,503);
});
test('driver initialization failure keeps the service available for browser fallback',async()=>{
  const original=console.error;console.error=()=>{};
  try {
    const api=createNativeApi({enabled:true,engine:{ready:async()=>{throw Error('OpenCL unavailable');}}});await api.ready;
    const status=request(null,{},'/api/ai/status','GET');await api.handle(status.req,status.res);assert.equal(status.res.body.state,'unavailable');
    const search=request(input());await api.handle(search.req,search.res);assert.equal(search.res.status,503);
  } finally {console.error=original;}
});
