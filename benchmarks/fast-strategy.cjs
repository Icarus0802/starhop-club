/* Isolated weight experiment; not the production engine. */
'use strict';
const F=require('../js/fast-search.js');
module.exports={...F,search:(state,options={})=>F.search(state,{...options,weights:{lag:.32,home:2.5,done:4,transport:1,...options.weights}})};
