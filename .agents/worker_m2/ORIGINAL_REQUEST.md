## 2026-06-14T20:54:49-04:00
Implement M2: Reminders Tab Integration in the savant-olympus admin migration project.
Read /Users/home/code/project-x/savant-olympus/.agents/orchestrator/PROJECT.md, plan.md, context.md, and the explorer's report at /Users/home/code/project-x/savant-olympus/.agents/explorer_m1/analysis.md.

Tasks for M2:
1. Modify `src/renderer/components/LeftSidebar.tsx` to add a new nav tab item:
   - Import `Bell` from `lucide-react`.
   - Add `{ id: "Reminders", label: "Reminders", icon: <Bell size={16} /> }` to `TAB_ITEMS`.
2. Modify `src/renderer/App.tsx` to add `Reminders` tab rendering:
   - Import `RemindersView` from `./components/tabs/RemindersView`.
   - Map `activeTab === "Reminders"` to render `<RemindersView serverUrl={serverUrl} apiKey={apiKey} />`.
3. Create `src/renderer/components/tabs/RemindersView.tsx`:
   - View must fetch reminders from `${serverUrl}/api/reminders` on load (with authorization header `X-API-Key: apiKey`).
   - Use the pre-installed custom calendar wrapper `<Calendar />` from `src/renderer/components/ui/calendar.tsx` (which wraps `react-day-picker` and uses standard classes).
   - Display a list of reminders.
   - Filter reminders by status (Pending, All, Done, Dismissed) using a select dropdown or buttons.
   - Highlight the due dates on the calendar: for any reminder whose status is 'pending', indicate the due date on the calendar. (Hint: you can pass `modifiers={{ hasReminder: reminderDueDates }}` and custom modifier styles, or use `modifiers={{ highlighted: dueDates }}`. Check how `<Calendar />` receives custom modifiers, or simply highlight selected/active days or represent reminders using styled indicators).
   - The UI styling must match the Olympus style guide (dark futuristic glassmorphic panel style: bg-1/bg-2/bg-3 backgrounds, borders, Orbitron header titles, Rajdhani monospace body fonts, variables for status colors, and hover micro-animations).
4. Run npm test to verify the workspace compiles.

MANDATORY INTEGRITY WARNING:
> DO NOT CHEAT. All implementations must be genuine. DO NOT
> hardcode test results, create dummy/facade implementations, or
> circumvent the intended task. A Forensic Auditor will independently
> verify your work. Integrity violations WILL be detected and your
> work WILL be rejected.

Write your handoff report to `/Users/home/code/project-x/savant-olympus/.agents/worker_m2/handoff.md`. Include verification instructions, build/test command used, and output results.
Your working directory is `/Users/home/code/project-x/savant-olympus/.agents/worker_m2`.
Your identity is worker_m2.
