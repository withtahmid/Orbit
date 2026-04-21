/**
 * Local-dev database seeder.
 *
 * Wipes every product table and populates a rich, realistic dataset so
 * a fresh local stack has something to look at — useful for `/docs`
 * screenshots, feature-demo videos, and eyeballing UI changes without
 * hand-creating every entity.
 *
 *   pnpm --filter backend seed
 *
 * Safety rails:
 * - Refuses to run when `NODE_ENV=production`.
 * - Does NOT touch files / attachments / exported_reports tables — those
 *   point at R2 objects that don't exist locally, and the only things
 *   that need them (avatars) fall back gracefully to initials.
 *
 * Data universe (locale-neutral; amounts are currency-agnostic — interpret
 * them as whatever unit you want):
 * - 4 users (primary + 3 collaborators) — generic names, no localization
 * - 3 spaces ("Family Budget", "Personal", "Roommates")
 * - 9 accounts across asset / liability / locked, some cross-space shared
 * - 17 envelopes with cadence + carry-over mix
 * - 6 plans (house, vacation, laptop, emergency fund, …)
 * - ~60 expense categories with realistic nesting
 * - 6 events
 * - ~800 transactions over the last ~6 months
 * - ~160 envelope + plan allocations, with intentional drift and
 *   rebalances to surface the 2D allocation idea
 *
 * Primary user credentials are printed at the end.
 */

import bcrypt from "bcrypt";
import { sql } from "kysely";
import createPGPool from "../index.mjs";
import { createQueryBuilder } from "./index.mjs";
import type { Accounts, SpaceMembers, Transactions, UserAccounts } from "./types.mjs";
import { ENV } from "../../env.mjs";
import { logger } from "../../utils/logger.mjs";

const PRIMARY_PASSWORD = "password123";
const BCRYPT_ROUNDS = 4; // fast; seed only

// ---------------------------------------------------------------------
// Deterministic PRNG — Mulberry32 seeded from a constant so the same
// seed script run twice produces identical data. Handy for screenshot
// diffs and "is this a regression?" debugging.
// ---------------------------------------------------------------------

const createRng = (seed: number) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};
const rng = createRng(0xc0ffee);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const range = (lo: number, hi: number): number => Math.round(lo + rng() * (hi - lo));
const maybe = (p: number): boolean => rng() < p;

// ---------------------------------------------------------------------
// Date helpers — anchored to a stable "now" so re-running the seed on
// different days still produces the same shaped history relative to
// today. We fan backward ~6 months from this anchor.
// ---------------------------------------------------------------------

const NOW = new Date();
const MS_DAY = 86_400_000;

const startOfMonthUTC = (d: Date): Date =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
const addMonths = (d: Date, n: number): Date =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * MS_DAY);
const atHour = (d: Date, h: number, m = 0): Date => {
    const out = new Date(d);
    out.setHours(h, m, 0, 0);
    return out;
};

// Six months of history, ending today. periodStarts lists the first-of-
// the-month for each month in that window, oldest first.
const periodStarts: Date[] = (() => {
    const anchor = startOfMonthUTC(NOW);
    const out: Date[] = [];
    for (let i = 5; i >= 0; i--) out.push(addMonths(anchor, -i));
    return out;
})();

// ---------------------------------------------------------------------
// Static catalog — locale-neutral. Amounts are chosen so ratios feel
// right without implying any particular currency: rent ≈ 25% of
// monthly household take-home, groceries ≈ 10%, etc. Read the numbers
// as whatever unit is natural to you.
// ---------------------------------------------------------------------

const USERS = [
    {
        key: "primary",
        email: "alex@orbit.dev",
        first_name: "Alex",
        last_name: "Morgan",
    },
    {
        key: "partner",
        email: "sam@orbit.dev",
        first_name: "Sam",
        last_name: "Rivera",
    },
    {
        key: "friend",
        email: "jordan@orbit.dev",
        first_name: "Jordan",
        last_name: "Lee",
    },
    {
        key: "roommate",
        email: "taylor@orbit.dev",
        first_name: "Taylor",
        last_name: "Chen",
    },
] as const;

type UserKey = (typeof USERS)[number]["key"];

const SPACES = [
    {
        key: "family",
        name: "Family Budget",
        owner: "primary" as UserKey,
        members: [
            { user: "partner" as UserKey, role: "editor" as const },
            { user: "friend" as UserKey, role: "viewer" as const },
        ],
    },
    {
        key: "personal",
        name: "Personal",
        owner: "primary" as UserKey,
        members: [] as { user: UserKey; role: "editor" | "viewer" | "owner" }[],
    },
    {
        key: "roommates",
        name: "Roommates",
        owner: "primary" as UserKey,
        members: [{ user: "roommate" as UserKey, role: "editor" as const }],
    },
] as const;

type SpaceKey = (typeof SPACES)[number]["key"];

const ACCOUNTS = [
    // key, name, type, owner, viewers, spaces
    { key: "cash", name: "Cash Wallet", type: "asset" as const, color: "#22c55e", icon: "wallet", owner: "primary" as UserKey, viewers: [] as UserKey[], spaces: ["family", "personal", "roommates"] as SpaceKey[] },
    { key: "checking", name: "Checking", type: "asset" as const, color: "#0ea5e9", icon: "landmark", owner: "primary" as UserKey, viewers: ["partner"] as UserKey[], spaces: ["family", "personal"] as SpaceKey[] },
    { key: "savings", name: "High-Yield Savings", type: "asset" as const, color: "#10b981", icon: "piggy-bank", owner: "primary" as UserKey, viewers: ["partner"] as UserKey[], spaces: ["family"] as SpaceKey[] },
    { key: "joint", name: "Joint Checking", type: "asset" as const, color: "#f59e0b", icon: "users", owner: "primary" as UserKey, viewers: ["partner"] as UserKey[], spaces: ["family"] as SpaceKey[] },
    { key: "mobile", name: "Mobile Money", type: "asset" as const, color: "#f43f5e", icon: "smartphone", owner: "primary" as UserKey, viewers: [] as UserKey[], spaces: ["personal"] as SpaceKey[] },
    { key: "shared", name: "Shared House Account", type: "asset" as const, color: "#a855f7", icon: "users", owner: "primary" as UserKey, viewers: ["roommate"] as UserKey[], spaces: ["roommates"] as SpaceKey[] },
    { key: "credit", name: "Credit Card", type: "liability" as const, color: "#ef4444", icon: "credit-card", owner: "primary" as UserKey, viewers: ["partner"] as UserKey[], spaces: ["family", "personal"] as SpaceKey[] },
    { key: "term", name: "Term Deposit", type: "locked" as const, color: "#6366f1", icon: "lock", owner: "primary" as UserKey, viewers: ["partner"] as UserKey[], spaces: ["family"] as SpaceKey[] },
    { key: "retirement", name: "Retirement Account", type: "locked" as const, color: "#14b8a6", icon: "shield", owner: "primary" as UserKey, viewers: [] as UserKey[], spaces: ["personal"] as SpaceKey[] },
] as const;

type AccountKey = (typeof ACCOUNTS)[number]["key"];

