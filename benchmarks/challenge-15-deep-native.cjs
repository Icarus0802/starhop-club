'use strict';
const base=require('./rule-aware-deep-native.cjs'),R=require('../js/repetition-rule.js');
module.exports={
  ready:()=>base.ready(),clear:()=>base.clear(),close:()=>base.close(),waitForIdle:()=>base.waitForIdle(),
  async search(state,options={}){
    const start=performance.now(),prepared=R.prepareOptions(state,options);
    // Leave room inside the user's 15-second cap for the final legality guard.
    const result=R.guardResult(state,prepared,await base.search(state,{...prepared,time:Math.max(30,(Number(options.time)||15000)-100)}));
    return {...result,time:performance.now()-start};
  }
};
