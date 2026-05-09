const fs = require('fs');
const p = 'D:\\INSPECT\\Tower\\Mesh & Alignment\\Georefrenced\\3D Tileset\\tileset_Tower.json';
const t = fs.readFileSync(p, 'utf8').replace(/"url":/g, '"uri":');
fs.writeFileSync(p, t, 'utf8');
console.log('Fixed. Size:', t.length);

// Also check the structure
const j = JSON.parse(t);
console.log('Transform[12..14]:', j.root.transform.slice(12, 15));
console.log('Root keys:', Object.keys(j));
