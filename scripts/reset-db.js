// scripts/reset-db.js
const readline = require('node:readline');
const { resetAndSeed } = require('../lib/db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('This will WIPE dr-chattermate.db and reseed demo data. Type RESET to confirm: ', (ans) => {
  if (ans.trim() === 'RESET') {
    resetAndSeed();
    console.log('✓ Database reset and reseeded.');
  } else {
    console.log('Cancelled. No changes made.');
  }
  rl.close();
});