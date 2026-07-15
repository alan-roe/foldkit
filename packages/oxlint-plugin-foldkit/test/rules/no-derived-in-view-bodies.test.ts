import * as Testing from 'effect-oxlint/testing'
import { describe, expect, it } from 'vitest'

import { noDerivedInViewBodies } from '../../src/rules/no-derived-in-view-bodies.ts'

const BIND_MODULE_SOURCE = '../../experimental/bind/public.ts'
const DERIVED_MODULE_SOURCE = '../../experimental/reactive/derived.ts'
const PUBLIC_SURFACE_SOURCE = 'foldkit/experimental'

const bindImport = (...names: ReadonlyArray<string>) =>
  Testing.importDeclWithSpecifiers(
    BIND_MODULE_SOURCE,
    names.map(name => Testing.importSpecifier(name)),
  )

const derivedImport = (local?: string) =>
  Testing.importDeclWithSpecifiers(DERIVED_MODULE_SOURCE, [
    Testing.importSpecifier('derived', local),
  ])

const derivedPublicSurfaceImport = (local?: string) =>
  Testing.importDeclWithSpecifiers(PUBLIC_SURFACE_SOURCE, [
    Testing.importSpecifier('derived', local),
  ])

const programWith = (
  imports: ReadonlyArray<unknown>,
  bodyStatements: ReadonlyArray<unknown>,
) => Testing.program([...imports, ...bodyStatements])

const runRule = (programNode: unknown) =>
  Testing.runRule(noDerivedInViewBodies, 'Program:exit', programNode)

const derivedCall = (localName = 'derived') =>
  Testing.callExpr(localName, [
    Testing.arrowFn(Testing.memberExpr('model', 'count'), [
      Testing.id('model'),
    ]),
  ])

describe('no-derived-in-view-bodies', () => {
  it('allows a `derived` call at module scope', () => {
    const result = runRule(
      programWith(
        [bindImport('list'), derivedImport()],
        [Testing.varDecl('const', 'filteredCount', derivedCall())],
      ),
    )

    expect(result).toHaveLength(0)
  })

  it('allows a `derived` call inside a plain top-level factory function', () => {
    const result = runRule(
      programWith(
        [bindImport('list'), derivedImport()],
        [
          Testing.varDecl(
            'const',
            'buildRow',
            Testing.arrowFn(
              Testing.blockStmt([
                Testing.varDecl('const', 'count', derivedCall()),
                Testing.returnStmt(Testing.id('count')),
              ]),
            ),
          ),
        ],
      ),
    )

    expect(result).toHaveLength(0)
  })

  it('(a) flags a `derived` call inside a function passed as a `list` argument', () => {
    const result = runRule(
      programWith(
        [bindImport('list'), derivedImport()],
        [
          Testing.returnStmt(
            Testing.callExpr('list', [
              Testing.arrowFn(Testing.id('model'), [Testing.id('model')]),
              Testing.arrowFn(Testing.memberExpr('todo', 'id'), [
                Testing.id('todo'),
              ]),
              Testing.arrowFn(derivedCall(), [Testing.id('readItem')]),
            ]),
          ),
        ],
      ),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('module scope')
  })

  it('(a) flags a `derived` call inside a `submodel` config argument', () => {
    const result = runRule(
      programWith(
        [bindImport('submodel'), derivedImport()],
        [
          Testing.returnStmt(
            Testing.callExpr('submodel', [
              Testing.objectExpr([
                {
                  key: 'view',
                  value: Testing.arrowFn(derivedCall(), [
                    Testing.id('viewInputs'),
                  ]),
                },
              ]),
            ]),
          ),
        ],
      ),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('module scope')
  })

  it('(b) flags a `derived` call inside a `renderItem`-named property value', () => {
    const result = runRule(
      programWith(
        [derivedImport()],
        [
          Testing.varDecl(
            'const',
            'rowConfig',
            Testing.objectExpr([
              {
                key: 'renderItem',
                value: Testing.arrowFn(derivedCall(), [Testing.id('readItem')]),
              },
            ]),
          ),
        ],
      ),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('module scope')
  })

  it('(b) flags a `derived` call inside a `toView`-named property value', () => {
    const result = runRule(
      programWith(
        [derivedImport()],
        [
          Testing.varDecl(
            'const',
            'viewInputs',
            Testing.objectExpr([
              {
                key: 'toView',
                value: Testing.arrowFn(derivedCall(), [
                  Testing.id('published'),
                ]),
              },
            ]),
          ),
        ],
      ),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('module scope')
  })

  it('(c) flags a `derived` call inside an arrow nested inside `renderItem`', () => {
    const result = runRule(
      programWith(
        [derivedImport()],
        [
          Testing.varDecl(
            'const',
            'rowConfig',
            Testing.objectExpr([
              {
                key: 'renderItem',
                value: Testing.arrowFn(
                  Testing.blockStmt([
                    Testing.varDecl(
                      'const',
                      'readCount',
                      Testing.arrowFn(derivedCall()),
                    ),
                    Testing.returnStmt(Testing.callExpr('readCount')),
                  ]),
                  [Testing.id('readItem')],
                ),
              },
            ]),
          ),
        ],
      ),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('module scope')
  })

  it('flags an aliased `derived` import used inside `renderItem`', () => {
    const result = runRule(
      programWith(
        [derivedImport('d')],
        [
          Testing.varDecl(
            'const',
            'rowConfig',
            Testing.objectExpr([
              {
                key: 'renderItem',
                value: Testing.arrowFn(derivedCall('d'), [
                  Testing.id('readItem'),
                ]),
              },
            ]),
          ),
        ],
      ),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('module scope')
  })

  it('flags a `derived` import reached through the `foldkit/experimental` public surface', () => {
    const result = runRule(
      programWith(
        [derivedPublicSurfaceImport()],
        [
          Testing.varDecl(
            'const',
            'rowConfig',
            Testing.objectExpr([
              {
                key: 'renderBranch',
                value: Testing.arrowFn(derivedCall(), [Testing.id('key')]),
              },
            ]),
          ),
        ],
      ),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('module scope')
  })

  it('ignores files that do not import `derived`', () => {
    const result = runRule(
      programWith(
        [bindImport('list')],
        [
          Testing.returnStmt(
            Testing.callExpr('list', [
              Testing.arrowFn(Testing.id('model'), [Testing.id('model')]),
              Testing.arrowFn(Testing.memberExpr('todo', 'id'), [
                Testing.id('todo'),
              ]),
              Testing.arrowFn(derivedCall(), [Testing.id('readItem')]),
            ]),
          ),
        ],
      ),
    )

    expect(result).toHaveLength(0)
  })
})
