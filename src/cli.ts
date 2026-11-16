#!/usr/bin/env bun
import { Command } from 'commander'
import { registerApprove } from './commands/approve.ts'
import { registerCapture } from './commands/capture.ts'
import { registerCritique } from './commands/critique.ts'
import { registerDiff } from './commands/diff.ts'
import { registerDoctor } from './commands/doctor.ts'
import { registerImport } from './commands/import.ts'
import { registerInit } from './commands/init.ts'
import { registerLint } from './commands/lint.ts'
import { registerMcp } from './commands/mcp.ts'
import { registerPlan } from './commands/plan.ts'
import { registerPrune } from './commands/prune.ts'
import { registerReport } from './commands/report.ts'
import { registerReview } from './commands/review.ts'
import { registerStatus } from './commands/status.ts'

const program = new Command('spine')
  .description('Design gate for Next.js repos')
  .version('0.3.0')
  // Usage errors exit 2 so they never look like doctor's exit 1 (unfinished coverage).
  .exitOverride((err) => process.exit(err.exitCode === 0 ? 0 : 2))

registerInit(program)
registerReport(program)
registerDoctor(program)
registerPlan(program)
registerCapture(program)
registerReview(program)
registerCritique(program)
registerApprove(program)
registerDiff(program)
registerImport(program)
registerPrune(program)
registerLint(program)
registerStatus(program)
registerMcp(program)

await program.parseAsync(process.argv)
