importScripts('engine.js','ai.js','fast-search.js','team-planner.js');
self.onmessage=({data})=>{try{if(data.type==='compare'){for(const level of [1,2,3]){const result=StarhopAI.search(data.state,{...data.options,level});self.postMessage({id:data.id,result:{...result,level}});}self.postMessage({id:data.id,done:true});}else{
  const options={...data.options,onIteration:progress=>self.postMessage({id:data.id,progress:{...progress,planning:progress.algorithm==='Team planner'}})};
  self.postMessage({id:data.id,result:StarhopAI.search(data.state,options)});
}}catch(error){self.postMessage({id:data.id,error:error.message});}};
