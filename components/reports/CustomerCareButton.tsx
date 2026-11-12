/** Link out to the external Customer Care tool (Alfred) — sits next to
 *  ExportButton in ReportHeader. Not a Server Action, just a plain external
 *  link, so this can be a server component like ReportHeader itself. */
export default function CustomerCareButton() {
  return (
    <a
      href="#"
      target="_blank"
      rel="noopener noreferrer"
      title="Open Customer Care"
      className="inline-flex items-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-blue-600 dark:text-blue-500 text-sm font-bold px-5 py-2.5 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      customer care
    </a>
  )
}
