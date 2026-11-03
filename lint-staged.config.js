// Pre-commit checks on the staged files. The full gate (tools/gates) still runs before every
// commit the dev loop makes; this is the fast local subset.
export default {
  '*.{ts,js}': ['eslint --max-warnings=0', 'prettier --check'],
  '*.{json,yml,yaml}': ['prettier --check'],
  // tsc checks the whole project, so it ignores the file list.
  '*.ts': () => 'tsc --noEmit',
  '*': ['secretlint']
}
