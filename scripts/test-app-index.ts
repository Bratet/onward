import { reconcile } from '../src/lib/appIndex'
import { missingFolder } from '../src/lib/statuses'
import type { TrackerRow } from '../src/lib/tracker'

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const json = (value: unknown) => JSON.stringify(value)

const row = (id: number, date: string, company: string, status = 'Applied'): TrackerRow =>
  ({ id, date, company, role: 'Engineer', score: 'N/A', status, pdf: '', report: '', notes: '' })

console.log('app index')

const exact = reconcile([row(1, '2026-06-18', 'Northwind')], ['northwind-2026-06-18'])
check('same name and date links exactly', json(exact) === json([{ id: 1, folder: 'northwind-2026-06-18', confidence: 'exact' }]), json(exact))

const prefix = reconcile([row(2, '2026-08-06', 'Contoso Labs')], ['contoso-2026-08-06'])
check('a longer display name links by prefix', prefix[0]?.confidence === 'date+prefix' && prefix[0].folder === 'contoso-2026-08-06', json(prefix))

check('a shared date alone never links', reconcile([row(3, '2026-06-14', 'Tailspin')], ['wingtip-2026-06-14']).length === 0)
check('a matching name on another date does not link', reconcile([row(4, '2026-06-14', 'Tailspin')], ['tailspin-2026-07-01']).length === 0)

const ambiguous = reconcile([row(5, '2026-05-01', 'Acme')], ['acme-labs-2026-05-01', 'acme-cloud-2026-05-01'])
check('two prefix candidates on one day are left alone', ambiguous.length === 0, json(ambiguous))

const one = reconcile([row(6, '2026-05-02', 'Acme'), row(7, '2026-05-02', 'Acme')], ['acme-2026-05-02'])
check('a folder is claimed by one row only', one.length === 1, json(one))

const folder = { folder: 'northwind-2026-06-18' }
check('an applied row with no folder is missing one', missingFolder({ row: row(8, '2026-06-01', 'A'), folder: null }))
check('a skipped row with no folder is expected', !missingFolder({ row: row(9, '2026-06-01', 'A', 'SKIP'), folder: null }))
check('a preparing row with no folder is missing one', missingFolder({ row: row(11, '2026-06-01', 'A', 'Preparing'), folder: null }))
check('a linked row is never missing a folder', !missingFolder({ row: row(12, '2026-06-01', 'A'), folder }))
check('a folder with no row is not a missing folder', !missingFolder({ row: null, folder }))

if (failures) {
  console.log(`\n${failures} app index check(s) failed`)
  process.exit(1)
}
console.log('all app index checks passed')
