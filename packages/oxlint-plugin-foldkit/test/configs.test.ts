import { describe, expect, it } from 'vitest'

import plugin from '../src/index.ts'

const testFilePatterns = ['**/*.test.ts', '**/*.test.tsx']

const presets = [
  { name: 'recommended', config: plugin.configs.recommended },
  { name: 'all', config: plugin.configs.all },
  { name: 'experimental', config: plugin.configs.experimental },
]

describe('configs', () => {
  for (const { name, config } of presets) {
    describe(name, () => {
      it('turns every foldkit rule off in test files', () => {
        expect(config.overrides).toBeInstanceOf(Array)
        expect(config.overrides).toHaveLength(1)

        const override = config.overrides[0]
        expect(override?.files).toEqual(testFilePatterns)

        for (const ruleId of Object.keys(config.rules)) {
          expect(override?.rules[ruleId]).toBe('off')
        }
      })
    })
  }

  describe('recommended', () => {
    it('enables stable foldkit rules at error severity', () => {
      expect(
        plugin.configs.recommended.rules[
          'foldkit/no-child-message-construction-in-root'
        ],
      ).toBe('error')
      expect(plugin.configs.recommended.rules['foldkit/no-noop-message']).toBe(
        'error',
      )
      expect(
        plugin.configs.recommended.rules['foldkit/message-binding-matches-tag'],
      ).toBe('error')
    })

    it('excludes the experimental Bind view rules', () => {
      expect(
        plugin.configs.recommended.rules['foldkit/no-eager-bind-reads'],
      ).toBeUndefined()
      expect(
        plugin.configs.recommended.rules[
          'foldkit/bind-handlers-no-model-reads'
        ],
      ).toBeUndefined()
    })
  })

  describe('all', () => {
    it('includes the experimental Bind view rules alongside every other rule', () => {
      expect(plugin.configs.all.rules['foldkit/no-eager-bind-reads']).toBe(
        'error',
      )
      expect(
        plugin.configs.all.rules['foldkit/bind-handlers-no-model-reads'],
      ).toBe('error')
      expect(
        plugin.configs.all.rules[
          'foldkit/no-child-message-construction-in-root'
        ],
      ).toBe('error')
    })
  })

  describe('experimental', () => {
    it('enables exactly the Bind view rules at error severity', () => {
      expect(Object.keys(plugin.configs.experimental.rules).sort()).toEqual([
        'foldkit/bind-handlers-no-model-reads',
        'foldkit/no-eager-bind-reads',
      ])
      expect(
        plugin.configs.experimental.rules['foldkit/no-eager-bind-reads'],
      ).toBe('error')
      expect(
        plugin.configs.experimental.rules[
          'foldkit/bind-handlers-no-model-reads'
        ],
      ).toBe('error')
    })
  })
})
