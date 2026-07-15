import { describe, expect, expectTypeOf, it } from 'vitest'

import type { Binding } from '../bind/binding.js'
import type {
  MaterializedElement,
  MaterializedText,
} from '../bind/materialize.js'
import { materialize } from '../bind/materialize.js'
import { html } from './html.js'

// FIXTURES

type Item = Readonly<{ id: string; label: string }>

type Model = Readonly<{
  title: string
  isVisible: boolean
  items: ReadonlyArray<Item>
}>

type Message = Readonly<{ _tag: 'Clicked' }>

type Status =
  | Readonly<{ _tag: 'Active' }>
  | Readonly<{ _tag: 'Done'; completedAt: string }>

const makeModel = (overrides: Partial<Model> = {}): Model => ({
  title: 'todos',
  isVisible: true,
  items: [
    { id: '1', label: 'first' },
    { id: '2', label: 'second' },
  ],
  ...overrides,
})

const expectElement = (node: MaterializedElement | MaterializedText) => {
  if (node._tag !== 'MaterializedElement') {
    throw new Error('expected a MaterializedElement')
  }
  return node
}

const expectText = (node: MaterializedElement | MaterializedText) => {
  if (node._tag !== 'MaterializedText') {
    throw new Error('expected a MaterializedText')
  }
  return node
}

// ELEMENT ARITY PARITY

describe('element constructors: normal tags take attrs and children', () => {
  it('div accepts attrs and children, matching og arity', () => {
    const h = html<Model, Message>()
    const binding = h.div([], ['hello'])
    if (binding._tag !== 'El') {
      throw new Error('expected an El binding')
    }
    expect(binding.tag).toBe('div')
    expect(binding.children).toHaveLength(1)
  })

  it('span accepts attrs and children, matching og arity', () => {
    const h = html<Model, Message>()
    const binding = h.span([], ['hello'])
    if (binding._tag !== 'El') {
      throw new Error('expected an El binding')
    }
    expect(binding.tag).toBe('span')
  })

  it('section accepts attrs and children, matching og arity', () => {
    const h = html<Model, Message>()
    const binding = h.section([], [h.div([], [])])
    if (binding._tag !== 'El') {
      throw new Error('expected an El binding')
    }
    expect(binding.tag).toBe('section')
    expect(binding.children).toHaveLength(1)
  })
})

describe('element constructors: void tags take attrs only', () => {
  it('input takes no children parameter, matching og arity', () => {
    const h = html<Model, Message>()

    expectTypeOf(h.input).parameters.toEqualTypeOf<
      [attributes?: Parameters<typeof h.input>[0]]
    >()

    const binding = h.input([])
    if (binding._tag !== 'El') {
      throw new Error('expected an El binding')
    }
    expect(binding.tag).toBe('input')
    expect(binding.children).toStrictEqual([])
  })

  it('img takes no children parameter, matching og arity', () => {
    const h = html<Model, Message>()
    const binding = h.img([])
    if (binding._tag !== 'El') {
      throw new Error('expected an El binding')
    }
    expect(binding.tag).toBe('img')
    expect(binding.children).toStrictEqual([])
  })
})

describe('element constructors: SVG and MathML tags port at og arity', () => {
  it('circle (SVG, normal) accepts attrs and children', () => {
    const h = html<Model, Message>()
    const binding = h.circle([], [])
    if (binding._tag !== 'El') {
      throw new Error('expected an El binding')
    }
    expect(binding.tag).toBe('circle')
  })

  it('mi (MathML, normal) accepts attrs and children', () => {
    const h = html<Model, Message>()
    const binding = h.mi([], ['x'])
    if (binding._tag !== 'El') {
      throw new Error('expected an El binding')
    }
    expect(binding.tag).toBe('mi')
    expect(binding.children).toHaveLength(1)
  })
})

// CHILDREN NORMALIZATION

describe('children normalization', () => {
  it('normalizes a static string into a text node', () => {
    const h = html<Model, Message>()
    const binding = h.div([], ['plain text'])
    const element = expectElement(materialize(binding, makeModel()))
    expect(element.children).toStrictEqual([
      { _tag: 'MaterializedText', text: 'plain text' },
    ])
  })

  it('normalizes a Bound thunk in child position into a text hole', () => {
    const h = html<Model, Message>()
    const binding = h.div([], [(model: Model) => model.title])
    const element = expectElement(materialize(binding, makeModel()))
    expect(element.children).toStrictEqual([
      { _tag: 'MaterializedText', text: 'todos' },
    ])
  })

  it('skips a null child entirely', () => {
    const h = html<Model, Message>()
    const binding = h.div([], ['before', null, 'after'])
    const element = expectElement(materialize(binding, makeModel()))
    expect(element.children).toHaveLength(2)
    expect(expectText(element.children[0]!).text).toBe('before')
    expect(expectText(element.children[1]!).text).toBe('after')
  })

  it('passes a nested Binding through unchanged', () => {
    const h = html<Model, Message>()
    const nested = h.span([], ['nested'])
    const binding = h.div([], [nested])
    const element = expectElement(materialize(binding, makeModel()))
    expect(element.children).toHaveLength(1)
    expect(expectElement(element.children[0]!).tag).toBe('span')
  })
})

// STRUCTURAL MEMBERS

describe('list', () => {
  it('renders one branch per select(model) item, keyed by toKey', () => {
    const h = html<Model, Message>()
    const binding = h.ul(
      [],
      [
        h.list(
          model => model.items,
          item => item.id,
          readItem => h.li([], [(): string => readItem().label]),
        ),
      ],
    )
    const element = expectElement(materialize(binding, makeModel()))
    expect(element.tag).toBe('ul')
    expect(
      element.children.map(child => expectElement(child).tag),
    ).toStrictEqual(['li', 'li'])
    expect(
      element.children.map(
        child => expectText(expectElement(child).children[0]!).text,
      ),
    ).toStrictEqual(['first', 'second'])
  })
})

