/*
  calc.js — DATES and the MATH: e1RM, PRs, stalls, volume.
  These functions only read data and return answers. They never change
  anything on screen, which makes them easy to reason about.
*/


// =====================================================================
// DATES
// Dates are stored as "YYYY-MM-DD" text. Handy trick: sorting that text
// alphabetically also sorts it by date, and "<" / ">" compare correctly.
// =====================================================================

// Date object -> "YYYY-MM-DD" (local time, not UTC)
function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // months start at 0!
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayString() {
  return toDateString(new Date());
}

// "YYYY-MM-DD" -> Date object at midnight local time
function parseDate(text) {
  const [year, month, day] = text.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// "2026-11-24" plus 3 days -> "2026-11-27"
function addDays(text, days) {
  const date = parseDate(text);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

// Whole days from date a to date b
function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / (1000 * 60 * 60 * 24));
}

// The Monday that starts the week containing this date
function weekStart(text) {
  const daysSinceMonday = (parseDate(text).getDay() + 6) % 7; // Sun=6, Mon=0
  return addDays(text, -daysSinceMonday);
}

// "Nov 24"
function formatShortDate(text) {
  return parseDate(text).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// "Mon, Nov 24" (adds the year if it isn't this year)
function formatLongDate(text) {
  const date = parseDate(text);
  const options = { weekday: "short", month: "short", day: "numeric" };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
  return date.toLocaleDateString(undefined, options);
}


// =====================================================================
// WORKOUT LOOKUPS
// =====================================================================

// Sort rule: older date first; same date -> the one created first.
function compareWorkouts(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.id - b.id;
}

// All workouts, oldest first (a sorted copy; the original isn't changed)
function sortedWorkouts(data) {
  return [...data.workouts].sort(compareWorkouts);
}

// Workouts with start <= date < end, oldest first
function workoutsInRange(data, start, end) {
  return sortedWorkouts(data).filter((w) => w.date >= start && w.date < end);
}

// Every time you did one lift, oldest first:
//   [ { workoutId, date, sets: [...] }, ... ]
function liftHistory(data, lift) {
  const history = [];
  for (const workout of sortedWorkouts(data)) {
    for (const exercise of workout.exercises) {
      if (exercise.lift === lift && exercise.sets.length > 0) {
        history.push({ workoutId: workout.id, date: workout.date, sets: exercise.sets });
      }
    }
  }
  return history;
}


// =====================================================================
// ESTIMATED 1-REP MAX (Epley formula)
//   e1RM = weight × (1 + reps / 30)
// e.g. 225 lbs × 5 reps -> 225 × (1 + 5/30) = 262.5 lbs
// It estimates the most you could lift for a single rep.
// =====================================================================

function e1rm(set) {
  if (set.reps <= 0) return 0;
  if (set.reps === 1) return set.weight; // a single IS your 1-rep max
  return set.weight * (1 + set.reps / 30);
}

// Highest e1RM among a list of sets
function bestE1rm(sets) {
  return Math.max(0, ...sets.map(e1rm));
}


// =====================================================================
// PERSONAL RECORDS
// A PR = heavier than any earlier set of the same lift at the SAME rep
// count. (Your first-ever set at a rep count isn't flagged: nothing to
// beat yet.)
//
// We walk through every lift's history oldest -> newest, remembering the
// best weight seen so far at each rep count. Returns a list like:
//   [ { lift, date, workoutId, setIndex, reps, weight }, ... ]
// =====================================================================

function findPRs(data) {
  const prs = [];

  // Every lift that appears anywhere in your data
  const lifts = new Set();
  data.workouts.forEach((w) => w.exercises.forEach((ex) => lifts.add(ex.lift)));

  for (const lift of lifts) {
    const bestByReps = {}; // e.g. { 5: 225, 3: 245 }

    for (const entry of liftHistory(data, lift)) {
      entry.sets.forEach((set, setIndex) => {
        const previousBest = bestByReps[set.reps];

        if (previousBest !== undefined && set.weight > previousBest) {
          prs.push({ lift, date: entry.date, workoutId: entry.workoutId, setIndex, reps: set.reps, weight: set.weight });
        }
        if (previousBest === undefined || set.weight > previousBest) {
          bestByReps[set.reps] = set.weight;
        }
      });
    }
  }
  return prs;
}

// Best weight at each rep count for one lift, sorted by reps:
//   [ { reps: 1, weight: 275, date }, { reps: 5, weight: 225, date }, ... ]
function repRecords(data, lift) {
  const records = {};
  for (const entry of liftHistory(data, lift)) {
    for (const set of entry.sets) {
      if (!records[set.reps] || set.weight > records[set.reps].weight) {
        records[set.reps] = { reps: set.reps, weight: set.weight, date: entry.date };
      }
    }
  }
  return Object.values(records).sort((a, b) => a.reps - b.reps);
}

// The single best e1RM ever for a lift, and which set produced it.
// Returns null if you've never done the lift.
function bestE1rmEver(data, lift) {
  let best = null;
  for (const entry of liftHistory(data, lift)) {
    for (const set of entry.sets) {
      const value = e1rm(set);
      if (!best || value > best.value) best = { value, set, date: entry.date };
    }
  }
  return best;
}


// =====================================================================
// STALL DETECTION
// "Progress" = your best e1RM going up. Using e1RM (not just weight)
// means 225×6 after 225×5 counts as progress too.
// If your best hasn't improved in STALL_DAYS, the lift is stalled.
// =====================================================================

const STALL_DAYS = 21;

function isStalled(data, lift) {
  const history = liftHistory(data, lift);
  if (history.length < 2) return false; // not enough data to judge

  let best = 0;
  let lastImprovedOn = history[0].date;
  for (const entry of history) {
    const value = bestE1rm(entry.sets);
    if (value > best) {
      best = value;
      lastImprovedOn = entry.date;
    }
  }
  return daysBetween(lastImprovedOn, todayString()) >= STALL_DAYS;
}


// =====================================================================
// VOLUME = sets × reps × weight, added up
// (Each set is listed separately, so it's just reps × weight per set.)
// =====================================================================

function workoutVolume(workout) {
  let total = 0;
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) total += set.reps * set.weight;
  }
  return total;
}

// Total volume for the 7 days starting on `start` (a Monday)
function weekVolume(data, start) {
  return workoutsInRange(data, start, addDays(start, 7))
    .reduce((total, workout) => total + workoutVolume(workout), 0);
}


// =====================================================================
// BODYWEIGHT
// =====================================================================

// Bodyweight entries, oldest first
function sortedBodyweight(data) {
  return [...data.bodyweight].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
