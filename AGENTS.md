# Agent instructions

## Planning

- For every task in this project, call `update_plan` before starting task work, including small or routine tasks.
- Write a short plan with concrete steps that describe the intended investigation or changes.
- Keep the plan current as work progresses: mark completed steps, revise steps when the approach changes, and add newly discovered required work.
- Before finishing, mark all completed steps complete. If a step cannot be completed, leave it accurately represented and explain the blocker to the user.

## Original runtime investigations

- Read `research/oracle.md`, including its `C:\temp` staging and permissions section, before an oracle run. Use a fresh output directory and only one original oracle at a time.
- Do not change the machine's system clock.
- For native function mapping and caller capture, use `research/native-analysis-workflow.md`; rediscover and validate addresses before attaching a debugger.
