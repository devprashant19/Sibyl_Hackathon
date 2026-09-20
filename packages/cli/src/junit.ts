import type { Session } from '@sibyl/shared';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // XML 1.0 forbids most control characters, and error messages can contain them.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/**
 * JUnit XML for CI systems: one testcase per run. A FAILED or INTERMITTENT run is a <failure>
 * listing the promises it broke; an ERRORED run is an <error>. Session-scoped promises get their
 * own testcases.
 */
export function toJUnit(session: Session): string {
  const cases: string[] = [];
  let failures = 0;
  let errors = 0;

  for (const run of session.runs) {
    const name = `run ${run.runId.slice(0, 8)} (seed ${run.seed})`;
    const time = ((run.durationMs ?? 0) / 1000).toFixed(3);
    let body = '';
    if (run.status === 'ERRORED') {
      errors++;
      body = `<error message="${escape(run.error ?? 'run errored')}"/>`;
    } else if (!run.passed) {
      failures++;
      const broken = run.promiseResults.filter(p => !p.passed);
      const detail = broken.map(p => `${p.promiseId}${p.message ? `: ${p.message}` : ''}`).join('\n');
      const label = run.status === 'INTERMITTENT' ? 'intermittent failure' : 'promise failed';
      body = `<failure message="${escape(`${label}: ${broken.map(p => p.promiseId).join(', ')}`)}">${escape(`${detail}\n\nReplay: sibyl replay ${run.runId}`)}</failure>`;
    }
    cases.push(`    <testcase classname="${escape(session.project)}" name="${escape(name)}" time="${time}">${body}</testcase>`);
  }

  for (const result of session.sessionPromiseResults ?? []) {
    let body = '';
    if (!result.passed) {
      failures++;
      body = `<failure message="${escape(result.message ?? 'session promise failed')}"/>`;
    }
    cases.push(`    <testcase classname="${escape(session.project)}.session" name="${escape(result.promiseId)}">${body}</testcase>`);
  }

  const seconds = ((session.completedAt - session.startedAt) / 1000).toFixed(3);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="sibyl" tests="${cases.length}" failures="${failures}" errors="${errors}" time="${seconds}">`,
    `  <testsuite name="${escape(session.project)}" tests="${cases.length}" failures="${failures}" errors="${errors}" time="${seconds}" timestamp="${new Date(session.startedAt).toISOString()}">`,
    `    <properties><property name="seed" value="${escape(session.seed)}"/><property name="strategy" value="${escape(session.strategy)}"/></properties>`,
    ...cases,
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}
