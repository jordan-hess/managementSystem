'use client'

import Modal from './Modal'

interface PatchNote {
  version: string
  date: string
  changes: string[]
}

const PATCH_NOTES: PatchNote[] = [
  {
    version: 'v0.5.0',
    date: '2026-10-26',
    changes: [
      'Admins and team leaders can create tickets, callbacks and follow-ups for themselves, so assigning an agent is now optional',
      'Callbacks can be scheduled from contact details alone, without an existing customer record',
      'Customer search no longer shows the full customer list as a dropdown',
      'Follow-ups, callbacks and escalations now show pop-ups on every page',
      'Callback reminders go to whoever is on shift',
      'LeadOps Daily & Weekly Activity, Time & Motion and Performance Reviews now save real data. Unsaved entries are kept on your device if a save fails',
      'Roster grid is grouped by department and team, with a multi-select team filter and a QA roster',
      'Announcements show a red dot when unread and have expandable cards',
      'Forms show errors under each field, and phone fields accept numbers only',
      'When editing a ticket, the customer can no longer be changed, and the Priority and Due Date fields were removed',
      'Show/hide toggle on the login password field',
      'Home page quote of the day',
    ],
  },
  {
    version: 'v0.4.0',
    date: '2026-10-02',
    changes: [
      'Tickets page redesigned, with customer search and new escalation options',
      'Dashboards now track tickets worked per day, not just completed',
      'QA scoring and coaching workflow improvements',
      'Early rollout of a new leadership reporting workspace',
    ],
  },
]

interface PatchNotesModalProps {
  open: boolean
  onClose: () => void
}

export default function PatchNotesModal({ open, onClose }: PatchNotesModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Patch Notes">
      <div className="space-y-6">
        {PATCH_NOTES.map(note => (
          <div key={note.version}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{note.version}</h3>
              <span className="text-xs text-gray-400 dark:text-gray-500">{note.date}</span>
            </div>
            <ul className="list-disc list-inside space-y-1">
              {note.changes.map((change, i) => (
                <li key={i} className="text-sm text-gray-600 dark:text-gray-400">{change}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  )
}