const ENVELOPES = [
    // family
    { key: "fam_groceries",    space: "family" as SpaceKey,    name: "Groceries",         cadence: "monthly" as const, carry: true,  color: "#22c55e", icon: "shopping-cart" },
    { key: "fam_rent",         space: "family" as SpaceKey,    name: "Rent",              cadence: "monthly" as const, carry: false, color: "#ef4444", icon: "home" },
    { key: "fam_utilities",    space: "family" as SpaceKey,    name: "Utilities",         cadence: "monthly" as const, carry: false, color: "#0ea5e9", icon: "zap" },
    { key: "fam_transport",    space: "family" as SpaceKey,    name: "Transportation",    cadence: "monthly" as const, carry: true,  color: "#f59e0b", icon: "car" },
    { key: "fam_eatout",       space: "family" as SpaceKey,    name: "Eating Out",        cadence: "monthly" as const, carry: true,  color: "#f43f5e", icon: "utensils" },
    { key: "fam_entertainment",space: "family" as SpaceKey,    name: "Entertainment",     cadence: "monthly" as const, carry: true,  color: "#a855f7", icon: "film" },
    { key: "fam_healthcare",   space: "family" as SpaceKey,    name: "Healthcare",        cadence: "monthly" as const, carry: false, color: "#10b981", icon: "heart-pulse" },
    { key: "fam_gifts",        space: "family" as SpaceKey,    name: "Gifts & Occasions", cadence: "none" as const,    carry: false, color: "#eab308", icon: "gift" },
    // personal
    { key: "per_subs",         space: "personal" as SpaceKey,  name: "Subscriptions",     cadence: "monthly" as const, carry: false, color: "#6366f1", icon: "rss" },
    { key: "per_selfcare",     space: "personal" as SpaceKey,  name: "Self Care",         cadence: "monthly" as const, carry: true,  color: "#14b8a6", icon: "sparkles" },
    { key: "per_hobbies",      space: "personal" as SpaceKey,  name: "Hobbies",           cadence: "monthly" as const, carry: true,  color: "#f97316", icon: "camera" },
    { key: "per_reading",      space: "personal" as SpaceKey,  name: "Books & Learning",  cadence: "none" as const,    carry: false, color: "#0891b2", icon: "book-open" },
    { key: "per_coffee",       space: "personal" as SpaceKey,  name: "Coffee",            cadence: "monthly" as const, carry: false, color: "#92400e", icon: "coffee" },
    // roommates
    { key: "room_groceries",   space: "roommates" as SpaceKey, name: "Shared Groceries",  cadence: "monthly" as const, carry: false, color: "#22c55e", icon: "shopping-basket" },
    { key: "room_utilities",   space: "roommates" as SpaceKey, name: "Utilities",         cadence: "monthly" as const, carry: false, color: "#0ea5e9", icon: "plug" },
    { key: "room_cleaning",    space: "roommates" as SpaceKey, name: "Cleaning",          cadence: "monthly" as const, carry: false, color: "#a855f7", icon: "spray-can" },
    { key: "room_supplies",    space: "roommates" as SpaceKey, name: "Household Supplies",cadence: "none" as const,    carry: false, color: "#64748b", icon: "box" },
] as const;

type EnvelopeKey = (typeof ENVELOPES)[number]["key"];

const PLANS = [
    { key: "plan_house",      space: "family" as SpaceKey,    name: "House Down Payment", target: 50000, target_date: addMonths(startOfMonthUTC(NOW),  24), color: "#6366f1", icon: "home",         description: "20% down for a 3-bedroom; target horizon ~2 years." },
    { key: "plan_vacation",   space: "family" as SpaceKey,    name: "Annual Vacation",    target:  6000, target_date: addMonths(startOfMonthUTC(NOW),   8), color: "#f59e0b", icon: "plane",        description: "10-day international trip at the end of the year." },
    { key: "plan_emergency",  space: "family" as SpaceKey,    name: "Emergency Fund",     target: 18000, target_date: null,                              color: "#14b8a6", icon: "shield-alert", description: "6 months of essential expenses, kept liquid." },
    { key: "plan_laptop",     space: "personal" as SpaceKey,  name: "New Laptop",         target:  2500, target_date: addMonths(startOfMonthUTC(NOW),   5), color: "#0ea5e9", icon: "laptop",       description: "Upgrading from a 5-year-old machine." },
    { key: "plan_camera",     space: "personal" as SpaceKey,  name: "Photography Gear",   target:  1800, target_date: null,                              color: "#f43f5e", icon: "camera",       description: "Full-frame body + one prime + a decent tripod." },
    { key: "plan_ac",         space: "roommates" as SpaceKey, name: "Air Conditioner",    target:   900, target_date: addMonths(startOfMonthUTC(NOW),   3), color: "#0891b2", icon: "snowflake",    description: "Living-room AC, split across roommates." },
] as const;

type PlanKey = (typeof PLANS)[number]["key"];

// Categories: parent rows for grouping, children that actually route
// transactions. Flat here; inserted two-pass so parent ids are known.
type CategorySeed = {
    key: string;
    space: SpaceKey;
    name: string;
    envelope: EnvelopeKey;
    parent?: string;
    color: string;
    icon: string;
};

