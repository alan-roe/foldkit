---
'foldkit': minor
---

`CustomElement.define({ events })` now decodes each event's payload through its declared Schema at runtime, the typed escape hatch the "Why no JSX" note describes ("a decoder that fails safely on missing fields").

Previously the `events` Schemas were type-level only. At runtime the factory passed `event.detail` straight to your `toMessage`, so `toMessage`'s parameter was typed from the Schema but received raw `unknown`, and a payload that did not match silently produced a malformed Message. The runtime also accepted only browser `CustomEvent`s and dropped `Event` subclasses.

Now the declared Schema runs against the event's `detail` (a `CustomEvent`, or an `Event` subclass that carries one) or, when there is no `detail`, against the event object itself (an `Event` subclass exposing its payload as own properties, the shape the web component ecosystem is moving toward). A successful decode dispatches the mapped Message and `toMessage` receives a genuinely decoded value of the declared type. A decode failure is dropped and logged.

Behavior change: the declared Schema is now enforced. A payload that does not match is dropped instead of producing a Message. This fixes a latent unsoundness where a mismatched payload could reach `update` as a malformed Message, but a Schema declared stricter than the real payload (for example a required field that some events omit) will now drop those events. A console warning names the event and the mismatch.

The exported `OnCustomEvent` attribute's `f` signature changes from `(event: CustomEvent<any>) => Message` to `(event: Event) => Option<Message>`.

`Mount.defineStream` remains the seam for cancelable events that need a synchronous `preventDefault`, payloads split across both `detail` and event-level fields, and payloads exposed through prototype getters rather than own properties.
