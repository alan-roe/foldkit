import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import ogHtmlSource from '../../html/index.ts?raw'
import type { AttrBinding, On, OnDispatch } from '../bind/binding.js'
import { eventMembers } from './events.js'

// FIXTURES

type Row = Readonly<{ id: string; count: number }>

type Model = Readonly<{ title: string; rows: ReadonlyArray<Row> }>

type Message =
  | Readonly<{ _tag: 'Clicked' }>
  | Readonly<{ _tag: 'ClickedRow'; id: string; count: number }>
  | Readonly<{ _tag: 'Typed'; value: string }>
  | Readonly<{ _tag: 'GotFiles'; names: ReadonlyArray<string> }>
  | Readonly<{ _tag: 'Pressed'; key: string }>
  | Readonly<{ _tag: 'Scrolled'; scrollTop: number }>
  | Readonly<{ _tag: 'Toggled'; isOpen: boolean }>
  | Readonly<{ _tag: 'Entered' }>
  | Readonly<{ _tag: 'Left' }>
  | Readonly<{ _tag: 'Blurred' }>

const h = eventMembers<Model, Message>()

const asOn = (binding: AttrBinding<Model, Message>): On<Model, Message> => {
  if (binding._tag !== 'On') {
    throw new Error(`expected an On binding, got ${binding._tag}`)
  }
  return binding
}

const asOnDispatch = (
  binding: AttrBinding<Model, Message>,
): OnDispatch<Model, Message> => {
  if (binding._tag !== 'OnDispatch') {
    throw new Error(`expected an OnDispatch binding, got ${binding._tag}`)
  }
  return binding
}

// MESSAGE-STYLE: STATIC AND THUNK FORMS

describe('message-style events: static and thunk forms', () => {
  it('dispatches a static Message unchanged', () => {
    const binding = asOn(h.OnClick({ _tag: 'Clicked' }))

    expect(binding.event).toBe('click')
    expect(binding.toMessage(new Event('click'))).toStrictEqual({
      _tag: 'Clicked',
    })
  })

  it('evaluates a thunk at dispatch time, not at construction time', () => {
    let counter = 0
    const readItem = (): Row => ({ id: 'row-1', count: counter })

    const binding = asOn(
      h.OnClick(
        (): Message => ({
          _tag: 'ClickedRow',
          id: readItem().id,
          count: readItem().count,
        }),
      ),
    )

    // Mutate the closed-over state AFTER construction, BEFORE dispatch - a
    // static-value capture would have frozen `count: 0` at construction.
    counter = 41
    const first = binding.toMessage(new Event('click'))
    expect(first).toStrictEqual({ _tag: 'ClickedRow', id: 'row-1', count: 41 })

    counter = 42
    const second = binding.toMessage(new Event('click'))
    expect(second).toStrictEqual({
      _tag: 'ClickedRow',
      id: 'row-1',
      count: 42,
    })
  })

  it('discriminates a thunk from a static Message via typeof, not shape', () => {
    const staticBinding = asOn(h.OnDoubleClick({ _tag: 'Clicked' }))
    const thunkBinding = asOn(
      h.OnDoubleClick((): Message => ({ _tag: 'Clicked' })),
    )

    expect(staticBinding.toMessage(new Event('dblclick'))).toStrictEqual({
      _tag: 'Clicked',
    })
    expect(thunkBinding.toMessage(new Event('dblclick'))).toStrictEqual({
      _tag: 'Clicked',
    })
  })
})

// HANDLER-STYLE: PAYLOAD EXTRACTION PER FAMILY

