'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalize,sequence,createEngine}=require('../js/sound.js');
function audioSurface(options={}){
  const contexts=[],sources=[];let hidden=false;
  const param=()=>({value:0,events:[],setValueAtTime(value,time){this.events.push({value,time});},linearRampToValueAtTime(value,time){this.events.push({value,time});},exponentialRampToValueAtTime(value,time){this.events.push({value,time});},setTargetAtTime(value,time){this.events.push({value,time});}});
  class Context{
    constructor(){this.state=options.suspended?'suspended':'running';this.currentTime=1;this.destination={};this.gains=[];contexts.push(this);}
    createGain(){const g={gain:param(),connect(){},disconnect(){this.disconnected=true;}};this.gains.push(g);return g;}
    createOscillator(){const osc={frequency:param(),connect(){},disconnect(){this.disconnected=true;},start(at){this.started=at;},stop(at){this.stops??=[];this.stops.push(at);}};sources.push(osc);return osc;}
    async resume(){if(options.rejectResume)throw Error('blocked');this.state='running';}
  }
  return {contexts,sources,setHidden:value=>{hidden=value;},env:{AudioContext:Context,hidden:()=>hidden}};
}
test('audio is quiet by default and malformed settings cannot produce excessive volume',()=>{
  assert.deepEqual(normalize(null),{enabled:false,volume:35,style:'wood',details:true});
  assert.equal(normalize({volume:Infinity}).volume,35);assert.equal(normalize({volume:999}).volume,100);assert.equal(normalize({volume:-9}).volume,0);
  const s=audioSurface(),e=createEngine(s.env);assert.equal(e.play('win'),false);assert.equal(s.contexts.length,0);
});
test('one reusable audio context handles cues; muted, background and zero-volume play schedule nothing',async()=>{
  const s=audioSurface(),e=createEngine(s.env,{enabled:true});assert.equal(s.contexts.length,0);
  assert.equal(e.play('move'),false);assert.equal(await e.unlock(),true);assert.equal(await e.unlock(),true);assert.equal(s.contexts.length,1);
  assert.equal(e.play('move'),true);const voices=s.sources.slice();assert.ok(voices.length>0);const count=s.sources.length;
  e.configure({enabled:false});assert.ok(voices.every(v=>v.stops.includes(undefined)));assert.equal(e.play('win'),false);assert.equal(s.sources.length,count);
  e.configure({enabled:true,volume:0});assert.equal(e.play('win'),false);
  e.configure({volume:35});s.setHidden(true);assert.equal(e.play('move'),false);assert.equal(s.sources.length,count);
  s.setHidden(false);assert.equal(e.play('undo'),true);assert.equal(s.contexts.length,1);
});
test('long jumps have bounded sound and their final cue aligns with the animation ending',()=>{
  const cue=sequence('move',{hops:90,duration:1.5});assert.equal(cue.length,5);assert.equal(cue.at(-1).at,1.5);
  const finished=sequence('move',{hops:90,duration:1.5,finish:'win'});assert.equal(finished.length,8);assert.ok(finished.at(-1).at+finished.at(-1).length<3);
  assert.equal(sequence('move',{hops:1}).length,1);assert.notDeepEqual(sequence('win'),sequence('loss'));assert.deepEqual(sequence('unknown'),[]);
});
test('selection chatter can be disabled or throttled, and stopped voices disconnect when ended',async()=>{
  const s=audioSurface(),e=createEngine(s.env,{enabled:true});await e.unlock();
  assert.equal(e.play('select'),true);assert.equal(e.play('select'),false);e.configure({details:false});s.contexts[0].currentTime+=1;assert.equal(e.play('select'),false);assert.equal(e.play('hint'),false);assert.equal(e.play('move'),true);
  for(const source of s.sources){source.onended();assert.equal(source.disconnected,true);}
});
test('unsupported or browser-blocked audio never queues stale sounds for later',async()=>{
  const unsupported=createEngine({});assert.equal(unsupported.available,false);assert.equal(await unsupported.unlock(),false);
  const s=audioSurface({suspended:true,rejectResume:true}),e=createEngine(s.env,{enabled:true});assert.equal(await e.unlock(),false);assert.equal(e.play('win'),false);assert.equal(s.sources.length,0);
  s.contexts[0].state='running';assert.equal(s.sources.length,0);assert.equal(e.play('move'),true);
});
