'use strict';
// MIT. Offline features are tapped from an immutable search snapshot in memory;
// the eventual candidate uses those same matching/transport functions directly.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const sourceFile=path.join(__dirname,'candidate-history-order-h.cjs');
const baseNames=['assignment','lagSquared','homeRemaining','arrived','ownBridges','jumpTransport'];
const scales=[100,500,10,10,16,30];
const spec=Object.freeze({version:'h-transport-phase-v1',names:[...baseNames.map(x=>'early.'+x),...baseNames.map(x=>'late.'+x)],scales:[...scales,...scales],phase:'clamp((max(arrivedOwn,arrivedOpponent)-4)/6,0,1)',bias:0});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function phaseOf(sides){return Math.max(0,Math.min(1,(Math.max(sides[0].arrived,sides[1].arrived)-4)/6));}
function rawDifference(sides,actor){
  const a=sides[actor],b=sides[actor^1];
  return [b.assignment-a.assignment,b.lagSquared-a.lagSquared,b.homeRemaining-a.homeRemaining,a.arrived-b.arrived,a.ownBridges-b.ownBridges,b.jumpTransport-a.jumpTransport];
}
function vectorFromRaw(sides,actor){const raw=rawDifference(sides,actor),phase=phaseOf(sides);return raw.map((x,i)=>x/scales[i]*(1-phase)).concat(raw.map((x,i)=>x/scales[i]*phase));}
function createExtractor(filename=sourceFile){
  const source=fs.readFileSync(filename,'utf8'),anchor='    function repetitions(a,b,ply){';
  if(source.split(anchor).length!==2)throw new Error('Immutable H feature extraction anchor changed');
  const injected=`    if(options.extractValueFeatures){
      const sides=[0,1].map(actor=>{
        const p=players[actor];let lagSquared=0,homeRemaining=0,ownBridges=0;
        for(let slot=0;slot<10;slot++){
          const from=pieces[actor][slot],d=near[p][from];lagSquared+=d*d;if(E.zoneOf[from]===p)homeRemaining++;
          for(let dir=0;dir<6;dir++){const to=neighbours[from*6+dir];if(to>=0&&board[to]===p)ownBridges++;}
        }
        return {assignment:matching(actor),lagSquared,homeRemaining,arrived:goals[actor],ownBridges:Math.min(ownBridges,16),jumpTransport:transport(actor)};
      });
      return {sides};
    }
`;
  const instance=new Module(filename,module);instance.filename=filename;instance.paths=Module._nodeModulePaths(path.dirname(filename));instance._compile(source.replace(anchor,injected+anchor),filename);
  return {sourceFile:filename,sourceSha256:sha(source),extract(state,actor=state.turn){
    if(state.winner!==null||state.draw)throw new Error('Training extracts nonterminal positions only');
    const {sides}=instance.exports.search(state,{level:4,time:1000,extractValueFeatures:true,selective:false});
    return {sides,phase:phaseOf(sides),features:vectorFromRaw(sides,actor)};
  }};
}
function predict(theta,features){let logit=0;for(let i=0;i<theta.length;i++)logit+=theta[i]*features[i];return logit;}
function validateModel(model){
  if(model.format!=='starhop-linear-value-v1'||model.featureVersion!==spec.version||!Array.isArray(model.theta)||model.theta.length!==12||model.theta.some(x=>!Number.isFinite(x)))throw new Error('Unsupported learned value model');
  if(JSON.stringify(model.featureNames)!==JSON.stringify(spec.names)||JSON.stringify(model.featureScales)!==JSON.stringify(spec.scales)||model.bias!==0)throw new Error('Learned value feature semantics changed');
  return model;
}
function applyLearnedValuePatch(source,modelFile='./learned-value-v1.json'){
  function replaceOnce(anchor,replacement){if(source.split(anchor).length!==2)throw new Error('Learned candidate anchor changed: '+anchor.slice(0,70));source=source.replace(anchor,replacement);}
  replaceOnce('  let configuration=\'\';',`  const learnedModel=require(${JSON.stringify(modelFile)}),learnedScale=100;
  if(learnedModel.format!=='starhop-linear-value-v1'||learnedModel.theta.length!==12||learnedModel.featureVersion!=='h-transport-phase-v1')throw new Error('Unsupported learned value model');
  const learnedBase=learnedModel.theta.slice(0,6).map((x,i)=>x/learnedModel.featureScales[i]*learnedScale),learnedLate=learnedModel.theta.slice(6).map((x,i)=>x/learnedModel.featureScales[i+6]*learnedScale);
  const learnedLo=new Uint32Array(cacheSize),learnedHi=new Uint32Array(cacheSize),learnedEarlyValue=new Float64Array(cacheSize),learnedLateValue=new Float64Array(cacheSize),learnedValid=new Uint8Array(cacheSize);
  let configuration='';`);
  replaceOnce("function clear(){ttDepth.fill(0);cacheValid.fill(0);routeValid.fill(0);configuration='';}","function clear(){ttDepth.fill(0);cacheValid.fill(0);routeValid.fill(0);learnedValid.fill(0);configuration='';}");
  replaceOnce("+':'+weights.transport;","+':'+weights.transport+':'+(options.objective==='traditional'?'traditional':'learned');");
  replaceOnce("if(cfg!==configuration){ttDepth.fill(0);cacheValid.fill(0);routeValid.fill(0);configuration=cfg;}","if(cfg!==configuration){ttDepth.fill(0);cacheValid.fill(0);routeValid.fill(0);learnedValid.fill(0);configuration=cfg;}");
  replaceOnce('    function evaluate(actor){evals++;return quality(actor)-quality(actor^1);}',`    function learnedQuality(actor){
      const p=players[actor],a=ownLo[actor]>>>0,b=ownHi[actor]>>>0,index=a&(cacheSize-1);let early,late;
      if(learnedValid[index]&&learnedLo[index]===a&&learnedHi[index]===b){early=learnedEarlyValue[index];late=learnedLateValue[index];}
      else{
        let lag=0,home=0,bridges=0;
        for(let slot=0;slot<10;slot++){
          const from=pieces[actor][slot],d=near[p][from];lag+=d*d;if(E.zoneOf[from]===p)home++;
          for(let dir=0;dir<6;dir++){const to=neighbours[from*6+dir];if(to>=0&&board[to]===p)bridges++;}
        }
        const assignment=matching(actor),edges=Math.min(bridges,16);
        early=-assignment*learnedBase[0]-lag*learnedBase[1]-home*learnedBase[2]+goals[actor]*learnedBase[3]+edges*learnedBase[4];
        late=-assignment*learnedLate[0]-lag*learnedLate[1]-home*learnedLate[2]+goals[actor]*learnedLate[3]+edges*learnedLate[4];
        learnedValid[index]=1;learnedLo[index]=a;learnedHi[index]=b;learnedEarlyValue[index]=early;learnedLateValue[index]=late;
      }
      const key=(low^turnLo[actor])>>>0,signature=(high^turnHi[actor])>>>0,at=key&(cacheSize-1);let cost;
      if(routeValid[at]&&routeLo[at]===key&&routeHi[at]===signature)cost=routeValue[at];
      else{cost=transport(actor);routeLo[at]=key;routeHi[at]=signature;routeValue[at]=cost;routeValid[at]=1;}
      const phase=Math.max(0,Math.min(1,(Math.max(goals[0],goals[1])-4)/6));
      return early*(1-phase)+late*phase-cost*(learnedBase[5]*(1-phase)+learnedLate[5]*phase);
    }
    function evaluate(actor){evals++;return options.objective==='traditional'?quality(actor)-quality(actor^1):learnedQuality(actor)-learnedQuality(actor^1);}`);
  return source;
}
module.exports={spec,sourceFile,sha,createExtractor,phaseOf,rawDifference,vectorFromRaw,predict,validateModel,applyLearnedValuePatch};
