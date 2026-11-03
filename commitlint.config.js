// Conventional Commits, as .claude/rules/git-workflow.md describes.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'test', 'chore', 'docs', 'refactor', 'ci', 'build']]
  }
}
