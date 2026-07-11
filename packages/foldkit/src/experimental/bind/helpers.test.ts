import { describe, expect, it } from 'vitest'

import { el, text } from './binding.js'
import { matchTag, when } from './helpers.js'
import { materialize } from './materialize.js'

// FIXTURES

type Model = Readonly<{ isVisible: boolean; filter: string }>
type Message = never

const makeModel = (overrides: Partial<Model> = {}): Model => ({
  isVisible: true,
  filter: 'All',
  ...overrides,
})

// WHEN

describe('when', () => {
  it('materializes the true branch when the predicate holds', () => {
    const binding = el<Model, Message>(
      'div',
      [],
      [
        when<Model, Message>(
          model => model.isVisible,
          () => text('visible'),
          () => text('hidden'),
        ),
      ],
    )

    const result = materialize(binding, makeModel({ isVisible: true }))
    if (result._tag !== 'MaterializedElement') {
      throw new Error('expected a MaterializedElement')
    }
    expect(result.children).toStrictEqual([
      { _tag: 'MaterializedText', text: 'visible' },
    ])
  })

  it('materializes the false branch when the predicate does not hold', () => {
    const binding = el<Model, Message>(
      'div',
      [],
      [
        when<Model, Message>(
          model => model.isVisible,
          () => text('visible'),
          () => text('hidden'),
        ),
      ],
    )

    const result = materialize(binding, makeModel({ isVisible: false }))
    if (result._tag !== 'MaterializedElement') {
      throw new Error('expected a MaterializedElement')
    }
    expect(result.children).toStrictEqual([
      { _tag: 'MaterializedText', text: 'hidden' },
    ])
  })

  it('renders an empty branch when renderFalse is omitted and the predicate is false', () => {
    const binding = el<Model, Message>(
      'div',
      [],
      [
        when<Model, Message>(
          model => model.isVisible,
          () => text('visible'),
        ),
      ],
    )

    const result = materialize(binding, makeModel({ isVisible: false }))
    if (result._tag !== 'MaterializedElement') {
      throw new Error('expected a MaterializedElement')
    }
    expect(result.children).toStrictEqual([
      { _tag: 'MaterializedText', text: '' },
    ])
  })
})

// MATCH TAG

describe('matchTag', () => {
  it('switches between branches keyed by select(model)', () => {
    const binding = el<Model, Message>(
      'div',
      [],
      [
        matchTag<Model, Message>(model => model.filter, {
          All: () => text('all todos'),
          Active: () => text('active todos'),
        }),
      ],
    )

    const all = materialize(binding, makeModel({ filter: 'All' }))
    const active = materialize(binding, makeModel({ filter: 'Active' }))
    if (
      all._tag !== 'MaterializedElement' ||
      active._tag !== 'MaterializedElement'
    ) {
      throw new Error('expected MaterializedElements')
    }
    expect(all.children).toStrictEqual([
      { _tag: 'MaterializedText', text: 'all todos' },
    ])
    expect(active.children).toStrictEqual([
      { _tag: 'MaterializedText', text: 'active todos' },
    ])
  })

  it('is a defect naming the key when no branch matches', () => {
    const binding = matchTag<Model, Message>(model => model.filter, {
      All: () => text('all todos'),
    })

    expect(() =>
      materialize(binding, makeModel({ filter: 'Unknown' })),
    ).toThrow(/Unknown/)
  })
})
