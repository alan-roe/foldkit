import { Plugin } from 'effect-oxlint'

import { bindHandlersNoModelReads } from './rules/bind-handlers-no-model-reads.ts'
import { commandBindingMatchesName } from './rules/command-binding-matches-name.ts'
import { commandDefinePascalConst } from './rules/command-define-pascal-const.ts'
import { gotPrefixRequiresSubmodelPayload } from './rules/got-prefix-requires-submodel-payload.ts'
import { gotSubmodelMessageName } from './rules/got-submodel-message-name.ts'
import { gotWrapperCarriesOnlyRouting } from './rules/got-wrapper-carries-only-routing.ts'
import { keyedRequiredForMappedRows } from './rules/keyed-required-for-mapped-rows.ts'
import { lazyViewStableReferences } from './rules/lazy-view-stable-references.ts'
import { messageBindingMatchesTag } from './rules/message-binding-matches-tag.ts'
import { mountFactoryMustUseElement } from './rules/mount-factory-must-use-element.ts'
import { noArrayIndexViewKeys } from './rules/no-array-index-view-keys.ts'
import { noChildMessageConstructionInRoot } from './rules/no-child-message-construction-in-root.ts'
import { noDerivedInViewBodies } from './rules/no-derived-in-view-bodies.ts'
import { noDisablingDevGuardrails } from './rules/no-disabling-dev-guardrails.ts'
import { noDuplicateOnmountPerElement } from './rules/no-duplicate-onmount-per-element.ts'
import { noEagerBindReads } from './rules/no-eager-bind-reads.ts'
import { noEmptyObjectTaggedCall } from './rules/no-empty-object-tagged-call.ts'
import { noHandRolledCommandStruct } from './rules/no-hand-rolled-command-struct.ts'
import { noHardcodedRouteStrings } from './rules/no-hardcoded-route-strings.ts'
import { noModuleLevelMutableState } from './rules/no-module-level-mutable-state.ts'
import { noNoopMessage } from './rules/no-noop-message.ts'
import { noRawDomEventAttributes } from './rules/no-raw-dom-event-attributes.ts'
import { noSpreadInEvo } from './rules/no-spread-in-evo.ts'
import { preferCallableMessageConstructor } from './rules/prefer-callable-message-constructor.ts'
import { requireRelForExternalLink } from './rules/require-rel-for-external-link.ts'
import { selectionSubmodelFactoryAtModuleScope } from './rules/selection-submodel-factory-at-module-scope.ts'
import { wrapChildOutputInGotMessage } from './rules/wrap-child-output-in-got-message.ts'

const RECOMMENDED_RULE_NAMES = [
  'command-binding-matches-name',
  'command-define-pascal-const',
  'got-prefix-requires-submodel-payload',
  'got-submodel-message-name',
  'got-wrapper-carries-only-routing',
  'keyed-required-for-mapped-rows',
  'lazy-view-stable-references',
  'message-binding-matches-tag',
  'mount-factory-must-use-element',
  'no-array-index-view-keys',
  'no-child-message-construction-in-root',
  'no-disabling-dev-guardrails',
  'no-duplicate-onmount-per-element',
  'no-empty-object-tagged-call',
  'no-hand-rolled-command-struct',
  'no-hardcoded-route-strings',
  'no-module-level-mutable-state',
  'no-noop-message',
  'no-raw-dom-event-attributes',
  'no-spread-in-evo',
  'prefer-callable-message-constructor',
  'require-rel-for-external-link',
  'selection-submodel-factory-at-module-scope',
  'wrap-child-output-in-got-message',
] as const

// Rules for the experimental `foldkit/experimental` Bind view surface
// (fine-grained bindings) are excluded from `recommended`. The Bind API
// itself is experimental and most apps do not use it yet, so its rules
// live only in `all` and in the dedicated `experimental` preset below.
const EXPERIMENTAL_RULE_NAMES = [
  'no-derived-in-view-bodies',
  'no-eager-bind-reads',
  'bind-handlers-no-model-reads',
] as const

