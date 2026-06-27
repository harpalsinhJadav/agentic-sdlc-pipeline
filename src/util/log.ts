import chalk from "chalk";

/** Minimal structured logger so each agent's output is visually distinct. */
export const log = {
  banner(text: string) {
    console.log("\n" + chalk.bold.bgBlue.white(` ${text} `));
  },
  agent(name: string, msg: string) {
    console.log(chalk.cyan(`  ⟐ [${name}] `) + msg);
  },
  step(msg: string) {
    console.log(chalk.gray(`    · ${msg}`));
  },
  ok(msg: string) {
    console.log(chalk.green(`  ✓ ${msg}`));
  },
  warn(msg: string) {
    console.log(chalk.yellow(`  ! ${msg}`));
  },
  fail(msg: string) {
    console.log(chalk.red(`  ✗ ${msg}`));
  },
  dim(msg: string) {
    console.log(chalk.gray(msg));
  },
};
