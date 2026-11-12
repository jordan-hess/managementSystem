import { Construction } from 'lucide-react'

export interface EmptyConsoleContentProps {
  label: string
}

export default function EmptyConsoleContent({ label }: EmptyConsoleContentProps) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center p-6">
      <div className="bg-gray-100 dark:bg-gray-800 rounded-full p-4 mb-4">
        <Construction className="w-6 h-6 text-gray-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label} console</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Coming soon</p>
    </div>
  )
}