const CATEGORIES: CategorySeed[] = [
    // Family
    { key: "c_food",         space: "family", name: "Food",           envelope: "fam_groceries",    color: "#22c55e", icon: "shopping-cart" },
    { key: "c_food_veg",     space: "family", name: "Produce",        envelope: "fam_groceries", parent: "c_food", color: "#16a34a", icon: "leaf" },
    { key: "c_food_meat",    space: "family", name: "Meat & Fish",    envelope: "fam_groceries", parent: "c_food", color: "#dc2626", icon: "fish" },
    { key: "c_food_dairy",   space: "family", name: "Dairy & Bakery", envelope: "fam_groceries", parent: "c_food", color: "#f59e0b", icon: "milk" },
    { key: "c_food_staples", space: "family", name: "Pantry Staples", envelope: "fam_groceries", parent: "c_food", color: "#92400e", icon: "wheat" },

    { key: "c_rest",         space: "family", name: "Restaurants",    envelope: "fam_eatout",       color: "#f43f5e", icon: "utensils" },
    { key: "c_rest_fine",    space: "family", name: "Fine Dining",    envelope: "fam_eatout", parent: "c_rest", color: "#be123c", icon: "wine" },
    { key: "c_rest_casual",  space: "family", name: "Casual Dining",  envelope: "fam_eatout", parent: "c_rest", color: "#e11d48", icon: "pizza" },
    { key: "c_rest_quick",   space: "family", name: "Quick Bites",    envelope: "fam_eatout", parent: "c_rest", color: "#f97316", icon: "sandwich" },
    { key: "c_rest_delivery",space: "family", name: "Delivery",       envelope: "fam_eatout", parent: "c_rest", color: "#ea580c", icon: "bike" },

    { key: "c_housing",      space: "family", name: "Housing",        envelope: "fam_rent",         color: "#ef4444", icon: "home" },
    { key: "c_housing_rent", space: "family", name: "Rent",           envelope: "fam_rent", parent: "c_housing", color: "#dc2626", icon: "key" },

    { key: "c_util",         space: "family", name: "Utilities",      envelope: "fam_utilities",    color: "#0ea5e9", icon: "zap" },
    { key: "c_util_elec",    space: "family", name: "Electricity",    envelope: "fam_utilities", parent: "c_util", color: "#eab308", icon: "zap" },
    { key: "c_util_water",   space: "family", name: "Water",          envelope: "fam_utilities", parent: "c_util", color: "#06b6d4", icon: "droplet" },
    { key: "c_util_gas",     space: "family", name: "Gas",            envelope: "fam_utilities", parent: "c_util", color: "#f97316", icon: "flame" },
    { key: "c_util_net",     space: "family", name: "Internet",       envelope: "fam_utilities", parent: "c_util", color: "#6366f1", icon: "wifi" },
    { key: "c_util_mob",     space: "family", name: "Mobile",         envelope: "fam_utilities", parent: "c_util", color: "#a855f7", icon: "smartphone" },

    { key: "c_trans",        space: "family", name: "Transport",      envelope: "fam_transport",    color: "#f59e0b", icon: "car" },
    { key: "c_trans_ride",   space: "family", name: "Rideshare",      envelope: "fam_transport", parent: "c_trans", color: "#111827", icon: "car" },
    { key: "c_trans_taxi",   space: "family", name: "Taxi",           envelope: "fam_transport", parent: "c_trans", color: "#16a34a", icon: "car-front" },
    { key: "c_trans_fuel",   space: "family", name: "Fuel",           envelope: "fam_transport", parent: "c_trans", color: "#dc2626", icon: "fuel" },
    { key: "c_trans_transit",space: "family", name: "Public Transit", envelope: "fam_transport", parent: "c_trans", color: "#0891b2", icon: "bus" },

    { key: "c_ent",          space: "family", name: "Entertainment",  envelope: "fam_entertainment",color: "#a855f7", icon: "film" },
    { key: "c_ent_movies",   space: "family", name: "Movies",         envelope: "fam_entertainment", parent: "c_ent", color: "#8b5cf6", icon: "clapperboard" },
    { key: "c_ent_stream",   space: "family", name: "Streaming",      envelope: "fam_entertainment", parent: "c_ent", color: "#ec4899", icon: "tv" },
    { key: "c_ent_games",    space: "family", name: "Games",          envelope: "fam_entertainment", parent: "c_ent", color: "#6366f1", icon: "gamepad-2" },

    { key: "c_health",       space: "family", name: "Health",         envelope: "fam_healthcare",   color: "#10b981", icon: "heart-pulse" },
    { key: "c_health_ph",    space: "family", name: "Pharmacy",       envelope: "fam_healthcare", parent: "c_health", color: "#059669", icon: "pill" },
    { key: "c_health_dr",    space: "family", name: "Doctor",         envelope: "fam_healthcare", parent: "c_health", color: "#0891b2", icon: "stethoscope" },
    { key: "c_health_lab",   space: "family", name: "Lab & Tests",    envelope: "fam_healthcare", parent: "c_health", color: "#6366f1", icon: "test-tube" },

    { key: "c_gifts",        space: "family", name: "Gifts",          envelope: "fam_gifts",        color: "#eab308", icon: "gift" },
    { key: "c_gifts_bday",   space: "family", name: "Birthdays",      envelope: "fam_gifts", parent: "c_gifts", color: "#f59e0b", icon: "cake" },
    { key: "c_gifts_wed",    space: "family", name: "Weddings",       envelope: "fam_gifts", parent: "c_gifts", color: "#f43f5e", icon: "heart" },
    { key: "c_gifts_hol",    space: "family", name: "Holidays",       envelope: "fam_gifts", parent: "c_gifts", color: "#22c55e", icon: "sparkles" },

    // Personal
    { key: "c_subs",         space: "personal", name: "Subscriptions", envelope: "per_subs",       color: "#6366f1", icon: "rss" },
    { key: "c_subs_video",   space: "personal", name: "Video",         envelope: "per_subs", parent: "c_subs", color: "#ef4444", icon: "tv" },
    { key: "c_subs_music",   space: "personal", name: "Music",         envelope: "per_subs", parent: "c_subs", color: "#10b981", icon: "music" },
    { key: "c_subs_cloud",   space: "personal", name: "Cloud Storage", envelope: "per_subs", parent: "c_subs", color: "#0ea5e9", icon: "cloud" },
    { key: "c_subs_dev",     space: "personal", name: "Dev & Infra",   envelope: "per_subs", parent: "c_subs", color: "#a855f7", icon: "server" },

    { key: "c_self",         space: "personal", name: "Self Care",     envelope: "per_selfcare",   color: "#14b8a6", icon: "sparkles" },
    { key: "c_self_hair",    space: "personal", name: "Haircut",       envelope: "per_selfcare", parent: "c_self", color: "#f59e0b", icon: "scissors" },
    { key: "c_self_gym",     space: "personal", name: "Gym",           envelope: "per_selfcare", parent: "c_self", color: "#dc2626", icon: "dumbbell" },
    { key: "c_self_skin",    space: "personal", name: "Skincare",      envelope: "per_selfcare", parent: "c_self", color: "#ec4899", icon: "flask-conical" },

    { key: "c_hob",          space: "personal", name: "Hobbies",       envelope: "per_hobbies",    color: "#f97316", icon: "camera" },
    { key: "c_hob_photo",    space: "personal", name: "Photography",   envelope: "per_hobbies", parent: "c_hob", color: "#0ea5e9", icon: "camera" },
    { key: "c_hob_tools",    space: "personal", name: "Dev Tools",     envelope: "per_hobbies", parent: "c_hob", color: "#6366f1", icon: "wrench" },

    { key: "c_read",         space: "personal", name: "Books & Courses",envelope: "per_reading",   color: "#0891b2", icon: "book-open" },
    { key: "c_coffee",       space: "personal", name: "Coffee",         envelope: "per_coffee",    color: "#92400e", icon: "coffee" },

    // Roommates
    { key: "c_rm_gro",       space: "roommates", name: "Groceries",     envelope: "room_groceries", color: "#22c55e", icon: "shopping-basket" },
    { key: "c_rm_gro_prod",  space: "roommates", name: "Produce",       envelope: "room_groceries", parent: "c_rm_gro", color: "#16a34a", icon: "leaf" },
    { key: "c_rm_gro_sta",   space: "roommates", name: "Pantry",        envelope: "room_groceries", parent: "c_rm_gro", color: "#92400e", icon: "wheat" },

    { key: "c_rm_util",      space: "roommates", name: "Utilities",     envelope: "room_utilities",color: "#0ea5e9", icon: "plug" },
    { key: "c_rm_util_wifi", space: "roommates", name: "Internet",      envelope: "room_utilities",parent: "c_rm_util", color: "#6366f1", icon: "wifi" },
    { key: "c_rm_util_elec", space: "roommates", name: "Electricity",   envelope: "room_utilities",parent: "c_rm_util", color: "#eab308", icon: "zap" },

    { key: "c_rm_clean",     space: "roommates", name: "Cleaning",      envelope: "room_cleaning",  color: "#a855f7", icon: "spray-can" },
    { key: "c_rm_clean_det", space: "roommates", name: "Supplies",      envelope: "room_cleaning", parent: "c_rm_clean", color: "#8b5cf6", icon: "droplet" },
    { key: "c_rm_clean_srv", space: "roommates", name: "Cleaning Service",envelope: "room_cleaning", parent: "c_rm_clean", color: "#ec4899", icon: "broom" },

    { key: "c_rm_sup",       space: "roommates", name: "Misc Supplies", envelope: "room_supplies", color: "#64748b", icon: "box" },
];

// Events — generic, with dates anchored a few months around "now" so
// some are past and one is upcoming.
const EVENTS = [
    { key: "e_holiday",   space: "family" as SpaceKey,    name: "Spring Holiday",       start: daysAgo(25),  end: daysAgo(22),  color: "#22c55e", icon: "sun",            description: "Three-day holiday weekend with family visits." },
    { key: "e_beach",     space: "family" as SpaceKey,    name: "Beach Weekend",        start: daysAgo(72),  end: daysAgo(69),  color: "#0ea5e9", icon: "waves",          description: "Long weekend beach trip — all four of us." },
    { key: "e_wedding",   space: "family" as SpaceKey,    name: "Sibling's Wedding",    start: daysAgo(138), end: daysAgo(134), color: "#f43f5e", icon: "heart",          description: "Multi-day wedding celebration." },
    { key: "e_paint",     space: "family" as SpaceKey,    name: "Home Repainting",      start: daysAgo(110), end: daysAgo(100), color: "#f59e0b", icon: "paintbrush",     description: "Full interior repaint." },
    { key: "e_conf",      space: "personal" as SpaceKey,  name: "Tech Conference",      start: daysAgo(40),  end: daysAgo(38),  color: "#6366f1", icon: "presentation",   description: "Three-day tech conference with workshops." },
    { key: "e_house",     space: "roommates" as SpaceKey, name: "Housewarming Dinner",  start: daysAgo(160), end: daysAgo(159), color: "#a855f7", icon: "party-popper",   description: "Moved in — invited everyone over." },
] as const;

