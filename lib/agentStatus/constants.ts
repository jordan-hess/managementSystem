export type AgentStatusValue = 'active' | 'break' | 'meeting' | 'inactive'

export const AGENT_STATUS_OPTIONS: { value: AgentStatusValue; label: string; dotClass: string }[] = [
  { value: 'active', label: 'Active', dotClass: 'bg-green-500' },
  { value: 'break', label: 'On Break', dotClass: 'bg-orange-500' },
  { value: 'meeting', label: 'In a Meeting', dotClass: 'bg-purple-500' },
  // Self-settable (leaving work) as well as auto-set once the agent's
  // rostered shift for today has ended (see applyShiftEndAutoInactive in
  // actions.ts) — never auto-cleared, only a manual pick of another option
  // reverses it.
  { value: 'inactive', label: 'Inactive', dotClass: 'bg-gray-400' },
]
