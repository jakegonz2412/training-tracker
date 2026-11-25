/*
  storage.js — SAVING, LOADING, and BACKUPS.

  Everything the app knows lives in one object called `data`:

    {
      version: 2,
      workouts: [
        {
          id: 1732400000000,            // unique number (time it was created)
          date: "2026-11-24",           // year-month-day
          notes: "Slept 8h, felt strong",
          exercises: [
            { lift: "Squat", sets: [ { reps: 5, weight: 225 }, ... ] },
            { lift: "Bench press", sets: [ ... ] }
          ]
        }
      ],
      bodyweight: [ { id: 1732400000001, date: "2026-11-24", weight: 182.4 } ]
    }

  The first version of this app saved one entry per lift instead of one
  per workout. migrateV1() below converts that old format automatically,
  so nothing you logged before is lost.
*/


// =====================================================================
// SETTINGS
// =====================================================================

// The lifts you track. Add a name here and it shows up everywhere.
const LIFTS = [
  "Squat",
  "Bench press",
  "Incline bench press",
  "Barbell lunge",
  "Dumbbell press",
  "Overhead barbell press",
"Deadlift",
];

// Names the data is saved under in the browser's storage (localStorage).
const STORAGE_KEY = "training-tracker-data";          // current format
const OLD_STORAGE_KEY = "training-tracker-sessions";  // version 1 format
const DRAFT_KEY = "training-tracker-draft";           // workout in progress


// =====================================================================
// LOADING AND SAVING
// localStorage only stores text, so we convert to text (JSON) and back.
// =====================================================================

function emptyData() {
  return { version: 2, workouts: [], bodyweight: [] };
}

function loadData() {
  try {
    // 1. Already using the new format? Load it.
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeData(JSON.parse(saved));

    // 2. Have data from the first version of the app? Convert it.
    //    (The old copy is left untouched, just in case.)
    const old = localStorage.getItem(OLD_STORAGE_KEY);
    if (old) {
      const migrated = migrateV1(JSON.parse(old));
      saveData(migrated);
      return migrated;
    }
  } catch (error) {
    // Saved data was unreadable. Keep a copy of it under another name
    // so it isn't overwritten, then start fresh.
    console.error("Could not read saved data:", error);
    localStorage.setItem(STORAGE_KEY + "-unreadable", localStorage.getItem(STORAGE_KEY));
  }

  // 3. Nothing saved yet: start empty.
  return emptyData();
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}


// =====================================================================
// CONVERTING OLD DATA
// =====================================================================

// Version 1 stored a flat list like:
//   [ { id, lift: "Squat", date: "2026-11-20", sets: [...] }, ... ]
// We group entries from the same date into one workout.
function migrateV1(oldSessions) {
  const workoutsByDate = {}; // date -> workout

  // Oldest first, so sets stay in the order you logged them
  const sorted = [...oldSessions].sort((a, b) =>
    a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1
  );

  for (const session of sorted) {
    // Find (or create) the workout for this date
    let workout = workoutsByDate[session.date];
    if (!workout) {
      workout = { id: session.id, date: session.date, notes: "", exercises: [] };
      workoutsByDate[session.date] = workout;
    }

    // Find (or create) this lift inside the workout, then add the sets
    let exercise = workout.exercises.find((ex) => ex.lift === session.lift);
    if (!exercise) {
      exercise = { lift: session.lift, sets: [] };
      workout.exercises.push(exercise);
    }
    exercise.sets.push(...session.sets);
  }

  return normalizeData({ workouts: Object.values(workoutsByDate), bodyweight: [] });
}

// Make sure data (from storage OR from an imported file) has the right
// shape, with real numbers where numbers belong. Throws an error if the
// data isn't something we recognize.
function normalizeData(raw) {
  if (Array.isArray(raw)) return migrateV1(raw); // a version 1 backup

  if (!raw || !Array.isArray(raw.workouts)) {
    throw new Error("This file doesn't look like a Training Tracker backup.");
  }

  const isDate = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text);

  return {
    version: 2,
    workouts: raw.workouts
      .filter((w) => isDate(w.date))
      .map((w, i) => ({
        id: Number(w.id) || Date.now() + i,
        date: w.date,
        notes: w.notes ? String(w.notes) : "",
        exercises: (w.exercises || []).map((ex) => ({
          lift: String(ex.lift),
          sets: (ex.sets || []).map((s) => ({ reps: Number(s.reps), weight: Number(s.weight) })),
        })),
      })),
    bodyweight: (raw.bodyweight || [])
      .filter((b) => isDate(b.date))
      .map((b, i) => ({
        id: Number(b.id) || Date.now() + i,
        date: b.date,
        weight: Number(b.weight),
      })),
  };
}


// =====================================================================
// THE WORKOUT IN PROGRESS ("draft")
// Saved separately so you can switch tabs, lock your phone, or close the
// page between sets without losing what you've typed.
// Inputs hold text while you type, so reps/weight are strings here.
// =====================================================================

function newDraft() {
  return {
    editingId: null,   // null = new workout; a number = editing that workout
    date: todayString(),
    notes: "",
    exercises: [],     // [{ lift, sets: [{ reps: "5", weight: "225" }] }]
  };
}

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (saved && Array.isArray(saved.exercises)) return saved;
  } catch (error) {
    console.error("Could not read draft:", error);
  }
  return newDraft();
}

function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}


// =====================================================================
// BACKUP: EXPORT AND IMPORT
// =====================================================================

// Download all data as a .json file.
function exportBackup(data) {
  const json = JSON.stringify(data, null, 2); // pretty-printed, readable
  const file = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(file);

  // Create an invisible download link, click it, then clean up.
  const link = document.createElement("a");
  link.href = url;
  link.download = `training-tracker-backup-${todayString()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Read a chosen backup file and return the data inside it.
// `async` means this takes a moment (reading a file), so callers `await` it.
async function readBackupFile(file) {
  const text = await file.text();
  return normalizeData(JSON.parse(text));
}
