'use strict';
const F=require('../js/fast-search.js');
module.exports={...F,search:(state,options={})=>F.search(state,{...options,weights:{lag:.32,done:4,isolation:5,...options.weights}})};
