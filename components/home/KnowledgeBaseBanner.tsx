export default function KnowledgeBaseBanner() {
  return (
    <a
      href="#"
      target="_blank"
      rel="noopener noreferrer"
      className="group relative w-full shrink-0 flex items-center justify-center rounded-xl overflow-hidden border border-white/10 shadow-sm hover:shadow-md transition-shadow py-5 bg-cover bg-center animate-hero-in [animation-delay:260ms] motion-reduce:animate-none"
      style={{ backgroundImage: "url('/homebg.jpg')" }}
    >
      {/* Fixed dark scrim, not theme-adaptive — this banner always sits on
          homebg.jpg, so its content stays legible regardless of the page
          theme (same reasoning as AgentKudosWall's testimonial text). */}
      <div className="absolute inset-0 bg-black/35 group-hover:bg-black/25 transition-colors" />
      <p className="relative text-3xl xl:text-4xl font-extrabold tracking-tight lowercase">
        <span className="inline-block text-blue-500 transition-transform duration-300 group-hover:-translate-x-1">knowledge</span>
        <span className="inline-block text-gray-300 transition-transform duration-300 group-hover:translate-x-1">base</span>
      </p>
    </a>
  )
}
