'use strict';
const F=require('../js/fast-search.js');
module.exports={...F,search:(state,options={})=>F.search(state,{...options,weights:{...options.weights,sideCamp:8}})};
