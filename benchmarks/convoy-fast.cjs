'use strict';
const F=require('../js/fast-search.js');
module.exports={...F,search:(state,options={})=>F.search(state,{...options,weights:{lag:1.2,done:2,home:3,isolation:5,sideCamp:8,...options.weights}})};
