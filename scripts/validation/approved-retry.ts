import {
  importApprovedRetry,
  verifyApprovedRetry,
} from '../../evaluation/support/approved-retry.ts'

const args = process.argv.slice(2).filter((a) => a !== '--')
if (
  !(
    args.length === 0 ||
    (args.length === 1 && args[0] === '--verify') ||
    (args.length === 2 && args[0] === '--out' && args[1] && !args[1].startsWith('--'))
  )
)
  throw Error('Usage: pnpm fixture:approved-retry [--verify | --out <new directory>]')
if (args[0] === '--verify') {
  const source = await verifyApprovedRetry()
  console.log(
    JSON.stringify({
      verified: true,
      proposalId: source.proposalId,
      files: source.files.size,
      ruleConfigSha256: source.ruleConfigSha256,
      paidModelRequests: 0,
    }),
  )
} else {
  console.log(
    JSON.stringify({
      ...(await importApprovedRetry(args[1] ?? 'data/fixtures/approved-retry')),
      approvalActionPerformed: false,
      paidModelRequests: 0,
    }),
  )
}
