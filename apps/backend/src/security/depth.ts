import depthLimit from 'graphql-depth-limit';
import type { ValidationRule } from 'graphql';

// `graphql-cost-analysis@1.0.3` was REMOVED 2026-05-08 — fundamental bug:
// the validation-phase cost computation calls getArgumentValues() which
// throws "$var was not provided a runtime value" for ANY query with
// variables. Apollo Client always sends variables. Result: 400 on every
// real client request. The package is unmaintained (last commit 2019),
// so we drop it entirely and keep depth limit as the primary DoS guard.
//
// Future replacement: @escape.tech/graphql-armor (maintained, Apollo plugin
// shape supports cost analysis correctly via instrumentation, not validation).
//
// Phase 3 hardening originally bundled cost cap (1000); re-add via
// graphql-armor in a follow-up commit. Tracked in Phase X queue.

export const validationRules: ValidationRule[] = [
  depthLimit(8, { ignore: ['__schema', '__type'] }),
];
