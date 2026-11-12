import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import Header from '@/components/layout/Header'
import AnnouncementsToggle from '@/components/home/AnnouncementsToggle'
import AgentKudosWall from '@/components/home/AgentKudosWall'
import BentoGrid from '@/components/home/BentoGrid'
import Greeting from '@/components/home/Greeting'
import WordOfTheDay from '@/components/home/WordOfTheDay'
import SocialLinksMarquee from '@/components/home/SocialLinksMarquee'
import KnowledgeBaseBanner from '@/components/home/KnowledgeBaseBanner'
import T2CompletedWorkConsole from '@/components/home/T2CompletedWorkConsole'
import { getTicketEventsWorkedDays } from '@/lib/reports/ticketsWorkedByAgent'
import { getGreetingPeriod } from '@/lib/home/greeting'
import { getQuoteOfTheDay } from '@/lib/quotes'
import { AgentKudos, ManagementPost, Profile } from '@/types'

export default async function HomePage() {
  const userId = await getCurrentUserId()

  const profileRows = await sql<(Pick<Profile, 'id' | 'full_name' | 'role'> & { t2_team: string | null })[]>`
    SELECT id, full_name, role, t2_team FROM profiles WHERE id = ${userId!}
  `
  const profile = profileRows[0]

  const canPost = profile?.role === 'management' || profile?.role === 'admin' || profile?.role === 'hod'
  // T2 Queue Hub merge: a migrated-from-T2 agent (t2_team set) has no
  // access to followups/callbacks/support_tickets at all (see proxy.ts's
  // isRestrictedT2Agent) — "Completed by You" shows their ticket queues
  // instead of those CMS-specific channels. (CMS-agent "Completed by You"
  // now lives on /dashboard instead — T2 agents can't reach that route, per
  // proxy.ts's T2_AGENT_ALLOWED_PREFIXES, so theirs stays here for now.)
  const isT2Agent = profile?.role === 'agent' && !!profile?.t2_team

  const [posts, kudos, agents, myT2Tickets, ticketsWorkedDays] =
    await Promise.all([
      sql<ManagementPost[]>`
        SELECT p.*,
          jsonb_build_object('id', a.id, 'full_name', COALESCE(a.full_name, 'Deleted user')) AS author,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', r.id, 'post_id', r.post_id, 'profile_id', r.profile_id, 'emoji', r.emoji, 'created_at', r.created_at,
              'profiles', jsonb_build_object('full_name', rp.full_name)
            ))
            FROM management_post_reactions r JOIN profiles rp ON rp.id = r.profile_id
            WHERE r.post_id = p.id
          ), '[]'::jsonb) AS management_post_reactions
        FROM management_posts p
        LEFT JOIN profiles a ON a.id = p.author_id
        ORDER BY p.created_at DESC LIMIT 20
      `,
      sql<AgentKudos[]>`
        SELECT k.*, jsonb_build_object('id', a.id, 'full_name', a.full_name) AS agent
        FROM agent_kudos k JOIN profiles a ON a.id = k.agent_id
        ORDER BY k.created_at DESC LIMIT 20
      `,
      canPost
        ? sql<Pick<Profile, 'id' | 'full_name'>[]>`SELECT id, full_name FROM profiles WHERE role = 'agent' AND is_active = true ORDER BY full_name`
        : Promise.resolve([] as Pick<Profile, 'id' | 'full_name'>[]),
      isT2Agent
        ? sql<{ queue: string; resolved_at: string | null }[]>`
            SELECT queue, resolved_at FROM tickets
            WHERE (created_by = ${userId!} OR assigned_to = ${userId!}) AND resolved_at IS NOT NULL`
        : Promise.resolve([]),
      isT2Agent
        ? getTicketEventsWorkedDays(userId!)
        : Promise.resolve([] as string[]),
    ])

  const quote = getQuoteOfTheDay()
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || null
  const period = getGreetingPeriod()

  return (
    <div
      className="flex-1 flex flex-col
        bg-cover bg-center bg-no-repeat
        bg-[url('/hompagebg.jpg')]
        dark:bg-[linear-gradient(180deg,rgba(3,7,18,0.8),rgba(3,7,18,0.5)_45%,rgba(3,7,18,0.85)),url('/hompagebg.jpg')]"
    >
      <div className="shrink-0">
        <Header
          title=""
          userId={userId!}
          userRole={profile?.role}
          extraAction={<AnnouncementsToggle posts={posts} userId={userId!} canPost={canPost} />}
        />
      </div>

      {/* No min-h-0/overflow-hidden anywhere in this chain (down to Row1
          below) — `flex-1` still stretches everything to fill the viewport
          exactly when there's room (a `flex` item's default `min-height:
          auto` only sets a content-based FLOOR, it doesn't stop growing).
          The one thing it now refuses to do is shrink below that floor: if
          the real content (mostly KnowledgeBaseBanner's and the socials rail's
          text/icons, which don't have a squishable "smaller" rendering)
          needs more room than the viewport has, this wrapper's natural
          height wins, and `<main>`'s own overflow-y-auto (app/(app)/layout.tsx)
          scrolls it — instead of the previous lg:overflow-hidden silently
          clipping whatever didn't fit. */}
      <div className="flex-1 flex flex-col gap-4 px-6 lg:px-16 pb-4 lg:-mt-10">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.1fr)] auto-rows-fr gap-6 xl:gap-10">
          {/* Left column keeps its own dedicated internal scroll (min-h-0 +
              overflow-y-auto) as the first line of defense — its content
              (greeting/word-of-day/kudos/T2 console) is the most likely to
              grow long, and scrolling just this column is a nicer
              degradation than immediately falling back to a full-page
              scroll. */}
          <div className="min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex flex-col">
            <div className="m-auto w-full flex flex-col gap-5">
              <Greeting firstName={firstName} period={period} />
              <WordOfTheDay text={quote.text} author={quote.author} />
              <div className="h-px w-10 bg-white/20" />
              <AgentKudosWall kudos={kudos || []} userId={userId!} canPost={canPost} agents={agents || []} />
              {isT2Agent && <T2CompletedWorkConsole tickets={myT2Tickets || []} ticketsWorkedDays={ticketsWorkedDays || []} />}
            </div>
          </div>

          {/* The 2xl width-cap/right-align lives on this INNER div, not the
              grid item above it — putting max-w + a non-stretch justify-self
              directly on a grid item sharing an `fr` track (confirmed via
              direct measurement) collapses that track to a tiny fraction of
              its actual share, regardless of viewport width. The outer div
              stays a plain default (stretch) grid item so `1.1fr` sizing
              works correctly; this child just caps/right-aligns within it. */}
          <div>
            <div className="h-full flex flex-col gap-3 2xl:max-w-[44rem] 2xl:ml-auto">
              {/* BentoGrid is the one section that's purely visual (image
                  tiles, no text content with a real minimum size) — this
                  wrapper keeps its own min-h-0 so BentoGrid gracefully
                  compresses below its max-h-[36rem] cap on a short viewport
                  instead of contributing to the page's natural-overflow
                  floor the way KnowledgeBaseBanner's text below it does. */}
              <div className="flex-1 min-h-0 flex items-center animate-fade-in motion-reduce:animate-none">
                <BentoGrid />
              </div>
              <KnowledgeBaseBanner />
            </div>
          </div>
        </div>

        <div className="shrink-0 animate-hero-in [animation-delay:400ms] motion-reduce:animate-none">
          <SocialLinksMarquee />
        </div>
      </div>
    </div>
  )
}
