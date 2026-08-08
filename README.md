# Tarmac

Tarmac generates fictional FAA-style airport diagrams from a string seed. The airport
model and SVG renderer are deterministic, pure TypeScript; the browser is only a thin
view and export shell.

```sh
bun install
bun run dev
```

Open the local URL, edit the seed, or choose a traffic role. The seed is stored in the
URL hash, so every chart is linkable. SVG and 2× PNG exports are available in the top
bar.

To render without a browser:

```sh
bun run render VECTOR-NORTH-17 output.svg
```

Verification:

```sh
bun test
bun run build
```

The governing generation and drawing rules live in [`docs/spec.md`](docs/spec.md).
