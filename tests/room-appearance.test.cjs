'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalize,validateFile}=require('../js/room-appearance.js');
test('appearance preferences handle malformed saved values and bound dimming',()=>{
  assert.deepEqual(normalize(null),{palette:'graphite',dim:55});
  assert.deepEqual(normalize({palette:'unknown',dim:'not a number'}),{palette:'graphite',dim:55});
  assert.deepEqual(normalize({palette:'midnight',dim:999}),{palette:'midnight',dim:85});
  assert.deepEqual(normalize({palette:'sand',dim:-1}),{palette:'sand',dim:20});
});
test('custom backgrounds accept raster images and reject unsupported or oversized files before decoding',()=>{
  for(const type of ['image/png','image/jpeg','image/webp','image/avif'])assert.doesNotThrow(()=>validateFile({type,size:1024}));
  for(const type of ['image/svg+xml','text/html','application/json',''])assert.throws(()=>validateFile({type,size:1024}));
  assert.throws(()=>validateFile({type:'image/png',size:20*1024*1024+1}),/20 MB/);
});