describe('cond', () => {
  it('renders the branch keyed by discriminant(model)', () => {
    const h = html<Model, Message>()
    const binding = h.cond(
      model => (model.isVisible ? 'Shown' : 'Hidden'),
      key => (key === 'Shown' ? h.span([], ['shown']) : h.span([], ['hidden'])),
    )
    const shown = expectElement(
      materialize(binding, makeModel({ isVisible: true })),
    )
    expect(expectText(shown.children[0]!).text).toBe('shown')
    const hidden = expectElement(
      materialize(binding, makeModel({ isVisible: false })),
    )
    expect(expectText(hidden.children[0]!).text).toBe('hidden')
  })
})

describe('when', () => {
  it('renders renderTrue when the predicate holds, renderFalse otherwise', () => {
    const h = html<Model, Message>()
    const binding = h.when(
      model => model.isVisible,
      () => h.span([], ['visible']),
      () => h.span([], ['invisible']),
    )
    const trueCase = expectElement(
      materialize(binding, makeModel({ isVisible: true })),
    )
    expect(expectText(trueCase.children[0]!).text).toBe('visible')
    const falseCase = expectElement(
      materialize(binding, makeModel({ isVisible: false })),
    )
    expect(expectText(falseCase.children[0]!).text).toBe('invisible')
  })

  it('renders an empty text branch when renderFalse is omitted', () => {
    const h = html<Model, Message>()
    const binding = h.when(
      model => model.isVisible,
      () => h.span([], ['visible']),
    )
    const falseCase = expectText(
      materialize(binding, makeModel({ isVisible: false })),
    )
    expect(falseCase.text).toBe('')
  })
})

describe('matchTag: compile-time exhaustiveness', () => {
  it('dispatches to the branch matching select(model)._tag', () => {
    type StatusModel = Readonly<{ status: Status }>
    const h = html<StatusModel, Message>()
    const binding = h.matchTag<Status>(model => model.status, {
      Active: () => h.span([], ['active']),
      Done: () => h.span([], ['done']),
    })
    const active = expectElement(
      materialize(binding, { status: { _tag: 'Active' } }),
    )
    expect(expectText(active.children[0]!).text).toBe('active')
    const done = expectElement(
      materialize(binding, {
        status: { _tag: 'Done', completedAt: '2026-07-15' },
      }),
    )
    expect(expectText(done.children[0]!).text).toBe('done')
  })

  it('rejects a branches record missing an arm at compile time', () => {
    type StatusModel = Readonly<{ status: Status }>
    const h = html<StatusModel, Message>()

    const binding: Binding<StatusModel, Message> = h.matchTag<Status>(
      model => model.status,
      // @ts-expect-error matchTag's branches record must be total over Status['_tag']; 'Done' is missing.
      { Active: () => h.span([], []) },
    )

    expect(binding).toBeDefined()
  })
})

describe('submodel', () => {
  it('pins Parent/ParentMessage to the enclosing factory Model/Message', () => {
    type ChildModel = Readonly<{ count: number }>
    type ChildMessage = Readonly<{ _tag: 'Incremented' }>
    type PublishedShape = Readonly<Record<string, never>>

    const h = html<Model, Message>()
    const childHtml = html<ChildModel, ChildMessage>()
    const childBinding = h.submodel<ChildModel, ChildMessage, PublishedShape>({
      select: (model: Model) => ({ count: model.items.length }),
      toMessage: () => ({ _tag: 'Clicked' }),
      view: viewInputs => childHtml.section([], [viewInputs.toView({})]),
      viewInputs: {
        toView: () =>
          h.span([], [(model): string => String(model.items.length)]),
      },
    })

    const binding = h.div([], [childBinding])
    const element = expectElement(materialize(binding, makeModel()))
    const sub = element.children[0]
    if (sub === undefined || sub._tag !== 'MaterializedElement') {
      throw new Error('expected the Sub child to materialize as an element')
    }
    expect(sub.tag).toBe('section')
    const host = sub.children[0]
    if (host === undefined || host._tag !== 'MaterializedElement') {
      throw new Error('expected the Host child to materialize as an element')
    }
    expect(host.tag).toBe('span')
    expect(expectText(host.children[0]!).text).toBe('2')
  })
})

describe('empty', () => {
  it('is null, so normalizeChildren skips it', () => {
    const h = html<Model, Message>()
    expect(h.empty).toBeNull()
    const binding = h.div([], ['before', h.empty, 'after'])
    const element = expectElement(materialize(binding, makeModel()))
    expect(element.children).toHaveLength(2)
  })
})

// SINGLETON IDENTITY

describe('html: process-wide singleton', () => {
  it('returns the same record reference across instantiations, mirroring og', () => {
    const first = html<Model, Message>()
    const second = html<Readonly<{ other: boolean }>, Readonly<{ _tag: 'X' }>>()
    expect(first).toBe(second)
    expect(first.div).toBe(second.div)
  })
})

// FAMILY WIRING SMOKE TEST

describe('attributeMembers and eventMembers spread', () => {
  it('exposes attribute and event members alongside element constructors', () => {
    const h = html<Model, Message>()
    const binding = h.div(
      [h.Class('todo-list'), h.OnClick({ _tag: 'Clicked' })],
      [],
    )
    if (binding._tag !== 'El') {
      throw new Error('expected an El binding')
    }
    expect(binding.attrs).toHaveLength(2)
  })
})
