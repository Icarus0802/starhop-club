importScripts('engine.js','ai.js','fast-search.js','team-planner.js','race-finish.js','friendly-finish.js','finish-policy.js','repetition-rule.js');
const finishing=StarhopFinishPolicy.create();
function rawSearch(state,options){
  const start=performance.now(),budget=Number(options.time)||StarhopAI.LEVELS[options.level??1].time;
  if((options.level??1)>=3&&(!options.algorithm||options.algorithm==='auto')){
    const route=finishing.search(state,{...options,time:budget});if(route)return route;
  }
  const result=StarhopAI.search(state,{...options,time:Math.max(10,budget-(performance.now()-start))});
  return {...result,time:performance.now()-start};
}
function search(state,options){const prepared=StarhopRepetition.prepareOptions(state,options);return StarhopRepetition.guardResult(state,prepared,rawSearch(state,prepared));}
self.onmessage=({data})=>{try{if(data.type==='compare'){for(const level of [1,2,3]){const result=search(data.state,{...data.options,level});self.postMessage({id:data.id,result:{...result,level}});}self.postMessage({id:data.id,done:true});}else{
  const options={...data.options,onIteration:progress=>self.postMessage({id:data.id,progress:{...progress,planning:progress.algorithm==='Team planner'}})};
  self.postMessage({id:data.id,result:search(data.state,options)});
}}catch(error){self.postMessage({id:data.id,error:error.message});}};
