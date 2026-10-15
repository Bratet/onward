import { runCli } from '../src/lib/cli'

/** Entry point for `npm run co -- <command>`; see `npm run co -- help`. */
process.exitCode = await runCli(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
})
