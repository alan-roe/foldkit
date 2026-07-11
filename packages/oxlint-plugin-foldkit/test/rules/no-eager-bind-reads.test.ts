import * as Testing from 'effect-oxlint/testing'
import { describe, expect, it } from 'vitest'

import { noEagerBindReads } from '../../src/rules/no-eager-bind-reads.ts'

const BIND_MODULE_SOURCE = '../../experimental/bind/public.ts'
const PUBLIC_SURFACE_SOURCE = 'foldkit/experimental'

const bindImport = (...names: ReadonlyArray<string>) =>
  Testing.importDeclWithSpecifiers(
    BIND_MODULE_SOURCE,
    names.map(name => Testing.importSpecifier(name)),
  )

const bindNamespaceImport = () =>
  Testing.importDeclWithSpecifiers(PUBLIC_SURFACE_SOURCE, [
    Testing.importSpecifier('Bind'),
  ])

const viewFunction = (bodyStatements: ReadonlyArray<unknown>) =>
  Testing.varDecl(
    'const',
    'view',
    Testing.arrowFn(Testing.blockStmt(bodyStatements), [Testing.id('model')]),
  )

const programWith = (
  importDecl: unknown,
  bodyStatements: ReadonlyArray<unknown>,
) => Testing.program([importDecl, viewFunction(bodyStatements)])

const runRule = (programNode: unknown) =>
  Testing.runRule(noEagerBindReads, 'Program:exit', programNode)

const objectPatternDeclarator = (name: string, init: unknown) => ({
  type: 'VariableDeclarator',
  id: {
    type: 'ObjectPattern',
    properties: [
      {
        type: 'Property',
        computed: false,
        shorthand: true,
        key: Testing.id(name),
        value: Testing.id(name),
      },
    ],
  },
  init,
})

const objectPatternVarDecl = (name: string, init: unknown) => ({
  type: 'VariableDeclaration',
  kind: 'const',
  declarations: [objectPatternDeclarator(name, init)],
})

describe('no-eager-bind-reads', () => {
  it('flags the canonical bug: an eager read captured then referenced from a thunk', () => {
    const result = runRule(
      programWith(bindImport('text'), [
        Testing.varDecl('const', 'count', Testing.memberExpr('model', 'count')),
        Testing.returnStmt(
          Testing.callExpr('text', [Testing.arrowFn(Testing.id('count'))]),
        ),
      ]),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('`count`')
  })

  it('flags a direct, unwrapped Model read passed to a binding argument', () => {
    const result = runRule(
      programWith(bindImport('text'), [
        Testing.returnStmt(
          Testing.callExpr('text', [Testing.memberExpr('model', 'count')]),
        ),
      ]),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('Wrap it in a thunk')
  })

  it('flags the canonical bug through a destructured Model read', () => {
    const result = runRule(
      programWith(bindImport('text'), [
        objectPatternVarDecl('count', Testing.id('model')),
        Testing.returnStmt(
          Testing.callExpr('text', [Testing.arrowFn(Testing.id('count'))]),
        ),
      ]),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('`count`')
  })

  it('flags a direct Model read passed as the cond discriminant', () => {
    const result = runRule(
      programWith(bindImport('cond', 'text'), [
        Testing.returnStmt(
          Testing.callExpr('cond', [
            Testing.memberExpr('model', 'status'),
            Testing.arrowFn(
              Testing.callExpr('text', [Testing.strLiteral('x')]),
              [Testing.id('key')],
            ),
          ]),
        ),
      ]),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('Wrap it in a thunk')
  })

  it('flags a direct Model read reached through the Bind namespace', () => {
    const result = runRule(
      programWith(bindNamespaceImport(), [
        Testing.returnStmt({
          type: 'CallExpression',
          callee: Testing.memberExpr('Bind', 'text'),
          arguments: [Testing.memberExpr('model', 'count')],
        }),
      ]),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('Wrap it in a thunk')
  })

  it('allows a live thunk read reached through the Bind namespace', () => {
    const result = runRule(
      programWith(bindNamespaceImport(), [
        Testing.returnStmt({
          type: 'CallExpression',
          callee: Testing.memberExpr('Bind', 'text'),
          arguments: [Testing.arrowFn(Testing.memberExpr('model', 'count'))],
        }),
      ]),
    )

    expect(result).toHaveLength(0)
  })

  it('allows a live thunk read', () => {
    const result = runRule(
      programWith(bindImport('text'), [
        Testing.returnStmt(
          Testing.callExpr('text', [
            Testing.arrowFn(Testing.memberExpr('model', 'count')),
          ]),
        ),
      ]),
    )

    expect(result).toHaveLength(0)
  })

  it('allows a live thunk read passed to attr', () => {
    const result = runRule(
      programWith(bindImport('attr'), [
        Testing.returnStmt(
          Testing.callExpr('attr', [
            Testing.strLiteral('title'),
            Testing.arrowFn(Testing.memberExpr('model', 'title')),
          ]),
        ),
      ]),
    )

    expect(result).toHaveLength(0)
  })

  it('allows a live thunk read passed to the list select argument', () => {
    const result = runRule(
      programWith(bindImport('list', 'text'), [
        Testing.returnStmt(
          Testing.callExpr('list', [
            Testing.arrowFn(Testing.memberExpr('model', 'items')),
            Testing.arrowFn(Testing.memberExpr('item', 'id'), [
              Testing.id('item'),
            ]),
            Testing.arrowFn(
              Testing.callExpr('text', [
                Testing.arrowFn(Testing.callExpr('readItem', []), []),
              ]),
              [Testing.id('readItem')],
            ),
          ]),
        ),
      ]),
    )

    expect(result).toHaveLength(0)
  })

  it('does not flag an eager Model read that never flows into a binding call', () => {
    const result = runRule(
      programWith(bindImport('text'), [
        Testing.varDecl('const', 'count', Testing.memberExpr('model', 'count')),
        Testing.ifStmt(
          Testing.binaryExpr('>', Testing.id('count'), Testing.numLiteral(0)),
          Testing.blockStmt([Testing.exprStmt(Testing.callExpr('noop'))]),
        ),
        Testing.returnStmt(
          Testing.callExpr('text', [Testing.strLiteral('static')]),
        ),
      ]),
    )

    expect(result).toHaveLength(0)
  })

  it('ignores files that do not import bind constructors', () => {
    const result = runRule(
      Testing.program([
        viewFunction([
          Testing.varDecl(
            'const',
            'count',
            Testing.memberExpr('model', 'count'),
          ),
          Testing.returnStmt(
            Testing.callExpr('text', [Testing.arrowFn(Testing.id('count'))]),
          ),
        ]),
      ]),
    )

    expect(result).toHaveLength(0)
  })

  it('ignores non-bind files with an unrelated `text` function of the same name', () => {
    const result = runRule(
      Testing.program([
        viewFunction([
          Testing.returnStmt(
            Testing.callExpr('text', [Testing.memberExpr('model', 'count')]),
          ),
        ]),
      ]),
    )

    expect(result).toHaveLength(0)
  })
})
