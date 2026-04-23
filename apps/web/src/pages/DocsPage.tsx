import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    BookOpen,
    Wallet,
    Mail,
    Target,
    FolderTree,
    ArrowLeftRight,
    CalendarDays,
    BarChart3,
    Users,
    Shield,
    Clock,
    Sparkles,
    HelpCircle,
    ChevronRight,
    Paperclip,
    UserCircle,
    LineChart,
    Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DEMO_URL } from "@/config/isDemo";
import { ROUTES } from "@/router/routes";
import { cn } from "@/lib/utils";
import { useStore } from "@/stores/useStore";
import { observer } from "mobx-react-lite";

/**
 * Public product documentation. Accessible without login so prospective
 * users can read about Orbit before signing up. The single-page design +
 * sticky table of contents keeps the surface small — if this grows past
 * ~10 screens, split into /docs/:section routes.
 *
 * Screenshots are placeholders for now. Drop a .png/.webp in
 * `public/docs/<id>.png` and replace the `<ScreenshotPlaceholder />` with
 * `<Screenshot src="/docs/<id>.png" />` at the matching slot.
 */

interface Section {
    id: string;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: Section[] = [
    { id: "live-demo", title: "Live demo (read-only)", icon: Eye },
    { id: "overview", title: "What is Orbit?", icon: Sparkles },
    { id: "concepts", title: "Core concepts", icon: BookOpen },
    { id: "getting-started", title: "Getting started", icon: ArrowRight },
    { id: "spaces", title: "Spaces & collaboration", icon: Users },
    { id: "accounts", title: "Accounts", icon: Wallet },
    { id: "envelopes", title: "Envelopes", icon: Mail },
    { id: "plans", title: "Plans", icon: Target },
    { id: "categories", title: "Categories", icon: FolderTree },
    { id: "transactions", title: "Transactions", icon: ArrowLeftRight },
    { id: "events", title: "Events", icon: CalendarDays },
    { id: "attachments", title: "Attachments & receipts", icon: Paperclip },
    { id: "allocations", title: "Allocations (the 2D idea)", icon: Sparkles },
    { id: "drift", title: "Drift & rebalancing", icon: Shield },
    { id: "analytics", title: "Analytics", icon: BarChart3 },
    { id: "my-money", title: "Your money across spaces", icon: LineChart },
    { id: "permissions", title: "Roles & permissions", icon: Shield },
    { id: "profile", title: "Your profile", icon: UserCircle },
    { id: "timezone", title: "Time & timezone", icon: Clock },
    { id: "faq", title: "FAQ", icon: HelpCircle },
];

const DocsPage = observer(function DocsPage() {
    const { authStore } = useStore();
    const [active, setActive] = useState<string>(SECTIONS[0].id);

    // Track which section is visible in the viewport so the TOC can
    // highlight the current one. IntersectionObserver with a rootMargin
    // that prefers the top of the viewport.
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) setActive(visible[0].target.id);
            },
            { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
        );
        for (const s of SECTIONS) {
            const el = document.getElementById(s.id);
            if (el) observer.observe(el);
        }
        return () => observer.disconnect();
    }, []);

    const isAuthed = authStore.isAuthenticated;

    return (
        <div className="relative min-h-screen">
            {/* Ambient gradients — same vibe as AuthLayout so the docs feel
                like part of the product even though they're public. */}
            <div
                aria-hidden
                className="pointer-events-none absolute -top-40 right-[-10rem] size-[520px] rounded-full blur-3xl"
                style={{
                    background: "radial-gradient(closest-side, var(--primary), transparent 70%)",
                    opacity: 0.2,
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute -bottom-40 left-[-10rem] size-[520px] rounded-full blur-3xl"
                style={{
                    background: "radial-gradient(closest-side, var(--accent), transparent 70%)",
                    opacity: 0.18,
                }}
            />

            <TopBar isAuthed={isAuthed} />

            <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-16">
                {/* TOC — sticky on lg+, collapses into inline list on mobile */}
                <aside className="hidden lg:block">
                    <nav className="sticky top-24 grid gap-0.5">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            On this page
                        </p>
                        {SECTIONS.map((s) => (
                            <a
                                key={s.id}
                                href={`#${s.id}`}
                                className={cn(
                                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                                    active === s.id
                                        ? "bg-accent text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <s.icon className="size-3.5 shrink-0" />
                                <span className="truncate">{s.title}</span>
                            </a>
                        ))}
                    </nav>
                </aside>

                <main className="min-w-0">
                    <Hero isAuthed={isAuthed} />

                    <MobileToc />

                    <div className="mt-10 grid gap-14">
                        <LiveDemo />
                        <Overview />
                        <Concepts />
                        <GettingStarted />
                        <Spaces />
                        <Accounts />
                        <Envelopes />
                        <Plans />
                        <Categories />
                        <Transactions />
                        <Events />
                        <Attachments />
                        <Allocations />
                        <Drift />
                        <Analytics />
                        <MyMoney />
                        <Permissions />
                        <Profile />
                        <Timezone />
                        <Faq />
                    </div>

                    <ClosingCta isAuthed={isAuthed} />
                </main>
            </div>
        </div>
    );
});

export default DocsPage;

/* ---------------------------------------------------------------- */
/*  Layout bits                                                     */
/* ---------------------------------------------------------------- */

function TopBar({ isAuthed }: { isAuthed: boolean }) {
    return (
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-md">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
                <Link to="/" className="text-lg font-bold tracking-tight text-gradient-brand">
                    Orbit
                </Link>
                <nav className="flex items-center gap-2 text-sm">
                    <Link
                        to="/docs"
                        className="rounded-md px-2.5 py-1.5 text-foreground"
                    >
                        Docs
                    </Link>
                    {isAuthed ? (
                        <Button asChild size="sm" variant="gradient">
                            <Link to={ROUTES.root}>
                                Open app <ArrowRight />
                            </Link>
                        </Button>
                    ) : (
                        <>
                            <Button asChild size="sm" variant="ghost">
                                <Link to={ROUTES.login}>Log in</Link>
                            </Button>
                            <Button asChild size="sm" variant="gradient">
                                <Link to={ROUTES.signup}>Sign up</Link>
                            </Button>
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
}

function Hero({ isAuthed }: { isAuthed: boolean }) {
    return (
        <section className="grid gap-5 py-4">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="size-3.5" />
                Product guide
            </span>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Everything you need to know <br className="hidden sm:block" />
                about <span className="text-gradient-brand">Orbit</span>
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Orbit is a collaborative personal-finance app for small groups — families,
                couples, roommates, shared projects. It combines <b>ledger accounting</b>,{" "}
                <b>envelope budgeting</b>, and <b>goal-based planning</b> into a single
                coherent ledger. This guide walks through every feature so you can hit the
                ground running.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
                {isAuthed ? (
                    <Button asChild variant="gradient">
                        <Link to={ROUTES.root}>
                            Open my spaces <ArrowRight />
                        </Link>
                    </Button>
                ) : (
                    <>
                        <Button asChild variant="gradient">
                            <Link to={ROUTES.signup}>
                                Create an account <ArrowRight />
                            </Link>
                        </Button>
                        <Button asChild variant="outline">
                            <Link to={ROUTES.login}>I already have one</Link>
                        </Button>
                    </>
                )}
            </div>
        </section>
    );
}

function MobileToc() {
    return (
        <details className="mt-8 rounded-xl border border-border bg-card p-3 lg:hidden">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <BookOpen className="size-4" />
                Jump to a section
                <ChevronRight className="ml-auto size-4 transition-transform [details[open]_&]:rotate-90" />
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {SECTIONS.map((s) => (
                    <a
                        key={s.id}
                        href={`#${s.id}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <s.icon className="size-3.5 shrink-0" />
                        {s.title}
                    </a>
                ))}
            </div>
        </details>
    );
}

/* ---------------------------------------------------------------- */
/*  Sections                                                        */
/* ---------------------------------------------------------------- */

function SectionHeader({
    id,
    title,
    kicker,
    icon: Icon,
}: {
    id: string;
    title: string;
    kicker?: string;
    icon: React.ComponentType<{ className?: string }>;
}) {
    return (
        <div className="grid gap-1.5">
            {kicker && (
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {kicker}
                </span>
            )}
            <h2
                id={id}
                className="flex scroll-mt-24 items-center gap-2.5 text-2xl font-bold sm:text-3xl"
            >
                <Icon className="size-6 text-primary" />
                {title}
            </h2>
        </div>
    );
}

function Paragraph({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[15px] leading-relaxed text-muted-foreground">{children}</p>
    );
}

function Overview() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="overview" title="What is Orbit?" icon={Sparkles} />
            <Paragraph>
                Orbit tracks where your money <i>is</i> (accounts), what it's{" "}
                <i>earmarked for</i> (envelopes &amp; plans), and where it{" "}
                <i>went</i> (transactions). You and everyone you collaborate with see the
                same up-to-the-second view of the household finances — no spreadsheets to
                merge, no "did you pay the internet bill?" in the group chat.
            </Paragraph>
            <ScreenshotPlaceholder
                label="Overview dashboard — balance trend, allocation donut, recent transactions, upcoming events"
            />
            <FeatureGrid
                items={[
                    {
                        icon: Wallet,
                        title: "Ledger accounting",
                        body: "Accounts hold real money. Every transaction moves money between accounts or in/out of the household.",
                    },
                    {
                        icon: Mail,
                        title: "Envelope budgeting",
                        body: "Named buckets (Groceries, Rent, Fuel…) hold a logical allocation of your money. Spending is routed to envelopes via categories.",
                    },
                    {
                        icon: Target,
                        title: "Goal-based planning",
                        body: "Plans hold money earmarked for long-horizon targets — house down-payment, vacation, new laptop.",
                    },
                ]}
            />
        </section>
    );
}

function LiveDemo() {
    return (
        <section className="grid gap-4">
            <SectionHeader
                id="live-demo"
                title="Live demo (read-only)"
                kicker="Try before you sign up"
                icon={Eye}
            />
            <Paragraph>
                A fully seeded sandbox runs at{" "}
                <a
                    href={DEMO_URL}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                >
                    orbit-demo.withtahmid.com
                </a>
                . Every screen renders real data — multiple accounts, envelopes, plans,
                months of transactions, a shared "Janina family" space — so you can
                explore the product end-to-end without creating anything of your own.
            </Paragraph>
            <Paragraph>
                The demo is <b>read-only</b>: log in, click around, open every screen
                and form — nothing you do gets saved. That's by design, so the sandbox
                stays the same for every visitor.
            </Paragraph>

            <Card className="border-primary/30 bg-primary/5">
                <CardContent className="grid gap-3 p-5 sm:p-6">
                    <div className="flex items-center gap-2">
                        <Shield className="size-4 text-primary" />
                        <span className="text-sm font-semibold">Sign-in credentials</span>
                    </div>
                    <dl className="grid gap-2 font-mono text-[13px] sm:grid-cols-[auto_1fr] sm:gap-x-6">
                        <dt className="text-muted-foreground">email</dt>
                        <dd className="select-all">alex@orbit.dev</dd>
                        <dt className="text-muted-foreground">password</dt>
                        <dd className="select-all">password123</dd>
                    </dl>
                    <p className="text-sm text-muted-foreground">
                        Alex is the primary demo user and owns two spaces. To see the app
                        from a collaborator's perspective, log out and sign in as{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-[13px]">
                            sam@orbit.dev
                        </code>
                        ,{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-[13px]">
                            jordan@orbit.dev
                        </code>
                        , or{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-[13px]">
                            taylor@orbit.dev
                        </code>{" "}
                        — same password.
                    </p>
                </CardContent>
            </Card>

            <div>
                <Button asChild variant="gradient">
                    <a href={DEMO_URL}>
                        Open the demo <ArrowRight />
                    </a>
                </Button>
            </div>
        </section>
    );
}

function Concepts() {
    return (
        <section className="grid gap-4">
            <SectionHeader
                id="concepts"
                title="Core concepts, at a glance"
                kicker="The mental model"
                icon={BookOpen}
            />
            <Paragraph>
                Orbit's design priority is <b>correctness → clarity → performance</b>.
                Almost every number you see is computed on-read, so edits to a transaction
                or an allocation propagate instantly — no manual reconciliation.
            </Paragraph>
            <div className="grid gap-3 sm:grid-cols-2">
                <ConceptCard
                    title="Account"
                    body="A place real money lives: bank account, wallet, credit card, locked deposit."
                />
                <ConceptCard
                    title="Space"
                    body="The collaboration boundary. Every space has its own envelopes, plans, categories, events, and members."
                />
                <ConceptCard
                    title="Envelope"
                    body="A named bucket within a space. Holds an allocation of money — doesn't hold the money itself."
                />
                <ConceptCard
                    title="Plan"
                    body="A rolling goal bucket. Like an envelope, but with no period reset — it accumulates over time."
                />
                <ConceptCard
                    title="Category"
                    body="A label on a transaction that routes its spend into an envelope. Can be nested."
                />
                <ConceptCard
                    title="Allocation"
                    body="A signed amount that says 'E has X dollars, optionally earmarked from Account A'."
                />
                <ConceptCard
                    title="Transaction"
                    body="An income, expense, transfer, or adjustment. Moves real money between accounts."
                />
                <ConceptCard
                    title="Event"
                    body="A named grouping (wedding, trip) that you can attach transactions to for after-the-fact analysis."
                />
            </div>
        </section>
    );
}

function GettingStarted() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="getting-started" title="Getting started" icon={ArrowRight} />
            <ol className="grid gap-3">
                <StepCard
                    step={1}
                    title="Create an account"
                    body="Head to Sign up, enter your email, and verify it with the 6-digit code we'll send. Pick a password and you're in."
                />
                <StepCard
                    step={2}
                    title="Create your first space"
                    body="A space is where you and your collaborators share finances. Name it (e.g. 'Family Budget') and you'll be the owner."
                />
                <StepCard
                    step={3}
                    title="Add your accounts"
                    body="Wallet, checking, savings, credit card, fixed deposits — add them all. Mark each as asset, liability, or locked."
                />
                <StepCard
                    step={4}
                    title="Create envelopes & categories"
                    body="Pick a cadence (monthly or none) for each envelope. Create expense categories mapped to those envelopes."
                />
                <StepCard
                    step={5}
                    title="Record a transaction"
                    body="Log an expense, income, or transfer. Watch balances update and the envelope usage bar fill in live."
                />
                <StepCard
                    step={6}
                    title="Invite collaborators"
                    body="From space settings, invite by email and assign owner, editor, or viewer role."
                />
            </ol>
            <ScreenshotPlaceholder label="Signup flow + first space creation" />
        </section>
    );
}

function Spaces() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="spaces" title="Spaces & collaboration" icon={Users} />
            <Paragraph>
                A <b>space</b> is a coherent ledger: transactions, envelopes, plans,
                categories, and events all belong to exactly one space. Accounts are
                different — an account can be shared into many spaces (more on this below).
            </Paragraph>
            <Paragraph>
                Each space has members with roles. Owners have full control, editors can
                record transactions and allocate money but can't change membership, viewers
                are read-only. You can be in as many spaces as you like — use the space
                picker in the header to jump between them.
            </Paragraph>
            <ScreenshotPlaceholder label="Space picker + space settings" />
        </section>
    );
}

function Accounts() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="accounts" title="Accounts" icon={Wallet} />
            <Paragraph>
                Three types: <b>asset</b> (bank, wallet — money you have),{" "}
                <b>liability</b> (credit card, loan — money you owe),{" "}
                <b>locked</b> (FDs, DPS — money you can't spend right now but still counts
                toward net worth). Each account has a color, icon, and balance that's
                maintained automatically by your transactions.
            </Paragraph>
            <CalloutCard title="Cross-space account sharing">
                Got a joint account used by two households? Share it across both spaces.
                Each space sees the same live balance, but transactions and allocations
                remain per-space. Go to the account's detail page → <b>Shared with</b> tab
                to manage.
            </CalloutCard>
            <CalloutCard title="Account members — an ACL of its own">
                Separate from space membership, each account has its own member list
                (<b>owner</b> / <b>viewer</b>). Owners can edit the account, share it into
                other spaces, or delete it; viewers can only see it. Manage from the
                account detail → <b>Members</b> tab. This is what makes "my personal
                wallet shared into the household space, visible to my partner as a
                viewer" possible.
            </CalloutCard>
            <ScreenshotPlaceholder label="Account detail tabs: Allocations · Transactions · Shared with · Members · Settings" />
            <Paragraph>
                The top-level <Link to={ROUTES.myAccounts} className="text-primary underline">
                    My Accounts
                </Link>{" "}
                page shows every account you can access across every space you're in,
                grouped by asset / liability / locked with links straight into each
                space's detail view.
            </Paragraph>
        </section>
    );
}

function Envelopes() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="envelopes" title="Envelopes" icon={Mail} />
            <Paragraph>
                Envelopes are named budget buckets. Pick a cadence — <b>monthly</b> resets
                on the 1st of each month, <b>none</b> stays open-ended. Allocate money into
                them from your space's unallocated pool; as you spend money against
                categories that roll up to an envelope, its remaining balance drops.
            </Paragraph>
            <CalloutCard title="Carry-over">
                Enabled per-envelope. When on, any unspent remainder from last period is
                added to this period's <i>carriedIn</i>. Overspend does <b>not</b> carry
                forward as debt — drift is surfaced as a UI state, not an accounting one.
            </CalloutCard>
            <ScreenshotPlaceholder label="Envelopes page — cards showing utilization, cadence, remaining" />
        </section>
    );
}

function Plans() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="plans" title="Plans" icon={Target} />
            <Paragraph>
                Plans are long-horizon goals. They have no cadence — allocations simply
                accumulate. Optionally set a target amount and target date; Orbit will
                show progress and days-remaining. To spend plan money, first transfer the
                allocation from the plan to an envelope, then record a regular expense.
            </Paragraph>
            <ScreenshotPlaceholder label="Plans page — progress bars, target date countdown" />
        </section>
    );
}

function Categories() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="categories" title="Categories" icon={FolderTree} />
            <Paragraph>
                Categories are hierarchical labels that route expense transactions to
                envelopes. Every category belongs to exactly one envelope, and all
                categories in a subtree share the same envelope — so when you pick{" "}
                "Restaurants &rarr; Sushi" the whole chain maps cleanly to "Food".
            </Paragraph>
            <Paragraph>
                You can move a category to a different parent (change its place in the
                tree) or to a different envelope (changes the whole subtree). Both
                actions are non-destructive — historical transactions keep their category
                reference.
            </Paragraph>
            <ScreenshotPlaceholder label="Categories tree with edit / move-parent / move-envelope actions" />
        </section>
    );
}

function Transactions() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="transactions" title="Transactions" icon={ArrowLeftRight} />
            <Paragraph>Four types — each with its own rules:</Paragraph>
            <div className="grid gap-3 sm:grid-cols-2">
                <TxTypeCard
                    type="Income"
                    body="Money entering a destination account from outside the system. Salary, refunds, gifts."
                />
                <TxTypeCard
                    type="Expense"
                    body="Money leaving a source account to outside the system. Requires a category, which routes the spend to an envelope."
                />
                <TxTypeCard
                    type="Transfer"
                    body="Money moving between two of your accounts. Net zero to the household, but moves balance between accounts."
                />
                <TxTypeCard
                    type="Adjustment"
                    body="Reconcile a drift. Enter the correct new balance and Orbit computes + records the delta."
                />
            </div>
            <Paragraph>
                Everything is editable after the fact — click the pencil icon on any row
                in the Transactions page. Delete-permission is the creator or a space
                editor/owner. Balance and envelope numbers recompute automatically.
            </Paragraph>
            <div className="grid gap-3 sm:grid-cols-2">
                <InfoCard
                    title="From vs To"
                    body="The 'from' (source) account dropdown only lists accounts you personally own — you can only move your own money out. The 'to' (destination) dropdown lists every account in the space, so you can record income into a shared household pot or transfer money to a roommate's account."
                />
                <InfoCard
                    title="Transfer fees"
                    body="Toggle 'There's a fee on this transfer' to capture wire fees, ATM fees, FX margins, etc. The fee is deducted from the source on top of the amount (destination still receives the plain amount), categorized as a regular expense, and folds into every analytics view — top categories, envelope utilization, cash flow, spending heatmap."
                />
            </div>
            <Paragraph>
                You can attach image receipts to any transaction. See{" "}
                <a href="#attachments" className="text-primary underline">
                    Attachments &amp; receipts
                </a>{" "}
                below for how the upload flow works and who can see what.
            </Paragraph>
            <ScreenshotPlaceholder label="Transactions page with filter bar, edit sheet, receipt attachments, spent-by column" />
        </section>
    );
}

function Events() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="events" title="Events" icon={CalendarDays} />
            <Paragraph>
                Events are named time-bound groupings — a wedding, a trip, a renovation.
                Attach any transaction to an event and later slice the ledger by it to see
                the full cost and cashflow of the occasion. You can also attach image
                files directly to an event (tickets, confirmations, photos) — see{" "}
                <a href="#attachments" className="text-primary underline">Attachments</a>.
            </Paragraph>
            <ScreenshotPlaceholder label="Events page — card per event with expense / income / transaction count" />
        </section>
    );
}

function Attachments() {
    return (
        <section className="grid gap-4">
            <SectionHeader
                id="attachments"
                title="Attachments & receipts"
                kicker="Files in Orbit"
                icon={Paperclip}
            />
            <Paragraph>
                Attach images to transactions (receipts) and to events (tickets,
                confirmations, photos). Uploads go straight from your browser to
                secure storage, so they don't slow the app down.
            </Paragraph>
            <div className="grid gap-3 sm:grid-cols-3">
                <InfoCard title="Transaction receipts" body="Images up to 10 MB each. Visible to any member of the transaction's space." />
                <InfoCard title="Event attachments" body="Images up to 10 MB each. Visible to any member of the event's space." />
                <InfoCard title="Profile avatars" body="Images up to 5 MB. Automatically optimized so they stay crisp at any size." />
            </div>
            <Paragraph>
                Download links expire after a short window for safety — the app
                refreshes them every time you view an attachment, so sharing a link
                outside the app won't leak access. Remove an attachment and the file
                is deleted straight away.
            </Paragraph>
            <ScreenshotPlaceholder label="Transaction detail sheet — receipt thumbnails with add / remove controls" />
        </section>
    );
}

function Allocations() {
    return (
        <section className="grid gap-4">
            <SectionHeader
                id="allocations"
                title="Allocations — where money lives vs what it's for"
                kicker="What makes Orbit different"
                icon={Sparkles}
            />
            <Paragraph>
                Most budgeting apps ask one question: <i>which envelope is this money
                for?</i> Orbit asks two — and that's the whole trick:
            </Paragraph>
            <div className="grid gap-3 sm:grid-cols-2">
                <InfoCard
                    title="1. Which envelope (or plan)?"
                    body="Routes the money's purpose. 'This $500 is for Groceries.'"
                />
                <InfoCard
                    title="2. Which account, if any?"
                    body="Pins the money's location. 'And specifically, the $500 lives in my wallet.'"
                />
            </div>
            <Paragraph>
                Account pinning is optional — allocate to the{" "}
                <b>unassigned pool</b> when you don't care which account the envelope pulls
                from. Pin an account when you want a fine-grained answer to "is there
                enough in the wallet for this week's groceries?"
            </Paragraph>
            <ScreenshotPlaceholder label="Allocation flow bar on envelope detail — per-account partitions" />
        </section>
    );
}

function Drift() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="drift" title="Drift & rebalancing" icon={Shield} />
            <Paragraph>
                <b>Drift</b> is when an envelope-account partition has spent more than it's
                been allocated. Example: you allocated $500 for Groceries from your wallet,
                then accidentally spent $600 from it. The wallet-Groceries partition shows{" "}
                <span className="text-[color:var(--expense)] font-medium">−$100 drift</span>
                . It's a display concept, not an accounting error — your accounts are
                correct, just the earmarking is off.
            </Paragraph>
            <Paragraph>
                The <b>Overview</b> page shows a Drift Alerts card with the worst
                offenders. Click one to jump into the envelope detail and rebalance:
                transfer allocation from a healthy partition (e.g. wallet ⇒ Entertainment
                has $200 spare) into the drifted one. No accounting gymnastics — just
                re-label the earmark.
            </Paragraph>
            <ScreenshotPlaceholder label="Drift alerts card + rebalance dialog" />
        </section>
    );
}

function Analytics() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="analytics" title="Analytics" icon={BarChart3} />
            <Paragraph>
                Seven dedicated analytics views, all period-filterable:
            </Paragraph>
            <ul className="grid gap-2 sm:grid-cols-2">
                <li className="text-sm">
                    <b>Cash flow</b> — income vs expense by day / week / month
                </li>
                <li className="text-sm">
                    <b>Categories</b> — spend by category with subtree roll-up
                </li>
                <li className="text-sm">
                    <b>Envelopes</b> — utilization + per-account breakdown
                </li>
                <li className="text-sm">
                    <b>Balance</b> — running total balance over time
                </li>
                <li className="text-sm">
                    <b>Accounts</b> — distribution donut across accounts
                </li>
                <li className="text-sm">
                    <b>Heatmap</b> — daily expense calendar
                </li>
                <li className="text-sm">
                    <b>Allocations</b> — see at a glance where each envelope's money sits across your accounts
                </li>
            </ul>
            <ScreenshotPlaceholder label="Analytics index with the 7 sub-view cards" />
        </section>
    );
}

function MyMoney() {
    return (
        <section className="grid gap-4">
            <SectionHeader
                id="my-money"
                title="Your money across spaces"
                icon={LineChart}
            />
            <Paragraph>
                A Roommates space, an Office one, a Family one — each is its own
                ledger, which is exactly what you want when you're collaborating.
                The downside: your own financial picture gets fragmented across
                three or four spaces. <b>My money</b> fixes that by stitching your
                personal activity back into one place — except it's not a
                separate page, it's a <b>virtual space</b> that shows up right
                alongside your real spaces in the space switcher.
            </Paragraph>
            <Paragraph>
                The anchor is <b>accounts you personally own</b> — the ones
                where you're listed as owner in the account's members. Your
                salary account, your wallet, your savings. Open <b>My money</b>{" "}
                and you get the same overview, accounts, transactions, and
                analytics views you'd see in any real space — but unioned
                across <i>every</i> space you're in, filtered to transactions
                that touch your owned accounts. Every chart: cash flow,
                balance history, category breakdown, envelope utilization,
                account distribution, spending heatmap, allocation map. Every
                transaction with every filter (type, category, event, space,
                amount, date, search). Each row tagged with the real space it
                came from, so you can drill straight back into the shared
                ledger when you need to.
            </Paragraph>
            <div className="grid gap-3 sm:grid-cols-2">
                <InfoCard
                    title="What counts as personal cash flow"
                    body="Income into an owned account is inflow. Expenses paid from an owned account are outflow. A transfer from your own account into a shared household pot counts as an outflow (you funded the shared pot); the other direction is an inflow. Transfers between two accounts you both own net to zero and are shown as rebalancing, not income or expense."
                />
                <InfoCard
                    title="What doesn't show up here"
                    body="Money that moves inside a shared space without touching an account you own — like the household paying rent out of a shared pot — stays on that space's dashboard. Splitting shared-space expenses into per-user shares is on the roadmap."
                />
            </div>
            <Paragraph>
                My money is read-only — every change belongs to a specific real
                space, so to record something, jump into a real space via the
                switcher (or click any row's space chip).
            </Paragraph>
            <ScreenshotPlaceholder label="My money virtual space — overview, analytics, and transactions unioned across every space you're in" />
        </section>
    );
}

function Permissions() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="permissions" title="Roles & permissions" icon={Shield} />
            <div className="grid gap-3 sm:grid-cols-3">
                <RoleCard
                    role="Owner"
                    color="text-[color:var(--income)]"
                    body="Full control. Invite/remove members, change roles, delete the space, plus everything editors and viewers can do."
                />
                <RoleCard
                    role="Editor"
                    color="text-primary"
                    body="Record transactions, allocate, rebalance, create events. Cannot change membership or envelopes/plans/categories."
                />
                <RoleCard
                    role="Viewer"
                    color="text-muted-foreground"
                    body="Read-only. See everything, change nothing."
                />
            </div>
            <Paragraph>
                Accounts have their own separate ACL (owner / viewer), managed from the
                account detail → <b>Members</b> tab. Account owners can share the
                account into spaces, add/remove account members, rename, recolor, and
                delete; viewers can only see it. Because the account ACL is independent
                of space membership, you can keep a private wallet visible to you only,
                even while sharing it into a household space.
            </Paragraph>
        </section>
    );
}

function Profile() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="profile" title="Your profile" icon={UserCircle} />
            <Paragraph>
                Your profile — name, email, avatar, password — lives in{" "}
                <b>Settings → Profile</b> and <b>Settings → Security</b>, reachable
                from the user avatar menu in the top-right corner. Uploading a new
                avatar replaces your picture everywhere you appear in Orbit (space
                member list, transaction creator tags, account members).
            </Paragraph>
            <Paragraph>
                Changing your email triggers a verification code to the new address;
                the change takes effect once the code is confirmed. Password resets
                follow the same "code to your inbox" flow as signup.
            </Paragraph>
            <ScreenshotPlaceholder label="Profile settings — avatar uploader + personal info form" />
        </section>
    );
}

function Timezone() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="timezone" title="Time & timezone" icon={Clock} />
            <Paragraph>
                Orbit currently shows all dates in <b>Asia/Dhaka (+06:00)</b> — so
                "this month", envelope period boundaries, and displayed transaction
                times are identical for everyone, no matter where they open the app.
                Per-space timezone customization is on the roadmap.
            </Paragraph>
        </section>
    );
}

function Faq() {
    return (
        <section className="grid gap-4">
            <SectionHeader id="faq" title="FAQ" icon={HelpCircle} />
            <div className="grid gap-3">
                <FaqItem
                    q="Is my data private?"
                    a="Yes — each space is isolated. Only members of a space can see its transactions, envelopes, and plans. Accounts have a second permission layer on top of space membership."
                />
                <FaqItem
                    q="Can I edit a transaction after recording it?"
                    a="Yes. Everything is editable — amount, date, account, category, event, description. Balances and envelope usage recompute automatically."
                />
                <FaqItem
                    q="What happens when I delete an account?"
                    a="Only the account owner can delete. It checks that the account isn't in use (transactions, allocations) in any space — clean those up first, then delete."
                />
                <FaqItem
                    q="Can I use Orbit for just myself?"
                    a="Absolutely. A space of one works exactly the same. You get all the same envelope and plan features without the collaboration overhead."
                />
                <FaqItem
                    q="Does Orbit support multiple currencies?"
                    a="Not yet — amounts are currency-agnostic and treated as one implicit currency per space. Multi-currency is on the roadmap."
                />
                <FaqItem
                    q="How big can a receipt attachment be?"
                    a="Images up to 10 MB for each transaction or event attachment; profile avatars up to 5 MB. Uploads go directly from your browser, so the app stays fast even on larger files."
                />
                <FaqItem
                    q="Who can see a receipt I attach to a transaction?"
                    a="Any member of the space the transaction belongs to. Links expire after a short window, so even if someone copies one out of the app it won't keep working."
                />
                <FaqItem
                    q="Where do I report a bug or request a feature?"
                    a="Use the support email or the in-app feedback form (coming soon)."
                />
            </div>
        </section>
    );
}

function ClosingCta({ isAuthed }: { isAuthed: boolean }) {
    return (
        <section className="mt-16 mb-10 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-6 sm:p-10">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="grid gap-2">
                    <h2 className="text-2xl font-bold sm:text-3xl">
                        {isAuthed ? "Jump back in" : "Ready to try Orbit?"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {isAuthed
                            ? "Open your spaces and keep the ledger up to date."
                            : "Create an account, set up your first space, and start tracking in under five minutes."}
                    </p>
                </div>
                <div className="flex gap-2">
                    {isAuthed ? (
                        <Button asChild variant="gradient" size="lg">
                            <Link to={ROUTES.root}>
                                Open app <ArrowRight />
                            </Link>
                        </Button>
                    ) : (
                        <>
                            <Button asChild variant="outline" size="lg">
                                <Link to={ROUTES.login}>Log in</Link>
                            </Button>
                            <Button asChild variant="gradient" size="lg">
                                <Link to={ROUTES.signup}>
                                    Sign up free <ArrowRight />
                                </Link>
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}

/* ---------------------------------------------------------------- */
/*  Reusable bits                                                   */
/* ---------------------------------------------------------------- */

/**
 * Screenshot placeholder. Renders a real <img> pointing at an SVG mock of
 * the Orbit UI in `public/docs/`. To replace with a real screenshot:
 * drop `<section-id>.png` (or `.webp`) into `apps/web/public/docs/` and
 * pass `src="/docs/<section-id>.png"` on the usage.
 */
function ScreenshotPlaceholder({
    label,
    src = "/docs/placeholder.svg",
}: {
    label: string;
    src?: string;
}) {
    return (
        <figure className="group relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border bg-card/40">
            <img
                src={src}
                alt={label}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
            />
            <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-border/60 bg-background/80 px-4 py-2 backdrop-blur-sm">
                <BookOpen className="size-3.5 shrink-0 text-primary" />
                <span className="truncate text-xs text-muted-foreground">{label}</span>
            </figcaption>
        </figure>
    );
}

function FeatureGrid({
    items,
}: {
    items: Array<{
        icon: React.ComponentType<{ className?: string }>;
        title: string;
        body: string;
    }>;
}) {
    return (
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {items.map((it) => (
                <Card key={it.title} className="border-border/60">
                    <CardContent className="grid gap-2 p-5">
                        <div className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <it.icon className="size-4" />
                        </div>
                        <h3 className="font-semibold">{it.title}</h3>
                        <p className="text-xs text-muted-foreground">{it.body}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

function ConceptCard({ title, body }: { title: string; body: string }) {
    return (
        <Card className="border-border/60">
            <CardContent className="grid gap-1 p-4">
                <p className="font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{body}</p>
            </CardContent>
        </Card>
    );
}

function StepCard({
    step,
    title,
    body,
}: {
    step: number;
    title: string;
    body: string;
}) {
    return (
        <Card className="border-border/60">
            <CardContent className="flex gap-4 p-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                    {step}
                </div>
                <div className="grid gap-1">
                    <p className="font-semibold">{title}</p>
                    <p className="text-sm text-muted-foreground">{body}</p>
                </div>
            </CardContent>
        </Card>
    );
}

function CalloutCard({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <Card className="border-primary/30 bg-primary/5">
            <CardContent className="grid gap-1 p-4">
                <p className="text-sm font-semibold text-primary">{title}</p>
                <p className="text-sm text-muted-foreground">{children}</p>
            </CardContent>
        </Card>
    );
}

function TxTypeCard({ type, body }: { type: string; body: string }) {
    return (
        <Card className="border-border/60">
            <CardContent className="grid gap-1 p-4">
                <p className="font-semibold">{type}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
            </CardContent>
        </Card>
    );
}

function InfoCard({ title, body }: { title: string; body: string }) {
    return (
        <Card className="border-border/60">
            <CardContent className="grid gap-1 p-4">
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
            </CardContent>
        </Card>
    );
}

function RoleCard({
    role,
    color,
    body,
}: {
    role: string;
    color: string;
    body: string;
}) {
    return (
        <Card className="border-border/60">
            <CardContent className="grid gap-1 p-4">
                <p className={cn("font-semibold", color)}>{role}</p>
                <p className="text-xs text-muted-foreground">{body}</p>
            </CardContent>
        </Card>
    );
}

function FaqItem({ q, a }: { q: string; a: string }) {
    return (
        <details className="group rounded-xl border border-border bg-card p-4">
            <summary className="flex cursor-pointer items-center gap-2 font-medium">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                {q}
            </summary>
            <p className="mt-2 pl-6 text-sm text-muted-foreground">{a}</p>
        </details>
    );
}
