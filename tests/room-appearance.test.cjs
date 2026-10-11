'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalize,validateFile,resolvePieces,pieceSchemes}=require('../js/room-appearance.js');
test('appearance preferences handle malformed saved values and bound dimming',()=>{
  const pieces={pieceScheme:'classic',ownColor:'auto',boardStyle:'auto',moveEffect:'classic',showPath:true,autoReplay:true};
  assert.deepEqual(normalize(null),{palette:'graphite',dim:55,artwork:true,motion:false,...pieces});
  assert.deepEqual(normalize({palette:'unknown',dim:'not a number'}),{palette:'graphite',dim:55,artwork:true,motion:false,...pieces});
  assert.deepEqual(normalize({palette:'midnight',dim:999}),{palette:'midnight',dim:85,artwork:true,motion:false,...pieces});
  assert.deepEqual(normalize({palette:'sand',dim:-1}),{palette:'sand',dim:20,artwork:true,motion:false,...pieces});
  assert.deepEqual(normalize({palette:'anime',artwork:false,motion:true}),{palette:'anime',dim:55,artwork:false,motion:true,...pieces});
  assert.equal(normalize({motion:'true'}).motion,false);
});

test('piece palettes keep six distinct camps and personal color follows the selected seat',()=>{
  for(const pieceScheme of Object.keys(pieceSchemes)){
    const palette=resolvePieces({pieceScheme});assert.equal(new Set(palette.colors).size,6);assert.equal(palette.names.length,6);
    for(const players of [[3,0],[3,5,1],[5,1,2,4],[3,4,5,0,1,2]])for(let seat=0;seat<players.length;seat++){
      const pink=resolvePieces({pieceScheme,ownColor:'sakura'},players,seat);assert.equal(pink.names[players[seat]],'樱花粉');assert.equal(new Set(pink.colors).size,6);
    }
  }
  const swapped=resolvePieces({ownColor:'blue'},[3,0],1);assert.equal(swapped.names[0],'钴蓝');assert.equal(swapped.names[3],'香槟金');
  assert.deepEqual(resolvePieces({pieceScheme:'invalid',ownColor:'__proto__'}),resolvePieces(null));
});
test('custom backgrounds accept raster images and reject unsupported or oversized files before decoding',()=>{
  for(const type of ['image/png','image/jpeg','image/webp','image/avif'])assert.doesNotThrow(()=>validateFile({type,size:1024}));
  for(const type of ['image/svg+xml','text/html','application/json',''])assert.throws(()=>validateFile({type,size:1024}));
  assert.throws(()=>validateFile({type:'image/png',size:20*1024*1024+1}),/20 MB/);
});