type EventKey = (typeof EVENTS)[number]["key"];

// Transaction amount + description pools per category. The first element
// is a [lo, hi] amount range in currency-neutral units; the second is a
// descriptions array. Locations are generic (no real city / neighborhood
// names).
const TX_POOL: Record<string, { amt: [number, number]; desc: string[] }> = {
    c_food_veg: { amt: [8, 55], desc: ["Weekly produce run", "Vegetables and greens", "Farmers market", "Local grocery"] },
    c_food_meat: { amt: [20, 85], desc: ["Meat and fish", "Weekend protein", "Butcher shop", "Seafood market"] },
    c_food_dairy: { amt: [8, 35], desc: ["Milk and yogurt", "Bakery run", "Dairy top-up", "Cheese and butter"] },
    c_food_staples: { amt: [15, 70], desc: ["Rice and grains", "Cooking oil and spices", "Pantry restock", "Bulk essentials"] },
    c_rest_fine: { amt: [60, 220], desc: ["Anniversary dinner", "Sunday brunch", "Special occasion meal", "Tasting menu"] },
    c_rest_casual: { amt: [18, 65], desc: ["Casual lunch out", "Pizza dinner", "Family dinner out", "Burger joint"] },
    c_rest_quick: { amt: [6, 22], desc: ["Quick lunch", "Bagel and coffee", "Food truck", "Sandwich shop"] },
    c_rest_delivery: { amt: [14, 60], desc: ["Dinner delivery", "Takeout", "Weeknight delivery", "Lunch delivery"] },
    c_housing_rent: { amt: [1500, 1500], desc: ["Monthly rent"] },
    c_util_elec: { amt: [35, 140], desc: ["Electricity bill"] },
    c_util_water: { amt: [18, 45], desc: ["Water bill"] },
    c_util_gas: { amt: [25, 60], desc: ["Gas bill"] },
    c_util_net: { amt: [55, 65], desc: ["Internet service"] },
    c_util_mob: { amt: [22, 45], desc: ["Mobile plan"] },
    c_trans_ride: { amt: [7, 28], desc: ["Rideshare — commute", "Rideshare home", "Late-night ride", "Rideshare to dinner"] },
    c_trans_taxi: { amt: [5, 18], desc: ["Taxi across town", "Short cab ride"] },
    c_trans_fuel: { amt: [35, 90], desc: ["Fuel top-up", "Gas station fill-up"] },
    c_trans_transit: { amt: [2, 12], desc: ["Transit pass", "Single fare", "Weekly pass"] },
    c_ent_movies: { amt: [18, 55], desc: ["Movie night", "Opening weekend"] },
    c_ent_stream: { amt: [8, 22], desc: ["Streaming subscription", "Premium tier"] },
    c_ent_games: { amt: [20, 75], desc: ["Game purchase", "DLC", "In-app purchase"] },
    c_health_ph: { amt: [10, 50], desc: ["Pharmacy — antibiotics", "Vitamins restock", "OTC medicine"] },
    c_health_dr: { amt: [45, 180], desc: ["GP visit", "Dermatologist", "Dental checkup", "Follow-up visit"] },
    c_health_lab: { amt: [65, 240], desc: ["Annual bloodwork", "Ultrasound", "Lab panel"] },
    c_gifts_bday: { amt: [30, 120], desc: ["Birthday gift", "Cake and card", "Birthday present"] },
    c_gifts_wed: { amt: [60, 250], desc: ["Wedding gift", "Congratulatory present"] },
    c_gifts_hol: { amt: [20, 80], desc: ["Holiday gift", "Seasonal present"] },
    c_subs_video: { amt: [16, 16], desc: ["Video streaming"] },
    c_subs_music: { amt: [10, 10], desc: ["Music streaming"] },
    c_subs_cloud: { amt: [3, 10], desc: ["Cloud storage plan"] },
    c_subs_dev: { amt: [5, 35], desc: ["SaaS subscription", "Domain renewal", "Cloud hosting"] },
    c_self_hair: { amt: [20, 55], desc: ["Haircut", "Beard trim"] },
    c_self_gym: { amt: [40, 80], desc: ["Gym monthly", "Trainer session"] },
    c_self_skin: { amt: [18, 70], desc: ["Skincare", "Sunscreen and moisturizer"] },
    c_hob_photo: { amt: [25, 180], desc: ["Camera accessory", "Photo gear", "Printing"] },
    c_hob_tools: { amt: [10, 80], desc: ["Software license", "Dev tool subscription"] },
    c_read: { amt: [12, 75], desc: ["Book order", "Online course", "Kindle purchase", "Bookshop haul"] },
    c_coffee: { amt: [4, 9], desc: ["Coffee shop", "Morning americano", "Latte to go", "Coffee beans"] },
    c_rm_gro_prod: { amt: [12, 45], desc: ["Weekly produce", "Groceries for the house"] },
    c_rm_gro_sta: { amt: [15, 60], desc: ["Pantry restock", "Cooking staples"] },
    c_rm_util_wifi: { amt: [55, 55], desc: ["Internet — split"] },
    c_rm_util_elec: { amt: [25, 85], desc: ["Electricity — split"] },
    c_rm_clean_det: { amt: [10, 30], desc: ["Detergent and cleaners"] },
    c_rm_clean_srv: { amt: [25, 45], desc: ["Weekly cleaning service"] },
    c_rm_sup: { amt: [8, 45], desc: ["Toilet paper + bin bags", "Bulb replacement", "Kitchen utensils"] },
};

// Per-envelope default monthly allocation in currency-neutral units.
// Picked so roughly 75–90% gets consumed in an average month — leaves
// room for some carry-over accumulation and mild drift.
const MONTHLY_ALLOCATION: Partial<Record<EnvelopeKey, number>> = {
    fam_groceries: 600,
    fam_rent: 1550,
    fam_utilities: 300,
    fam_transport: 280,
    fam_eatout: 350,
    fam_entertainment: 180,
    fam_healthcare: 150,
    fam_gifts: 120,
    per_subs: 90,
    per_selfcare: 180,
    per_hobbies: 220,
    per_reading: 80,
    per_coffee: 120,
    room_groceries: 320,
    room_utilities: 160,
    room_cleaning: 120,
    room_supplies: 90,
};

// Generic, non-localized location labels — kept vague so the data
// doesn't evoke any real city or neighborhood.
const GENERIC_LOCATIONS = [
    "Downtown",
    "Midtown",
    "Uptown",
    "Old Town",
    "Riverside",
    "Westside",
    "East End",
    "Suburbs",
] as const;

// ---------------------------------------------------------------------
// Main — exposed as `seedDatabase()` so it can be imported from
// `bootstrap.mts` (locked behind a feature flag there) and also run as
// a one-off script via `pnpm --filter backend seed`.
// ---------------------------------------------------------------------

