import { generate, render } from "../src/engine";

const [seed = "TARMAC", output = `${seed}.svg`] = Bun.argv.slice(2);
const svg = render(generate(seed));
await Bun.write(output, svg);
console.log(`Rendered ${seed} → ${output}`);
