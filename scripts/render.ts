import { generate, render, type Role } from "../src/engine";

const args = Bun.argv.slice(2);
const roleFlag = args.findIndex((a) => a === "--role");
const role = roleFlag >= 0 ? (args.splice(roleFlag, 2)[1] as Role) : undefined;
const [seed = "TARMAC", output = `${seed}.svg`] = args;
const svg = render(generate(seed, role ? { role } : {}));
await Bun.write(output, svg);
console.log(`Rendered ${seed}${role ? ` (${role})` : ""} → ${output}`);
