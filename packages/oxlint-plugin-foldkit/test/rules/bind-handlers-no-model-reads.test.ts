import * as Testing from 'effect-oxlint/testing'
import { describe, expect, it } from 'vitest'

import { bindHandlersNoModelReads } from '../../src/rules/bind-handlers-no-model-reads.ts'

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
  Testing.runRule(bindHandlersNoModelReads, 'Program:exit', programNode)

const onHandler = (handlerBody: unknown, params: ReadonlyArray<unknown>) =>
  Testing.callExpr('on', [
    Testing.strLiteral('click'),
    Testing.arrowFn(handlerBody, params),
  ])

describe('bind-handlers-no-model-reads', () => {
  it('flags a direct Model read in the handler body', () => {
    const result = runRule(
      programWith(bindImport('on'), [
        Testing.returnStmt(
          onHandler(
            Testing.callExpr('Clicked', [Testing.memberExpr('model', 'count')]),
            [Testing.id('event')],
          ),
        ),
      ]),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('on()')
  })

  it('flags a bare reference to the Model parameter', () => {
    const result = runRule(
      programWith(bindImport('on'), [
        Testing.returnStmt(
          onHandler(
            Testing.blockStmt([
              Testing.varDecl('const', 'x', Testing.id('model')),
              Testing.returnStmt(
                Testing.callExpr('Clicked', [Testing.id('x')]),
              ),
            ]),
            [Testing.id('event')],
          ),
        ),
      ]),
    )

    expect(result).toHaveLength(1)
  })

  it('flags a nested Model read passed through a helper call in the handler', () => {
    const result = runRule(
      programWith(bindImport('on'), [
        Testing.returnStmt(
          onHandler(
            Testing.callExpr('helper', [Testing.memberExpr('model', 'items')]),
            [Testing.id('event')],
          ),
        ),
      ]),
    )

    expect(result).toHaveLength(1)
  })

  it('flags a Model read reached through the Bind namespace', () => {
    const result = runRule(
      programWith(bindNamespaceImport(), [
        Testing.returnStmt({
          type: 'CallExpression',
          callee: Testing.memberExpr('Bind', 'on'),
          arguments: [
            Testing.strLiteral('click'),
            Testing.arrowFn(
              Testing.callExpr('Clicked', [
                Testing.memberExpr('model', 'count'),
              ]),
              [Testing.id('event')],
            ),
          ],
        }),
      ]),
    )

    expect(result).toHaveLength(1)
  })

  it('flags every Model read when the handler reads it twice', () => {
    const result = runRule(
      programWith(bindImport('on'), [
        Testing.returnStmt(
          onHandler(
            Testing.callExpr('Clicked', [
              Testing.memberExpr('model', 'count'),
              Testing.memberExpr('model', 'total'),
            ]),
            [Testing.id('event')],
          ),
        ),
      ]),
    )

    expect(result).toHaveLength(2)
  })

  it('allows a handler that derives its payload from the event', () => {
    const result = runRule(
      programWith(bindImport('on'), [
        Testing.returnStmt(
          onHandler(
            Testing.callExpr('Typed', [Testing.memberExpr('event', 'target')]),
            [Testing.id('event')],
          ),
        ),
      ]),
    )

    expect(result).toHaveLength(0)
  })

  it('allows a handler that closes over a stable outer const', () => {
    const result = runRule(
      programWith(bindImport('on'), [
        Testing.varDecl('const', 'itemId', Testing.strLiteral('abc')),
        Testing.returnStmt(
          onHandler(Testing.callExpr('Selected', [Testing.id('itemId')]), [
            Testing.id('event'),
          ]),
        ),
      ]),
    )

    expect(result).toHaveLength(0)
  })

  it('allows a handler whose own parameter shadows the name `model`', () => {
    const result = runRule(
      programWith(bindImport('on'), [
        Testing.returnStmt(
          onHandler(Testing.callExpr('Clicked', [Testing.id('model')]), [
            Testing.id('model'),
          ]),
        ),
      ]),
    )

    expect(result).toHaveLength(0)
  })

  it('ignores files that do not import bind constructors', () => {
    const result = runRule(
      Testing.program([
        viewFunction([
          Testing.returnStmt(
            onHandler(
              Testing.callExpr('Clicked', [
                Testing.memberExpr('model', 'count'),
              ]),
              [Testing.id('event')],
            ),
          ),
        ]),
      ]),
    )

    expect(result).toHaveLength(0)
  })

  it('ignores an on() call whose second argument is not a function', () => {
    const result = runRule(
      programWith(bindImport('on'), [
        Testing.returnStmt(
          Testing.callExpr('on', [
            Testing.strLiteral('click'),
            Testing.id('sharedHandler'),
          ]),
        ),
      ]),
    )

    expect(result).toHaveLength(0)
  })
})