export async function seedDatabase() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Refusing to seed with NODE_ENV=production.");
    }

    logger.info(`Seeding against ${ENV.DATABASE_URL.replace(/:[^:@]*@/, ":***@")}`);

    const pool = createPGPool();
    const db = createQueryBuilder(pool);

    try {
        await wipe(db);
        const users = await seedUsers(db);
        const spaces = await seedSpaces(db, users);
        const accounts = await seedAccounts(db, users, spaces);
        const envelopes = await seedEnvelopes(db, spaces);
        const plans = await seedPlans(db, spaces, users);
        const categories = await seedCategories(db, spaces, envelopes);
        const events = await seedEvents(db, spaces);
        await seedEnvelopeAllocations(db, users, envelopes, accounts);
        await seedPlanAllocations(db, users, plans, accounts);
        const txCount = await seedTransactions(
            db,
            users,
            spaces,
            accounts,
            categories,
            events
        );

        logger.info("Seed complete ✅");
        console.log("");
        console.log("─────────────────────────────────────────────────────────");
        console.log(" Seed summary");
        console.log("─────────────────────────────────────────────────────────");
        console.log(`  users:         ${Object.keys(users).length}`);
        console.log(`  spaces:        ${Object.keys(spaces).length}`);
        console.log(`  accounts:      ${Object.keys(accounts).length}`);
        console.log(`  envelopes:     ${Object.keys(envelopes).length}`);
        console.log(`  plans:         ${Object.keys(plans).length}`);
        console.log(`  categories:    ${Object.keys(categories).length}`);
        console.log(`  events:        ${Object.keys(events).length}`);
        console.log(`  transactions:  ${txCount}`);
        console.log("");
        console.log(" Log in with:");
        console.log(`  email:    alex@orbit.dev`);
        console.log(`  password: ${PRIMARY_PASSWORD}`);
        console.log("─────────────────────────────────────────────────────────");
        console.log("");
    } finally {
        await db.destroy();
        await pool.end().catch(() => {});
    }
}

// ---------------------------------------------------------------------
// Wipe — TRUNCATE with CASCADE and RESTART IDENTITY. Keeps migration
// history (kysely_migration / kysely_migration_lock) intact.
// ---------------------------------------------------------------------

