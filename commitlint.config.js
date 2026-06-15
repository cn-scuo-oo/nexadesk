module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2, 'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']
    ],
    'scope-case': [2, 'always', 'kebab-case'],
    'subject-case': [0],
    'subject-full-stop': [0],
    'header-max-length': [2, 'always', 100]
  }
};
