import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '../src/vendor/tencent-asr/speechrecognizer.es.js');
let content = fs.readFileSync(target, 'utf8');

const replacements = [
  [
    'return i=t.signCallback?t.signCallback(e):signCallback(t.secretkey,e),`wss://${e}&signature=`+encodeURIComponent(i)}',
    'i=t.signCallback?await Promise.resolve(t.signCallback(e)):signCallback(t.secretkey,e);return `wss://${e}&signature=`+encodeURIComponent(i)}',
  ],
  [
    'i=t.signCallback?t.signCallback(e):signCallback$1(t.secretkey,e);e=`wss://${e}&signature=`+encodeURIComponent(i);',
    'i=t.signCallback?await Promise.resolve(t.signCallback(e)):signCallback$1(t.secretkey,e);e=`wss://${e}&signature=`+encodeURIComponent(i);',
  ],
];

let patched = 0;
for (const [from, to] of replacements) {
  if (content.includes(from)) {
    content = content.replace(from, to);
    patched += 1;
  }
}

fs.writeFileSync(target, content, 'utf8');
console.log(`patched ${patched} occurrence(s)`);
