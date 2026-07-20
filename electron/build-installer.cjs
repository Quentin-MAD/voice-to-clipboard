const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const installerScript = path.join(repoRoot, 'electron', 'installer.nsi');

const candidates = [
  process.env.MAKENSIS,
  path.join(process.env['ProgramFiles(x86)'] || '', 'NSIS', 'makensis.exe'),
  path.join(process.env.ProgramFiles || '', 'NSIS', 'makensis.exe'),
  'C:\\ProgramData\\chocolatey\\bin\\makensis.exe',
  'makensis',
].filter(Boolean);

const makensis = candidates.find((candidate) => candidate === 'makensis' || fs.existsSync(candidate));

if (!makensis) {
  console.error('makensis.exe introuvable. NSIS doit etre installe avant cette etape.');
  console.error(`Chemins testes: ${candidates.join(', ')}`);
  process.exit(1);
}

console.log(`NSIS utilise: ${makensis}`);

const result = spawnSync(makensis, [installerScript], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);