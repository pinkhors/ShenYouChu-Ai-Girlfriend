// 编译后的 out-tsc 位于 "type": "module" 的包内，需要标记为 CommonJS 才能被 Node 作为 CJS 执行。
import { writeFileSync } from 'node:fs'

writeFileSync('out-tsc/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n', 'utf8')
console.log('out-tsc/package.json written (commonjs)')