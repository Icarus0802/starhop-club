'use strict';
const P=require('./planner-adversary.cjs');
module.exports={...P,search:(state,options={})=>P.search(state,{...options,width:20,depth:6,replyWidth:3})};