async function wipe(db: ReturnType<typeof createQueryBuilder>) {
    logger.info("Wiping product tables…");
    const tables = [
        "transaction_attachments",
        "event_attachments",
        "exported_reports",
        "files",
        "envelop_allocations",
        "plan_allocations",
        "transactions",
        "expense_categories",
        "events",
        "envelops",
        "plans",
        "account_balances",
        "space_accounts",
        "user_accounts",
        "accounts",
        "space_members",
        "spaces",
        "email_verification_codes",
        "tmp_users",
        "users",
    ];
    await sql.raw(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`).execute(db);
}

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------

async function seedUsers(db: ReturnType<typeof createQueryBuilder>) {
    logger.info("Users…");
    const password_hash = await bcrypt.hash(PRIMARY_PASSWORD, BCRYPT_ROUNDS);
    const rows = await db
        .insertInto("users")
        .values(
            USERS.map((u) => ({
                email: u.email,
                first_name: u.first_name,
                last_name: u.last_name,
                password_hash,
            }))
        )
        .returning(["id", "email"])
        .execute();
    const byKey: Record<UserKey, string> = {} as Record<UserKey, string>;
    for (const u of USERS) {
        const row = rows.find((r) => r.email === u.email);
        if (!row) throw new Error(`Failed to insert user ${u.email}`);
        byKey[u.key] = row.id;
    }
    return byKey;
}

// ---------------------------------------------------------------------
// Spaces + members
// ---------------------------------------------------------------------

async function seedSpaces(
    db: ReturnType<typeof createQueryBuilder>,
    users: Record<UserKey, string>
) {
    logger.info("Spaces + members…");
    const byKey: Record<SpaceKey, string> = {} as Record<SpaceKey, string>;
    for (const s of SPACES) {
        const row = await db
            .insertInto("spaces")
            .values({
                name: s.name,
                created_by: users[s.owner],
                updated_by: users[s.owner],
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        byKey[s.key] = row.id;

        const memberRows = [
            {
                space_id: row.id,
                user_id: users[s.owner],
                role: "owner" as unknown as SpaceMembers["role"],
            },
            ...s.members.map((m) => ({
                space_id: row.id,
                user_id: users[m.user],
                role: m.role as unknown as SpaceMembers["role"],
            })),
        ];
        await db.insertInto("space_members").values(memberRows).execute();
    }
    return byKey;
}

// ---------------------------------------------------------------------
// Accounts + user_accounts + space_accounts + balances (opening deposits
// land via seedTransactions — this step only creates the entities).
// ---------------------------------------------------------------------

async function seedAccounts(
    db: ReturnType<typeof createQueryBuilder>,
    users: Record<UserKey, string>,
    spaces: Record<SpaceKey, string>
) {
    logger.info("Accounts…");
    const byKey: Record<AccountKey, string> = {} as Record<AccountKey, string>;
    for (const a of ACCOUNTS) {
        const row = await db
            .insertInto("accounts")
            .values({
                name: a.name,
                account_type: a.type as unknown as Accounts["account_type"],
                color: a.color,
                icon: a.icon,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        byKey[a.key] = row.id;

        const userAccountRows: {
            account_id: string;
            user_id: string;
            role: UserAccounts["role"];
        }[] = [
            {
                account_id: row.id,
                user_id: users[a.owner],
                role: "owner" as unknown as UserAccounts["role"],
            },
            ...a.viewers.map((v) => ({
                account_id: row.id,
                user_id: users[v],
                role: "viewer" as unknown as UserAccounts["role"],
            })),
        ];
        await db.insertInto("user_accounts").values(userAccountRows).execute();

        await db
            .insertInto("space_accounts")
            .values(
                a.spaces.map((s) => ({
                    account_id: row.id,
                    space_id: spaces[s],
                }))
            )
            .execute();

        await db
            .insertInto("account_balances")
            .values({ account_id: row.id, balance: 0 })
            .execute();
    }
    return byKey;
}

// ---------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------

async function seedEnvelopes(
    db: ReturnType<typeof createQueryBuilder>,
    spaces: Record<SpaceKey, string>
) {
    logger.info("Envelopes…");
    const byKey: Record<EnvelopeKey, string> = {} as Record<EnvelopeKey, string>;
    for (const e of ENVELOPES) {
        const row = await db
            .insertInto("envelops")
            .values({
                space_id: spaces[e.space],
                name: e.name,
                color: e.color,
                icon: e.icon,
                cadence: e.cadence,
                carry_over: e.carry,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        byKey[e.key] = row.id;
    }
    return byKey;
}

// ---------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------

async function seedPlans(
    db: ReturnType<typeof createQueryBuilder>,
    spaces: Record<SpaceKey, string>,
    _users: Record<UserKey, string>
) {
    logger.info("Plans…");
    const byKey: Record<PlanKey, string> = {} as Record<PlanKey, string>;
    for (const p of PLANS) {
        const row = await db
            .insertInto("plans")
            .values({
                space_id: spaces[p.space],
                name: p.name,
                color: p.color,
                icon: p.icon,
                description: p.description,
                target_amount: p.target,
                target_date: p.target_date ?? null,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        byKey[p.key] = row.id;
    }
    return byKey;
}

// ---------------------------------------------------------------------
// Categories — two-pass insert so parent ids are available.
// ---------------------------------------------------------------------

async function seedCategories(
    db: ReturnType<typeof createQueryBuilder>,
    spaces: Record<SpaceKey, string>,
    envelopes: Record<EnvelopeKey, string>
) {
    logger.info("Expense categories…");
    const byKey: Record<string, string> = {};
    for (const c of CATEGORIES.filter((x) => !x.parent)) {
        const row = await db
            .insertInto("expense_categories")
            .values({
                space_id: spaces[c.space],
                envelop_id: envelopes[c.envelope],
                name: c.name,
                color: c.color,
                icon: c.icon,
                parent_id: null,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        byKey[c.key] = row.id;
    }
    for (const c of CATEGORIES.filter((x) => x.parent)) {
        const row = await db
            .insertInto("expense_categories")
            .values({
                space_id: spaces[c.space],
                envelop_id: envelopes[c.envelope],
                name: c.name,
                color: c.color,
                icon: c.icon,
                parent_id: byKey[c.parent!],
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        byKey[c.key] = row.id;
    }
    return byKey;
}

// ---------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------

async function seedEvents(
    db: ReturnType<typeof createQueryBuilder>,
    spaces: Record<SpaceKey, string>
) {
    logger.info("Events…");
    const byKey: Record<EventKey, string> = {} as Record<EventKey, string>;
    for (const e of EVENTS) {
        const row = await db
            .insertInto("events")
            .values({
                space_id: spaces[e.space],
                name: e.name,
                start_time: e.start,
                end_time: e.end,
                color: e.color,
                icon: e.icon,
                description: e.description,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        byKey[e.key] = row.id;
    }
    return byKey;
}

// ---------------------------------------------------------------------
// Envelope allocations — one per (envelope, period) for monthly; a
// single lifetime allocation for cadence='none'. A handful of account-
// pinned allocations expose the per-account partition view.
// ---------------------------------------------------------------------

async function seedEnvelopeAllocations(
    db: ReturnType<typeof createQueryBuilder>,
    users: Record<UserKey, string>,
    envelopes: Record<EnvelopeKey, string>,
    accounts: Record<AccountKey, string>
) {
    logger.info("Envelope allocations…");
    const createdBy = users.primary;
    const rows: {
        envelop_id: string;
        account_id: string | null;
        amount: number;
        period_start: Date | null;
        created_by: string;
        created_at: Date;
    }[] = [];

    for (const e of ENVELOPES) {
        const base = MONTHLY_ALLOCATION[e.key] ?? 80;
        if (e.cadence === "none") {
            // Single lifetime top-up.
            rows.push({
                envelop_id: envelopes[e.key],
                account_id: null,
                amount: base * 2,
                period_start: null,
                created_by: createdBy,
                created_at: periodStarts[0],
            });
        } else {
            for (const ps of periodStarts) {
                // Most months: a single unassigned-pool allocation at
                // the start of the month.
                rows.push({
                    envelop_id: envelopes[e.key],
                    account_id: null,
                    amount: base,
                    period_start: ps,
                    created_by: createdBy,
                    created_at: atHour(ps, 9, 0),
                });
            }
        }
    }

    // Account-pinned allocations to make the 2D matrix look used.
    // Pick a couple of envelopes and pin some of this month's budget to
    // a specific account partition.
    const thisMonth = periodStarts[periodStarts.length - 1];
    rows.push(
        {
            envelop_id: envelopes.fam_groceries,
            account_id: accounts.cash,
            amount: 200,
            period_start: thisMonth,
            created_by: createdBy,
            created_at: atHour(thisMonth, 10, 0),
        },
        {
            envelop_id: envelopes.fam_transport,
            account_id: accounts.checking,
            amount: 140,
            period_start: thisMonth,
            created_by: createdBy,
            created_at: atHour(thisMonth, 10, 15),
        },
        {
            envelop_id: envelopes.per_coffee,
            account_id: accounts.mobile,
            amount: 60,
            period_start: thisMonth,
            created_by: createdBy,
            created_at: atHour(thisMonth, 10, 30),
        }
    );

    await db.insertInto("envelop_allocations").values(rows).execute();
}

async function seedPlanAllocations(
    db: ReturnType<typeof createQueryBuilder>,
    users: Record<UserKey, string>,
    plans: Record<PlanKey, string>,
    accounts: Record<AccountKey, string>
) {
    logger.info("Plan allocations…");
    const createdBy = users.primary;
    const rows: {
        plan_id: string;
        account_id: string | null;
        amount: number;
        created_by: string;
        created_at: Date;
    }[] = [];

    // Monthly contributions — amount proportional to target.
    const contributions: Record<PlanKey, { amount: number; account: AccountKey }> = {
        plan_house: { amount: 550, account: "savings" },
        plan_vacation: { amount: 250, account: "savings" },
        plan_emergency: { amount: 400, account: "joint" },
        plan_laptop: { amount: 250, account: "checking" },
        plan_camera: { amount: 110, account: "checking" },
        plan_ac: { amount: 90, account: "shared" },
    };

    for (const p of PLANS) {
        const c = contributions[p.key];
        for (const ps of periodStarts) {
            rows.push({
                plan_id: plans[p.key],
                account_id: accounts[c.account],
                amount: c.amount,
                created_by: createdBy,
                created_at: atHour(new Date(ps.getTime() + 2 * MS_DAY), 11, 0),
            });
        }
    }

    await db.insertInto("plan_allocations").values(rows).execute();
}

// ---------------------------------------------------------------------
// Transactions — opening deposits + monthly salary + rent + bills + many
// small everyday transactions spread across the 6-month window. Some are
// tagged to events for the per-event analytics view.
// ---------------------------------------------------------------------

async function seedTransactions(
    db: ReturnType<typeof createQueryBuilder>,
    users: Record<UserKey, string>,
    spaces: Record<SpaceKey, string>,
    accounts: Record<AccountKey, string>,
    categories: Record<string, string>,
    events: Record<EventKey, string>
): Promise<number> {
    logger.info("Transactions…");
    const TX: {
        space_id: string;
        created_by: string;
        type: Transactions["type"];
        amount: number;
        source_account_id: string | null;
        destination_account_id: string | null;
        expense_category_id: string | null;
        event_id: string | null;
        description: string | null;
        location: string | null;
        transaction_datetime: Date;
    }[] = [];

    const primary = users.primary;
    const partner = users.partner;
    const roommate = users.roommate;
    const fam = spaces.family;
    const per = spaces.personal;
    const room = spaces.roommates;

    const expenseType = "expense" as unknown as Transactions["type"];
    const incomeType = "income" as unknown as Transactions["type"];
    const transferType = "transfer" as unknown as Transactions["type"];
    const adjType = "adjustment" as unknown as Transactions["type"];

    // --- 1. Opening deposits (one income per asset-type account) so
    // balances end up positive and realistic. Liability accounts start
    // at zero and accumulate as the card is used.
    const opening: Partial<Record<AccountKey, number>> = {
        cash: 800,
        checking: 5500,
        savings: 18000,
        joint: 7500,
        mobile: 600,
        shared: 4500,
        term: 12000,
        retirement: 22000,
    };
    const oldest = periodStarts[0];
    for (const a of ACCOUNTS) {
        const amount = opening[a.key];
        if (!amount || a.type === "liability") continue;
        TX.push({
            space_id: spaces[a.spaces[0]],
            created_by: primary,
            type: incomeType,
            amount,
            source_account_id: null,
            destination_account_id: accounts[a.key],
            expense_category_id: null,
            event_id: null,
            description: "Opening balance",
            location: null,
            transaction_datetime: atHour(new Date(oldest.getTime() - 5 * MS_DAY), 8),
        });
    }

    // --- 2. Monthly salaries for each month.
    for (const ps of periodStarts) {
        TX.push({
            space_id: fam,
            created_by: primary,
            type: incomeType,
            amount: 5500,
            source_account_id: null,
            destination_account_id: accounts.checking,
            expense_category_id: null,
            event_id: null,
            description: "Salary",
            location: "Payroll",
            transaction_datetime: atHour(new Date(ps.getTime() + 0 * MS_DAY), 9, 15),
        });
        TX.push({
            space_id: fam,
            created_by: partner,
            type: incomeType,
            amount: 4200,
            source_account_id: null,
            destination_account_id: accounts.joint,
            expense_category_id: null,
            event_id: null,
            description: "Salary — partner",
            location: "Payroll",
            transaction_datetime: atHour(new Date(ps.getTime() + 1 * MS_DAY), 10, 0),
        });
    }

    // --- 3. Occasional freelance income (sporadic).
    for (let i = 0; i < 5; i++) {
        const d = daysAgo(range(10, 170));
        TX.push({
            space_id: per,
            created_by: primary,
            type: incomeType,
            amount: range(800, 2500),
            source_account_id: null,
            destination_account_id: accounts.checking,
            expense_category_id: null,
            event_id: null,
            description: pick([
                "Freelance — client retainer",
                "Contract work",
                "Side project payout",
                "Consulting hours",
            ]),
            location: null,
            transaction_datetime: atHour(d, 11 + Math.floor(rng() * 6)),
        });
    }

    // --- 4. Rent — monthly on the 2nd.
    for (const ps of periodStarts) {
        TX.push({
            space_id: fam,
            created_by: primary,
            type: expenseType,
            amount: 1500,
            source_account_id: accounts.checking,
            destination_account_id: null,
            expense_category_id: categories.c_housing_rent,
            event_id: null,
            description: "Monthly rent",
            location: null,
            transaction_datetime: atHour(new Date(ps.getTime() + 1 * MS_DAY), 14),
        });
    }

    // --- 5. Utilities — family + roommates, monthly-ish.
    const utilBills: { cat: string; space: string; source: AccountKey }[] = [
        { cat: "c_util_elec", space: fam, source: "checking" },
        { cat: "c_util_water", space: fam, source: "checking" },
        { cat: "c_util_gas", space: fam, source: "checking" },
        { cat: "c_util_net", space: fam, source: "checking" },
        { cat: "c_util_mob", space: fam, source: "checking" },
        { cat: "c_rm_util_wifi", space: room, source: "shared" },
        { cat: "c_rm_util_elec", space: room, source: "shared" },
    ];
    for (const ps of periodStarts) {
        for (const b of utilBills) {
            const pool = TX_POOL[b.cat];
            const when = new Date(ps.getTime() + range(3, 9) * MS_DAY);
            TX.push({
                space_id: b.space,
                created_by: primary,
                type: expenseType,
                amount: range(pool.amt[0], pool.amt[1]),
                source_account_id: accounts[b.source],
                destination_account_id: null,
                expense_category_id: categories[b.cat],
                event_id: null,
                description: pick(pool.desc),
                location: null,
                transaction_datetime: atHour(when, range(10, 18)),
            });
        }
    }

    // --- 6. Subscriptions (personal) — monthly.
    const subs: string[] = ["c_subs_video", "c_subs_music", "c_subs_cloud"];
    for (const ps of periodStarts) {
        for (const s of subs) {
            const pool = TX_POOL[s];
            TX.push({
                space_id: per,
                created_by: primary,
                type: expenseType,
                amount: range(pool.amt[0], pool.amt[1]),
                source_account_id: accounts.credit,
                destination_account_id: null,
                expense_category_id: categories[s],
                event_id: null,
                description: pick(pool.desc),
                location: null,
                transaction_datetime: atHour(new Date(ps.getTime() + 4 * MS_DAY), 9),
            });
        }
        if (maybe(0.6)) {
            const pool = TX_POOL.c_subs_dev;
            TX.push({
                space_id: per,
                created_by: primary,
                type: expenseType,
                amount: range(pool.amt[0], pool.amt[1]),
                source_account_id: accounts.credit,
                destination_account_id: null,
                expense_category_id: categories.c_subs_dev,
                event_id: null,
                description: pick(pool.desc),
                location: null,
                transaction_datetime: atHour(new Date(ps.getTime() + 5 * MS_DAY), 10),
            });
        }
    }

    // --- 7. High-frequency everyday expenses. Walk the window day by
    // day and drop items with realistic per-category probabilities.
    const weeklyCats: {
        cat: string;
        space: string;
        source: AccountKey[];
        perWeek: number;
        creators: string[];
    }[] = [
        { cat: "c_food_veg", space: fam, source: ["cash", "checking"], perWeek: 2, creators: [primary, partner] },
        { cat: "c_food_meat", space: fam, source: ["cash", "checking"], perWeek: 1, creators: [primary, partner] },
        { cat: "c_food_dairy", space: fam, source: ["cash"], perWeek: 2, creators: [primary, partner] },
        { cat: "c_food_staples", space: fam, source: ["checking", "credit"], perWeek: 1, creators: [primary] },
        { cat: "c_rest_casual", space: fam, source: ["credit", "cash"], perWeek: 1.2, creators: [primary, partner] },
        { cat: "c_rest_quick", space: fam, source: ["cash"], perWeek: 1.5, creators: [primary] },
        { cat: "c_rest_delivery", space: fam, source: ["credit"], perWeek: 1, creators: [primary, partner] },
        { cat: "c_trans_ride", space: fam, source: ["checking", "cash"], perWeek: 3, creators: [primary, partner] },
        { cat: "c_trans_taxi", space: fam, source: ["cash"], perWeek: 2, creators: [primary] },
        { cat: "c_trans_transit", space: fam, source: ["cash"], perWeek: 1, creators: [primary] },
        { cat: "c_ent_movies", space: fam, source: ["credit"], perWeek: 0.4, creators: [primary, partner] },
        { cat: "c_ent_games", space: fam, source: ["credit"], perWeek: 0.3, creators: [primary] },
        { cat: "c_health_ph", space: fam, source: ["cash", "credit"], perWeek: 0.5, creators: [primary, partner] },
        { cat: "c_coffee", space: per, source: ["mobile", "cash"], perWeek: 3.5, creators: [primary] },
        { cat: "c_self_gym", space: per, source: ["checking"], perWeek: 0.25, creators: [primary] },
        { cat: "c_hob_photo", space: per, source: ["credit"], perWeek: 0.4, creators: [primary] },
        { cat: "c_hob_tools", space: per, source: ["credit"], perWeek: 0.3, creators: [primary] },
        { cat: "c_read", space: per, source: ["credit"], perWeek: 0.4, creators: [primary] },
        { cat: "c_rm_gro_prod", space: room, source: ["shared", "cash"], perWeek: 1.5, creators: [primary, roommate] },
        { cat: "c_rm_gro_sta", space: room, source: ["shared"], perWeek: 1, creators: [primary, roommate] },
        { cat: "c_rm_clean_det", space: room, source: ["shared"], perWeek: 0.4, creators: [roommate] },
        { cat: "c_rm_clean_srv", space: room, source: ["shared"], perWeek: 0.8, creators: [roommate] },
        { cat: "c_rm_sup", space: room, source: ["shared"], perWeek: 0.4, creators: [primary, roommate] },
    ];

    const oldestMs = periodStarts[0].getTime();
    const nowMs = NOW.getTime();
    const totalWeeks = (nowMs - oldestMs) / (7 * MS_DAY);
    for (const rule of weeklyCats) {
        const totalEvents = Math.round(rule.perWeek * totalWeeks);
        const pool = TX_POOL[rule.cat];
        for (let i = 0; i < totalEvents; i++) {
            const when = new Date(oldestMs + rng() * (nowMs - oldestMs - 3 * MS_DAY));
            TX.push({
                space_id: rule.space,
                created_by: pick(rule.creators),
                type: expenseType,
                amount: range(pool.amt[0], pool.amt[1]),
                source_account_id: accounts[pick(rule.source)],
                destination_account_id: null,
                expense_category_id: categories[rule.cat],
                event_id: null,
                description: pick(pool.desc),
                location: maybe(0.4) ? pick(GENERIC_LOCATIONS) : null,
                transaction_datetime: atHour(when, range(8, 22), range(0, 59)),
            });
        }
    }

    // --- 8. Healthcare doctor + lab — less frequent.
    for (let i = 0; i < 6; i++) {
        const cat = pick(["c_health_dr", "c_health_lab"]);
        const pool = TX_POOL[cat];
        const when = daysAgo(range(5, 175));
        TX.push({
            space_id: fam,
            created_by: pick([primary, partner]),
            type: expenseType,
            amount: range(pool.amt[0], pool.amt[1]),
            source_account_id: accounts[pick(["credit", "checking"] as AccountKey[])],
            destination_account_id: null,
            expense_category_id: categories[cat],
            event_id: null,
            description: pick(pool.desc),
            location: pick(["City Clinic", "General Hospital", "Downtown Medical"]),
            transaction_datetime: atHour(when, range(9, 18)),
        });
    }

    // --- 9. Gifts — linked to events where applicable.
    for (let i = 0; i < 8; i++) {
        const subcat = pick(["c_gifts_bday", "c_gifts_wed", "c_gifts_hol"]);
        const pool = TX_POOL[subcat];
        const when = daysAgo(range(5, 175));
        let eventId: string | null = null;
        if (subcat === "c_gifts_wed" && maybe(0.7)) eventId = events.e_wedding;
        if (subcat === "c_gifts_hol" && maybe(0.7)) eventId = events.e_holiday;
        TX.push({
            space_id: fam,
            created_by: primary,
            type: expenseType,
            amount: range(pool.amt[0], pool.amt[1]),
            source_account_id: accounts[pick(["cash", "credit", "checking"] as AccountKey[])],
            destination_account_id: null,
            expense_category_id: categories[subcat],
            event_id: eventId,
            description: pick(pool.desc),
            location: null,
            transaction_datetime: atHour(when, range(11, 20)),
        });
    }

    // --- 10. Event-tagged transactions — pack a cluster around each
    // event's date range so per-event totals look real.
    const eventSpendPlans: {
        event: EventKey;
        space: string;
        cats: string[];
        count: number;
        source: AccountKey[];
        creators: string[];
    }[] = [
        { event: "e_wedding",   space: fam,  cats: ["c_gifts_wed", "c_rest_fine", "c_trans_ride"], count: 8, source: ["credit", "checking"], creators: [primary, partner] },
        { event: "e_beach",     space: fam,  cats: ["c_rest_casual", "c_rest_delivery", "c_trans_ride", "c_food_meat"], count: 12, source: ["credit", "cash"], creators: [primary, partner] },
        { event: "e_holiday",   space: fam,  cats: ["c_gifts_hol", "c_food_staples", "c_rest_casual"], count: 9, source: ["cash", "checking"], creators: [primary, partner] },
        { event: "e_paint",     space: fam,  cats: ["c_gifts_bday", "c_rest_delivery"], count: 5, source: ["credit"], creators: [primary] },
        { event: "e_conf",      space: per,  cats: ["c_coffee", "c_read", "c_hob_tools"], count: 6, source: ["mobile", "credit"], creators: [primary] },
        { event: "e_house",     space: room, cats: ["c_rm_gro_prod", "c_rm_sup"], count: 5, source: ["shared"], creators: [primary, roommate] },
    ];
    for (const plan of eventSpendPlans) {
        const ev = EVENTS.find((e) => e.key === plan.event)!;
        for (let i = 0; i < plan.count; i++) {
            const cat = pick(plan.cats);
            const pool = TX_POOL[cat];
            const span = ev.end.getTime() - ev.start.getTime();
            const when = new Date(ev.start.getTime() + rng() * span);
            TX.push({
                space_id: plan.space,
                created_by: pick(plan.creators),
                type: expenseType,
                amount: range(pool.amt[0], pool.amt[1]),
                source_account_id: accounts[pick(plan.source)],
                destination_account_id: null,
                expense_category_id: categories[cat],
                event_id: events[plan.event],
                description: pick(pool.desc),
                location: null,
                transaction_datetime: atHour(when, range(9, 22)),
            });
        }
    }

    // --- 11. Transfers — monthly savings move + wallet top-ups + CC bill.
    for (const ps of periodStarts) {
        TX.push({
            space_id: fam,
            created_by: primary,
            type: transferType,
            amount: 800,
            source_account_id: accounts.checking,
            destination_account_id: accounts.savings,
            expense_category_id: null,
            event_id: null,
            description: "Monthly savings transfer",
            location: null,
            transaction_datetime: atHour(new Date(ps.getTime() + 3 * MS_DAY), 10),
        });
        // Multiple wallet top-ups per month — cash spending is frequent
        // and realistic top-ups are a few times a month.
        for (let i = 0; i < 3; i++) {
            TX.push({
                space_id: fam,
                created_by: primary,
                type: transferType,
                amount: range(250, 450),
                source_account_id: accounts.checking,
                destination_account_id: accounts.cash,
                expense_category_id: null,
                event_id: null,
                description: "Wallet top-up",
                location: null,
                transaction_datetime: atHour(
                    new Date(ps.getTime() + (6 + i * 8) * MS_DAY),
                    range(10, 18)
                ),
            });
        }
        // CC payoff — transfer from checking to credit (reduces liability).
        TX.push({
            space_id: fam,
            created_by: primary,
            type: transferType,
            amount: range(450, 900),
            source_account_id: accounts.checking,
            destination_account_id: accounts.credit,
            expense_category_id: null,
            event_id: null,
            description: "Credit card payment",
            location: null,
            transaction_datetime: atHour(new Date(ps.getTime() + 14 * MS_DAY), 15),
        });
    }

    // --- 12. A couple of adjustments (reconciliation).
    TX.push({
        space_id: fam,
        created_by: primary,
        type: adjType,
        amount: 8,
        source_account_id: accounts.cash,
        destination_account_id: null,
        expense_category_id: null,
        event_id: null,
        description: "Reconcile wallet — counted short",
        location: null,
        transaction_datetime: atHour(daysAgo(range(30, 90)), 21),
    });
    TX.push({
        space_id: per,
        created_by: primary,
        type: adjType,
        amount: 3,
        source_account_id: null,
        destination_account_id: accounts.mobile,
        expense_category_id: null,
        event_id: null,
        description: "Cashback credited — matched in app",
        location: null,
        transaction_datetime: atHour(daysAgo(range(10, 60)), 17),
    });

    // Sort by datetime so indexes build cleanly and the histogram views
    // look natural.
    TX.sort((a, b) => a.transaction_datetime.getTime() - b.transaction_datetime.getTime());

    // Insert in chunks — Postgres parameter limit is 65535.
    const CHUNK = 500;
    for (let i = 0; i < TX.length; i += CHUNK) {
        await db.insertInto("transactions").values(TX.slice(i, i + CHUNK)).execute();
    }
    return TX.length;
}

// ---------------------------------------------------------------------

// // When invoked directly (e.g. via `tsx src/db/kysely/seed.mts`), run.
// // When imported from bootstrap, the caller drives when to execute.
// const invokedDirectly =
//     import.meta.url === `file://${process.argv[1]}` ||
//     process.argv[1]?.endsWith("/seed.mts") ||
//     process.argv[1]?.endsWith("/seed.mjs");

// if (invokedDirectly) {
//     seedDatabase().catch((err: unknown) => {
//         logger.error("Seed failed");
//         console.error(err);
//         process.exit(1);
//     });
// }
