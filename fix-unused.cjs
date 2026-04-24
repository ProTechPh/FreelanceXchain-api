const { execSync } = require('child_process');
const fs = require('fs');

const json = execSync('pnpm exec eslint src --format json', { encoding: 'utf8' });
const data = JSON.parse(json);

for (const file of data) {
  const msgs = file.messages.filter(m => m.ruleId === '@typescript-eslint/no-unused-vars');
  if (!msgs.length) continue;

  let content = fs.readFileSync(file.filePath, 'utf8');
  const lines = content.split('\n');

  for (const msg of msgs.reverse()) {
    const line = msg.line - 1;
    const col = msg.column - 1;
    const text = msg.message;

    // Extract variable name from message
    const m = text.match(/'([^']+)'/);
    if (!m) continue;
    const name = m[1];

    const original = lines[line];

    // Strategy: prefix with _ for catch clauses, unused params, destructured vars
    if (original.includes(`catch (${name}`) || original.includes(`catch ( ${name}`)) {
      lines[line] = original.replace(new RegExp(`catch\\s*\\(\\s*${name}\\s*\\)`), `catch (_${name})`);
    } else if (original.includes(`${name}:`)) {
      // Destructured object property - rename to _name: name
      lines[line] = original.replace(new RegExp(`\\b${name}\\b(?=\\s*:)`, 'g'), `_${name}`);
    } else {
      // Simple variable rename
      lines[line] = original.replace(new RegExp(`\\b${name}\\b`), `_${name}`);
    }
  }

  fs.writeFileSync(file.filePath, lines.join('\n'));
  console.log('Fixed:', file.filePath);
}
