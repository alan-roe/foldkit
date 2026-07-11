import { Array } from 'effect'
import { afterEach, beforeEach, expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  ReversedTodos,
  ToggledTodo,
  makeModelWithTodos,
  update,
} from './app.js'
import { type DomCounter, installDomCounter } from './domCounter.js'

describe('installDomCounter', () => {
  let counter: DomCounter

  beforeEach(() => {
    counter = installDomCounter(window)
  })

  afterEach(() => {
    counter.uninstall()
    document.body.innerHTML = ''
  })

  it('counts setAttribute and removeAttribute as attributeWrites', () => {
    const div = document.createElement('div')

    div.setAttribute('data-a', '1')
    div.setAttribute('data-b', '2')
    div.removeAttribute('data-a')

    expect(counter.read().attributeWrites).toBe(3)
  })

  it('counts appendChild and insertBefore as insertions', () => {
    const parent = document.createElement('ul')
    const first = document.createElement('li')
    const second = document.createElement('li')

    parent.appendChild(first)
    parent.insertBefore(second, first)

    expect(counter.read().insertions).toBe(2)
  })

  it('counts removeChild as a removal, and replaceChild as one removal and one insertion', () => {
    const parent = document.createElement('ul')
    const original = document.createElement('li')
    const replacement = document.createElement('li')
    parent.appendChild(original)
    counter.reset()

    parent.replaceChild(replacement, original)
    expect(counter.read()).toMatchObject({ removals: 1, insertions: 1 })

    parent.removeChild(replacement)
    expect(counter.read().removals).toBe(2)
  })

  it('counts textContent and CharacterData.data writes as textWrites', () => {
    const span = document.createElement('span')
    const textNode = document.createTextNode('world')

    span.textContent = 'hello'
    textNode.data = 'changed'

    expect(counter.read().textWrites).toBe(2)
  })

  it('sums every category into total', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    div.setAttribute('id', 'x')
    div.textContent = 'hi'

    const counts = counter.read()
    expect(counts.total).toBe(
      counts.attributeWrites +
        counts.textWrites +
        counts.insertions +
        counts.removals,
    )
  })

  it('reset zeroes every counter', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    div.setAttribute('id', 'x')

    counter.reset()

    expect(counter.read()).toStrictEqual({
      attributeWrites: 0,
      textWrites: 0,
      insertions: 0,
      removals: 0,
      moves: 0,
      total: 0,
    })
  })

  it('uninstall restores original prototype behavior and stops counting', () => {
    counter.uninstall()
    const div = document.createElement('div')

    document.body.appendChild(div)
    div.setAttribute('id', 'x')
    div.textContent = 'hi'

    expect(counter.read()).toStrictEqual({
      attributeWrites: 0,
      textWrites: 0,
      insertions: 0,
      removals: 0,
      moves: 0,
      total: 0,
    })
    expect(div.getAttribute('id')).toBe('x')
    expect(div.textContent).toBe('hi')
    expect(document.body.contains(div)).toBe(true)
  })
})

describe('app.ts update structural sharing', () => {
  it('ToggledTodo replaces only the matching todo reference', () => {
    const model = makeModelWithTodos(5)
    const toggledId = Array.getUnsafe(model.todos, 2).id

    const [next] = update(model, ToggledTodo({ id: toggledId }))

    for (const [index, previousTodo] of model.todos.entries()) {
      const nextTodo = Array.getUnsafe(next.todos, index)
      if (previousTodo.id === toggledId) {
        expect(nextTodo).not.toBe(previousTodo)
        expect(nextTodo.isCompleted).toBe(!previousTodo.isCompleted)
      } else {
        expect(nextTodo).toBe(previousTodo)
      }
    }
  })

  it('ReversedTodos keeps every todo reference, only reordering them', () => {
    const model = makeModelWithTodos(5)

    const [next] = update(model, ReversedTodos())

    expect(next.todos).toStrictEqual([...model.todos].reverse())
    for (const todo of model.todos) {
      expect(next.todos).toContain(todo)
    }
  })
})
