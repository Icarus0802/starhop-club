'use strict';
// MIT. v1 feature extraction stays frozen. v2 adds shared artifact validation
// used by both CPU training and candidate J before any learned leaf is searched.
const V=require('./value-features.cjs');
function validateModel(model){
  V.validateModel(model);
  if(model.trained!==true||model.phase!==V.spec.phase||model.bias!==0||model.scoreScale!==100)throw new Error('Learned model phase, bias, status or score scale is invalid');
  if(!Array.isArray(model.featureScales)||model.featureScales.length!==12||model.featureScales.some(x=>!Number.isFinite(x)||x<=0))throw new Error('Learned model feature scales must be finite positive values');
  const effective=model.theta.map((value,i)=>value/model.featureScales[i]*100);
  if(effective.some(value=>!Number.isFinite(value)))throw new Error('Learned model effective coefficients are nonfinite');
  if(!Array.isArray(model.scoreWeights)||model.scoreWeights.length!==12||model.scoreWeights.some((value,i)=>!Number.isFinite(value)||value!==effective[i]))throw new Error('Learned model reported score weights disagree with inference');
  return model;
}
function applyLearnedValuePatch(source,modelFile='./learned-value-v2.json'){
  source=V.applyLearnedValuePatch(source,modelFile);
  function once(anchor,replacement){if(source.split(anchor).length!==2)throw new Error('Strict learned candidate anchor changed');source=source.replace(anchor,replacement);}
  once(`  const learnedModel=require(${JSON.stringify(modelFile)}),learnedScale=100;`,`  const learnedModel=require('./value-features-v2.cjs').validateModel(require(${JSON.stringify(modelFile)})),learnedScale=100;`);
  once("    function evaluate(actor){evals++;return options.objective==='traditional'?quality(actor)-quality(actor^1):learnedQuality(actor)-learnedQuality(actor^1);}",`    function evaluate(actor){
      evals++;const value=options.objective==='traditional'?quality(actor)-quality(actor^1):learnedQuality(actor)-learnedQuality(actor^1);
      if(!Number.isFinite(value))throw new Error('Nonfinite learned/static evaluation');
      // WIN is reserved for actual terminal detection. A learned logit, even
      // when finite and unusually large, cannot masquerade as a solved game.
      return options.objective==='traditional'?value:Math.max(-WIN+1,Math.min(WIN-1,value));
    }`);
  return source;
}
module.exports={...V,validateModel,applyLearnedValuePatch};
