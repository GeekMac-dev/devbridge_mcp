import { scanCodexHistory } from './indexer.js';
import { searchHistory } from './search.js';

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'scan') console.log(JSON.stringify(await scanCodexHistory(), null, 2));
else if (cmd === 'search') console.log(JSON.stringify(searchHistory(rest.join(' '), 30), null, 2));
else {
  console.log('Usage:\n  npm run scan\n  npm run search -- "Warehouse Allocation"\n  npm run dev   # MCP server over stdio');
}