const basePlugin = Plugin.define({
  name: 'foldkit',
  specifier: '@foldkit/oxlint-plugin',
  rules: {
    'command-binding-matches-name': commandBindingMatchesName,
    'command-define-pascal-const': commandDefinePascalConst,
    'got-prefix-requires-submodel-payload': gotPrefixRequiresSubmodelPayload,
    'got-submodel-message-name': gotSubmodelMessageName,
    'got-wrapper-carries-only-routing': gotWrapperCarriesOnlyRouting,
    'keyed-required-for-mapped-rows': keyedRequiredForMappedRows,
    'lazy-view-stable-references': lazyViewStableReferences,
    'message-binding-matches-tag': messageBindingMatchesTag,
    'mount-factory-must-use-element': mountFactoryMustUseElement,
    'no-array-index-view-keys': noArrayIndexViewKeys,
    'no-child-message-construction-in-root': noChildMessageConstructionInRoot,
    'no-disabling-dev-guardrails': noDisablingDevGuardrails,
    'no-duplicate-onmount-per-element': noDuplicateOnmountPerElement,
    'no-empty-object-tagged-call': noEmptyObjectTaggedCall,
    'no-hand-rolled-command-struct': noHandRolledCommandStruct,
    'no-hardcoded-route-strings': noHardcodedRouteStrings,
    'no-module-level-mutable-state': noModuleLevelMutableState,
    'no-noop-message': noNoopMessage,
    'no-raw-dom-event-attributes': noRawDomEventAttributes,
    'no-spread-in-evo': noSpreadInEvo,
    'prefer-callable-message-constructor': preferCallableMessageConstructor,
    'require-rel-for-external-link': requireRelForExternalLink,
    'selection-submodel-factory-at-module-scope':
      selectionSubmodelFactoryAtModuleScope,
    'wrap-child-output-in-got-message': wrapChildOutputInGotMessage,
    'no-eager-bind-reads': noEagerBindReads,
    'bind-handlers-no-model-reads': bindHandlersNoModelReads,
    'no-derived-in-view-bodies': noDerivedInViewBodies,
  },
  recommended: {
    rules: RECOMMENDED_RULE_NAMES,
  },
})

type OverriddenConfig = Plugin.OxlintConfig & {
  overrides: Array<{
    files: Array<string>
    rules: Record<string, Plugin.RuleSeverity>
  }>
}

const testFilePatterns = ['**/*.test.ts', '**/*.test.tsx']

// Foldkit rules police application definitions. Tests exercise those
// definitions rather than write them, so the rules are inert at best and
// invert at worst (a test may legitimately hardcode a route or hand-roll a
// Command struct). Scope every foldkit rule off in test files by default; a
// rule that wants test coverage opts in explicitly.
const withTestOverride = (config: Plugin.OxlintConfig): OverriddenConfig => ({
  ...config,
  overrides: [
    {
      files: testFilePatterns,
      rules: Object.fromEntries(
        Object.keys(config.rules).map((id): [string, Plugin.RuleSeverity] => [
          id,
          'off',
        ]),
      ),
    },
  ],
})

// Rules for the experimental `foldkit/experimental` Bind view surface,
// spread alongside `recommended` by apps that opt into `bindView`. Kept
// out of `recommended` and separate from `all` (which already carries
// every registered rule, including these) so an app can adopt bind
// discipline without pulling in the rest of `all`.
const experimentalConfig: Plugin.OxlintConfig = {
  jsPlugins: basePlugin.configs.all.jsPlugins,
  rules: Object.fromEntries(
    EXPERIMENTAL_RULE_NAMES.map((name): [string, Plugin.RuleSeverity] => [
      `foldkit/${name}`,
      'error',
    ]),
  ),
}

export default {
  ...basePlugin,
  configs: {
    recommended: withTestOverride(basePlugin.configs.recommended),
    all: withTestOverride(basePlugin.configs.all),
    experimental: withTestOverride(experimentalConfig),
  },
}
