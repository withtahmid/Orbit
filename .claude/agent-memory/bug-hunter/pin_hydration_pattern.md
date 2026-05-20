---
name: pin-hydration-pattern
description: NewTransactionSheet.tsx pin-hydration uses per-field useEffects with per-field locked refs and focused [pinState.pins?.X?.id] deps — NOT a single consolidated effect on [pinState.pins]
metadata:
  type: project
---

`apps/web/src/features/transactions/NewTransactionSheet.tsx` hydrates the
Account / Envelope / Event pin values into each form's local state. The
correct shape is:

```ts
const accountLockedRef = useRef(false);
const envelopLockedRef = useRef(false);
const eventLockedRef  = useRef(false);

useEffect(() => {
    if (accountLockedRef.current) return;
    const id = pinState.pins?.account?.id;
    if (!id) return;
    accountLockedRef.current = true;
    setSource(id);
}, [pinState.pins?.account?.id]);
// ...same shape for envelop and event.

const handleSourceChange = (v: string) => {
    if (v !== sourceAccountId) accountLockedRef.current = true;
    setSource(v);
};
```

**Why three effects, not one:**

A single `useEffect(() => { ... }, [pinState.pins])` with three gated arms is
strictly less robust. `pinsQuery.data` is a single object reference; when
React Query refetches it can swap the reference even if sub-fields are
unchanged, causing the consolidated effect to re-run for irrelevant reasons.
Separating each field into its own effect with its own focused dep
(`[pinState.pins?.X?.id]`) means each arm only re-runs when its own id
actually changes. Easier to reason about; less coupling between fields.

**Why the `v !== current` guard on the handle* wrappers:**

Defense in depth against any synthetic no-op `onValueChange` (e.g. a
Radix Select round-tripping the same value through its hidden bubble
input). A real user pick changes the value and locks; a no-op dispatch
matches the current state and does NOT lock, leaving the pin-hydration
effect free to run on the next render.

**Lesson learned (don't repeat):**

A previous fix attempt diagnosed the bug as "Radix SelectBubbleInput
synthetic onValueChange on mount" and added only the `v !== current`
guard. That diagnosis was **wrong**: in controlled mode (which EventSelect
always is, because OrbitSelect passes `"__none"` for empty event),
`useControllableState`'s setValue compares `value2 !== prop` and bails
without calling `onValueChange`. Also `usePrevious(value)` returns the
same value as `value` on first render (the ref is initialized to
`{value, previous: value}`), so the bubble's `prevValue !== value` guard
is false on first mount and no synthetic change is dispatched at all.

The real win in the working fix is the per-field useEffect with focused
deps — that pattern is robust regardless of which specific race or
ordering quirk was at play in any given session.

Related: [[event-list-status-filter]] (separate event-pickers bug).