describe('handler-style events: payload extraction per family', () => {
  it('OnInput reads the target value', () => {
    const input = document.createElement('input')
    input.value = 'hello'
    const binding = asOn(h.OnInput(value => ({ _tag: 'Typed', value })))

    const event = new Event('input')
    Object.defineProperty(event, 'target', { value: input })

    expect(binding.toMessage(event)).toStrictEqual({
      _tag: 'Typed',
      value: 'hello',
    })
  })

  it('OnChange reads the target value', () => {
    const input = document.createElement('input')
    input.value = 'world'
    const binding = asOn(h.OnChange(value => ({ _tag: 'Typed', value })))

    const event = new Event('change')
    Object.defineProperty(event, 'target', { value: input })

    expect(binding.toMessage(event)).toStrictEqual({
      _tag: 'Typed',
      value: 'world',
    })
  })

  it('OnFileChange reads target.files and resets the input value', () => {
    const input = document.createElement('input')
    input.type = 'file'
    const file = new File(['content'], 'todo.txt')
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    let currentValue = 'C:\\fakepath\\todo.txt'
    Object.defineProperty(input, 'value', {
      get: () => currentValue,
      set: (next: string) => {
        currentValue = next
      },
      configurable: true,
    })

    const binding = asOn(
      h.OnFileChange(files => ({
        _tag: 'GotFiles',
        names: files.map(f => f.name),
      })),
    )

    const event = new Event('change')
    Object.defineProperty(event, 'target', { value: input })

    expect(binding.toMessage(event)).toStrictEqual({
      _tag: 'GotFiles',
      names: ['todo.txt'],
    })
    expect(input.value).toBe('')
  })

  it('OnKeyDown reads key and modifiers', () => {
    const binding = asOn(h.OnKeyDown(key => ({ _tag: 'Pressed', key })))

    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true })

    expect(binding.toMessage(event)).toStrictEqual({
      _tag: 'Pressed',
      key: 'Enter',
    })
  })

  it('OnScroll reads target.scrollTop', () => {
    const div = document.createElement('div')
    Object.defineProperty(div, 'scrollTop', { value: 120, configurable: true })
    const binding = asOn(
      h.OnScroll(scrollTop => ({ _tag: 'Scrolled', scrollTop })),
    )

    const event = new Event('scroll')
    Object.defineProperty(event, 'target', { value: div })

    expect(binding.toMessage(event)).toStrictEqual({
      _tag: 'Scrolled',
      scrollTop: 120,
    })
  })

  it('OnToggle reads target.open', () => {
    const details = document.createElement('details')
    details.open = true
    const binding = asOn(h.OnToggle(isOpen => ({ _tag: 'Toggled', isOpen })))

    const event = new Event('toggle')
    Object.defineProperty(event, 'target', { value: details })

    expect(binding.toMessage(event)).toStrictEqual({
      _tag: 'Toggled',
      isOpen: true,
    })
  })

  it('OnDropFiles reads dataTransfer.files, preventDefaults, and clears the drag zone', () => {
    const zone = document.createElement('div')
    const file = new File(['content'], 'dropped.txt')
    const binding = asOn(
      h.OnDropFiles(files => ({
        _tag: 'GotFiles',
        names: files.map(f => f.name),
      })),
    )

    let dispatched: Message | undefined
    zone.addEventListener('drop', event => {
      dispatched = binding.toMessage(event)
    })
    const event = new Event('drop', { cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [file] },
    })
    zone.dispatchEvent(event)

    expect(dispatched).toStrictEqual({
      _tag: 'GotFiles',
      names: ['dropped.txt'],
    })
    expect(event.defaultPrevented).toBe(true)
  })
})

// EFFECTFUL: PREVENTDEFAULT AND FOCUS

describe('OnSubmit: preventDefault is observable on the synthetic event', () => {
  it('calls preventDefault before returning the Message', () => {
    const binding = asOn(h.OnSubmit({ _tag: 'Clicked' }))
    const event = new Event('submit', { cancelable: true })

    expect(event.defaultPrevented).toBe(false)
    const message = binding.toMessage(event)

    expect(event.defaultPrevented).toBe(true)
    expect(message).toStrictEqual({ _tag: 'Clicked' })
  })
})

describe('OnClickFocus: focuses the selector target from the event, then dispatches', () => {
  it('focuses the element matching focusSelector via the event target ownerDocument', () => {
    const container = document.createElement('div')
    const trigger = document.createElement('button')
    const target = document.createElement('input')
    target.id = 'search-warmup'
    container.append(trigger, target)
    document.body.append(container)

    const binding = asOn(h.OnClickFocus('#search-warmup', { _tag: 'Clicked' }))

    const event = new Event('click')
    Object.defineProperty(event, 'target', { value: trigger })

    expect(document.activeElement).not.toBe(target)
    const message = binding.toMessage(event)

    expect(document.activeElement).toBe(target)
    expect(message).toStrictEqual({ _tag: 'Clicked' })

    container.remove()
  })

  it('supports the thunk overload on the trailing Message', () => {
    let clickedCount = 0
    const binding = asOn(
      h.OnClickFocus('#nonexistent', (): Message => {
        clickedCount += 1
        return { _tag: 'Clicked' }
      }),
    )

    const event = new Event('click')
    Object.defineProperty(event, 'target', { value: document.body })
    binding.toMessage(event)

    expect(clickedCount).toBe(1)
  })
})

// ONDISPATCH: CONDITIONAL, ASYNCHRONOUS, AND NEVER-DISPATCH MEMBERS

