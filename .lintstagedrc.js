module.exports = {
  '*.{ts,tsx}': ['prettier --write', 'eslint --fix', () => 'tsc --noEmit -p tsconfig.json'],
  '*.{js,json,md,mjs}': ['prettier --write'],
};
