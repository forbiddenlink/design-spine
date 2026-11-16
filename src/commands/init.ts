import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Command } from 'commander'
import { detectStartCommand } from '../lib/init.ts'
import { captureAction } from './capture.ts'
import { doctorAction } from './doctor.ts'
import { planAction } from './plan.ts'
import { guard, root } from './shared.ts'

const MANIFEST = 'design-spine.json'

function startFromPackageJson(): string | undefined {
  const file = join(root, 'package.json')
  if (!existsSync(file)) return undefined
  let scripts: Record<string, unknown> | undefined
  try {
    scripts = JSON.parse(readFileSync(file, 'utf8'))?.scripts
  } catch {
    return undefined
  }
  return detectStartCommand(scripts, readdirSync(root))
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Guided first run: plan, doctor, then capture, and say how to start review')
    .option(
      '--start <command>',
      'start the app with this command (default: detected from package.json)',
    )
    .option('--base <url>', 'use an app that is already running; do not start one')
    .option('--no-capture', 'stop after doctor')
    .action(
      guard(async (o: { start?: string; base?: string; capture: boolean }) => {
        const steps: string[] = []
        if (existsSync(resolve(root, MANIFEST))) {
          console.log(`${MANIFEST} exists, kept as is. Skipping plan.`)
          steps.push(`plan: ${MANIFEST} exists, kept as is`)
        } else {
          await planAction({ out: MANIFEST, limit: '200', base: o.base })
          steps.push(`plan: wrote ${MANIFEST}`)
        }
        console.log('')
        if (!doctorAction({ manifest: MANIFEST })) {
          console.error(
            `\nspine init stopped at doctor. Fix the items above in ${MANIFEST}, then run \`spine init\` again.`,
          )
          process.exit(1)
        }
        steps.push('doctor: manifest is valid and every state is capturable')

        const start = o.base ? undefined : (o.start ?? startFromPackageJson())
        const capture = start
          ? `spine capture --start "${start}"`
          : `spine capture --base ${o.base ?? 'http://localhost:3000'}`
        if (!o.capture) {
          steps.push('capture: skipped (--no-capture)')
        } else if (!o.base && !start) {
          throw new Error(
            'No dev or start script in package.json. Pass --start "<command>" or --base <url> of a running app.',
          )
        } else {
          console.log(`\nCapturing ${start ? `with \`${start}\`` : `from ${o.base}`}...`)
          await captureAction({
            manifest: MANIFEST,
            base: o.base,
            start,
            concurrency: '4',
            startTimeout: '120',
          })
          steps.push('capture: screenshots written to .design-spine/latest')
        }
        console.log('\nspine init')
        for (const [i, step] of steps.entries()) console.log(`  ${i + 1}. ${step}`)
        console.log(
          `\nNext: ${o.capture ? 'spine review   (opens http://localhost:4747)' : capture}`,
        )
      }),
    )
}