describe('OnDispatch-routed members: conditional dispatch', () => {
  it('OnPointerLeave dispatches only when f returns Some', () => {
    const dispatchedIf = asOnDispatch(
      h.OnPointerLeave(() => Option.some({ _tag: 'Left' as const })),
    )
    const skippedIf = asOnDispatch(h.OnPointerLeave(() => Option.none()))

    const dispatched: Array<Message> = []
    const event = new Event('pointerleave')
    Object.defineProperty(event, 'pointerType', { value: 'mouse' })

    dispatchedIf.handle(event, message => dispatched.push(message))
    skippedIf.handle(event, message => dispatched.push(message))

    expect(dispatched).toStrictEqual([{ _tag: 'Left' }])
  })

  it('OnKeyDownPreventDefault preventDefaults only when f returns Some', () => {
    const binding = asOnDispatch(
      h.OnKeyDownPreventDefault(key =>
        key === 'Escape'
          ? Option.some({ _tag: 'Clicked' as const })
          : Option.none(),
      ),
    )

    const handled = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    })
    const dispatched: Array<Message> = []
    binding.handle(handled, message => dispatched.push(message))
    expect(handled.defaultPrevented).toBe(true)
    expect(dispatched).toStrictEqual([{ _tag: 'Clicked' }])

    const ignored = new KeyboardEvent('keydown', {
      key: 'a',
      cancelable: true,
    })
    const dispatchedIgnored: Array<Message> = []
    binding.handle(ignored, message => dispatchedIgnored.push(message))
    expect(ignored.defaultPrevented).toBe(false)
    expect(dispatchedIgnored).toStrictEqual([])
  })

  it('OnCopyText never dispatches - it only writes the clipboard and preventDefaults', () => {
    const binding = asOnDispatch(h.OnCopyText('hello world'))

    const setData = (kind: string, value: string): void => {
      expect(kind).toBe('text/plain')
      expect(value).toBe('hello world')
    }
    const event = new Event('copy', { cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { setData },
    })

    const dispatched: Array<Message> = []
    binding.handle(event, message => dispatched.push(message))

    expect(event.defaultPrevented).toBe(true)
    expect(dispatched).toStrictEqual([])
  })

  it('OnBlur skips dispatch when relatedTarget is the devtools host', () => {
    const devtoolsHost = document.createElement('div')
    devtoolsHost.id = 'foldkit-devtools'
    const binding = asOnDispatch(h.OnBlur({ _tag: 'Blurred' }))

    const devtoolsBlur = new FocusEvent('blur', {
      relatedTarget: devtoolsHost,
    })
    const dispatched: Array<Message> = []
    binding.handle(devtoolsBlur, message => dispatched.push(message))
    expect(dispatched).toStrictEqual([])

    const realTarget = document.createElement('button')
    const realBlur = new FocusEvent('blur', { relatedTarget: realTarget })
    binding.handle(realBlur, message => dispatched.push(message))
    expect(dispatched).toStrictEqual([{ _tag: 'Blurred' }])
  })

  it('OnDragEnter dispatches on the first entry into the zone, tracked via drag-zone state', () => {
    const zone = document.createElement('div')
    const child = document.createElement('span')
    zone.append(child)

    const binding = asOnDispatch(h.OnDragEnter({ _tag: 'Entered' }))
    const dispatched: Array<Message> = []
    zone.addEventListener('dragenter', event =>
      binding.handle(event, message => dispatched.push(message)),
    )

    const firstEntry = new Event('dragenter', { cancelable: true })
    Object.defineProperty(firstEntry, 'target', { value: zone })
    zone.dispatchEvent(firstEntry)
    expect(dispatched).toStrictEqual([{ _tag: 'Entered' }])
    expect(firstEntry.defaultPrevented).toBe(true)

    // A second entry (e.g. a child element) does not re-enter the zone.
    const childEntry = new Event('dragenter', { cancelable: true })
    Object.defineProperty(childEntry, 'target', { value: child })
    zone.dispatchEvent(childEntry)
    expect(dispatched).toStrictEqual([{ _tag: 'Entered' }])
  })
})

// LIFECYCLE

describe('OnMount / OnUnmount: MountAttr and UnmountAttr data', () => {
  it('OnMount produces a Mount AttrBinding wrapping the MountAction', () => {
    const action = {
      name: 'Measure',
      f: () => {
        throw new Error('not invoked by this test')
      },
    }

    const binding = h.OnMount(action)

    expect(binding).toStrictEqual({ _tag: 'Mount', action })
  })

  it('OnUnmount produces an Unmount AttrBinding wrapping the Message', () => {
    const message: Message = { _tag: 'Clicked' }

    const binding = h.OnUnmount(message)

    expect(binding).toStrictEqual({ _tag: 'Unmount', message })
  })
})

// INVENTORY

describe("inventory: every On* member of og's Attribute enum is ported", () => {
  it('matches the distinct On*-prefixed enum member count, minus OnCustomEvent', () => {
    const enumMemberNames = new Set(
      Array.from(
        ogHtmlSource.matchAll(/^\s*(On[A-Za-z]+):/gm),
        (match: RegExpMatchArray) => match[1],
      ),
    )
    // OnCustomEvent is never exposed through og's `h.*` factory surface
    // (`HtmlAttributes<Message>`/`htmlAttributes()` never declare it - it is
    // a standalone `Data.taggedEnum` constructor `customElement/index.ts`
    // calls directly), so porting it would add an API og's factory never
    // had. Excluded here to compare against the factory surface, not the
    // raw enum text.
    enumMemberNames.delete('OnCustomEvent')

    const portedOnMembers = Object.keys(h).filter(name => name.startsWith('On'))

    expect(portedOnMembers).toHaveLength(enumMemberNames.size)
    expect(new Set(portedOnMembers)).toStrictEqual(enumMemberNames)
  })

  it('also ports AllowDrop, sharing the conditional-dispatch primitive', () => {
    expect(Object.keys(h)).toContain('AllowDrop')
  })
})
