import { Runtime } from 'foldkit'

import { Model, init, update } from './main.js'
import { bindView } from './main.finegrained.js'

// Fine-grained-rendering entry point for the lustre-benchmark TodoMVC slot.
// `bindView` mounts through `Runtime.makeElement`'s fine-grained render
// path (the reactive store/renderer, rAF-batched via the runtime's own
// render loop), the same public surface `entry.ts` and `entry.optimised.ts`
// use for their `view`-based slots.

const application = Runtime.makeElement({
  Model,
  init,
  update,
  bindView,
  container: document.getElementById('root'),
  devTools: false,
})

Runtime.run(application)
