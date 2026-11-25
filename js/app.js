/*
  app.js — the SCREENS and what happens when you tap things.

  How it works, in three ideas:
    1. STATE: a few variables hold what the app knows (your data, the
       open screen, the workout you're logging).
    2. RENDER: each screen has a render function that builds its HTML
       from the state. After any change we just call render() again.
    3. ACTIONS: buttons carry a data-action="..." attribute. One click
       listener at the bottom looks up that name in the `actions` object
       and runs the matching function. No need to wire up every button.
*/


// =====================================================================
// 1. STATE
// =====================================================================

let data = loadData();           // all workouts + bodyweight (storage.js)
let draft = loadDraft();         // the workout you're logging right now
let currentView = "home";        // which tab is open
let progressTab = LIFTS[0];      // which lift (or "Bodyweight") Progress shows

// A draft left over from an earlier day with nothing in it? Reset its date.
if (!draftHasContent() && draft.editingId === null) draft = newDraft();

const view = document.getElementById("view");
const toast = document.getElementById("toast");


// =====================================================================
// 2. SMALL HELPERS
// =====================================================================

// Anything YOU typed (like notes) must be escaped before going into HTML,
// otherwise a "<" in your notes could break the page.
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 1234.5 -> "1,234.5", 225 -> "225"
function fmt(number) {
  return Number(number).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// plural(1, "set") -> "1 set", plural(3, "set") -> "3 sets"
function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Show a message above the tab bar for a few seconds
let toastTimer;
function showToast(html, ms = 3000) {
  toast.innerHTML = html;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), ms);
}

// Save data and redraw the current screen
function saveAndRender() {
  saveData(data);
  render();
}

// Does the workout being logged have anything in it?
function draftHasContent() {
  return draft.exercises.length > 0 || draft.notes.trim() !== "";
}

// Turn saved sets (numbers) into draft sets (text for the inputs)
function toDraftSets(sets) {
  return sets.map((set) => ({ reps: String(set.reps), weight: String(set.weight) }));
}

// Only the draft sets that are filled in properly, as numbers
function completeSets(draftSets) {
  return draftSets
    .filter((s) => s.reps !== "" && s.weight !== "")
    .map((s) => ({ reps: Number(s.reps), weight: Number(s.weight) }))
    .filter((s) => s.reps >= 1 && s.weight >= 0);
}


// =====================================================================
// 3. NAVIGATION
// =====================================================================

function navigate(viewName) {
  currentView = viewName;
  window.scrollTo(0, 0);
  render();
}

// Draw whichever screen is open, and highlight its tab
function render() {
  document.querySelectorAll(".tab-bar button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === currentView);
  });

  if (currentView === "home") renderHome();
  if (currentView === "log") renderLog();
  if (currentView === "history") renderHistory();
  if (currentView === "progress") renderProgress();
  if (currentView === "backup") renderBackup();
}


// =====================================================================
// 4. HOME (dashboard)
// =====================================================================

function renderHome() {
  const today = todayString();
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);

  // This week's workouts, newest first
  const weekWorkouts = workoutsInRange(data, thisWeek, addDays(thisWeek, 7)).reverse();

  // Volume this week vs last week
  const volume = weekVolume(data, thisWeek);
  const lastVolume = weekVolume(data, lastWeek);
  let volumeChange = "";
  if (lastVolume > 0 && volume === 0) {
    // Nothing yet this week: show last week's total instead of "-100%"
    volumeChange = `<div class="stat-sub">Last week: ${fmt(Math.round(lastVolume))}</div>`;
  } else if (lastVolume > 0) {
    const percent = Math.round(((volume - lastVolume) / lastVolume) * 100);
    volumeChange = `<div class="stat-sub ${percent > 0 ? "up" : ""}">${percent > 0 ? "+" : ""}${percent}% vs last week</div>`;
  } else {
    volumeChange = `<div class="stat-sub">lbs lifted</div>`;
  }

  // Most recent 5 PRs, newest first
  const recentPRs = findPRs(data)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 5);

  const stalledLifts = LIFTS.filter((lift) => isStalled(data, lift));

  // Latest bodyweight, and the change since the entry before it
  const weights = sortedBodyweight(data);
  const latest = weights[weights.length - 1];
  const previous = weights[weights.length - 2];
  let weightChange = "";
  if (latest && previous) {
    const diff = latest.weight - previous.weight;
    weightChange = ` · ${diff >= 0 ? "+" : ""}${fmt(diff)} since ${formatShortDate(previous.date)}`;
  }

  view.innerHTML = `
    <header class="page-header">
      <p class="eyebrow">${formatLongDate(today)}</p>
      <h1>Dashboard</h1>
    </header>

    <button class="btn btn-primary btn-block" data-action="nav" data-view="log">
      ${draftHasContent() ? "Continue workout" : "Start workout"}
    </button>

    <div class="stat-grid">
      <section class="card">
        <h2 class="card-title">This week</h2>
        <div class="stat-value">${weekWorkouts.length}</div>
        <div class="stat-sub">${weekWorkouts.length === 1 ? "session" : "sessions"}</div>
      </section>
      <section class="card">
        <h2 class="card-title">Volume</h2>
        <div class="stat-value">${fmt(Math.round(volume))}</div>
        ${volumeChange}
      </section>
    </div>

    ${stalledLifts.length ? `
      <section class="card card-warn">
        <h2 class="card-title">⚠ Stalled 3+ weeks</h2>
        <ul class="list">
          ${stalledLifts.map((lift) => `
            <li class="list-item">
              <span class="list-main">${escapeHTML(lift)}</span>
              <span class="list-sub">Try a deload or new rep range</span>
            </li>`).join("")}
        </ul>
      </section>` : ""}

    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Bodyweight</h2>
        <button class="btn btn-ghost" data-action="open-bodyweight">Chart →</button>
      </div>
      <div class="stat-value">${latest ? fmt(latest.weight) : "—"}<span class="stat-unit">lbs</span></div>
      <div class="stat-sub">${latest ? `${formatShortDate(latest.date)}${weightChange}` : "No entries yet"}</div>
      <form class="inline-form" data-form="bodyweight-quick" style="margin-top: 12px">
        <input class="input" name="weight" type="number" inputmode="decimal" step="any" min="0"
               placeholder="Today's weight" aria-label="Today's bodyweight" required>
        <button class="btn btn-secondary" type="submit">Log</button>
      </form>
    </section>

    <section class="card">
      <h2 class="card-title" style="margin-bottom: 12px">Recent PRs</h2>
      ${recentPRs.length ? `
        <ul class="list">
          ${recentPRs.map((pr) => `
            <li class="list-item">
              <div>
                <div class="list-main">${escapeHTML(pr.lift)}</div>
                <div class="list-sub">${formatShortDate(pr.date)}</div>
              </div>
              <span class="list-value">${fmt(pr.weight)} × ${pr.reps} <span class="badge">PR</span></span>
            </li>`).join("")}
        </ul>` : `<p class="empty">No PRs yet. Beat a previous weight at the same reps to earn one.</p>`}
    </section>

    <section class="card">
      <h2 class="card-title" style="margin-bottom: 12px">This week's sessions</h2>
      ${weekWorkouts.length ? `
        <div class="list">
          ${weekWorkouts.map((w) => `
            <button class="list-item" data-action="edit-workout" data-id="${w.id}">
              <div>
                <div class="list-main">${formatLongDate(w.date)}</div>
                <div class="list-sub">${w.exercises.map((ex) => escapeHTML(ex.lift)).join(", ")}</div>
              </div>
              <span class="list-value">${fmt(Math.round(workoutVolume(w)))} lbs</span>
            </button>`).join("")}
        </div>` : `<p class="empty">Nothing logged this week yet.</p>`}
    </section>
  `;
}


// =====================================================================
// 5. LOG (log a whole workout, or edit an old one)
// =====================================================================

function renderLog() {
  const editing = draft.editingId !== null;
  const lastWorkout = sortedWorkouts(data).at(-1);

  // Lifts you can still add (the ones not already in this workout)
  const usedLifts = draft.exercises.map((ex) => ex.lift);
  const availableLifts = LIFTS.filter((lift) => !usedLifts.includes(lift));

  view.innerHTML = `
    <header class="page-header">
      <p class="eyebrow">${editing ? "Editing" : "New session"}</p>
      <h1>${editing ? "Edit workout" : "Log workout"}</h1>
    </header>

    <section class="card">
      <label class="label" for="draft-date">Date</label>
      <input id="draft-date" class="input" type="date" value="${escapeHTML(draft.date)}" data-draft="date">
    </section>

    ${!editing && lastWorkout ? `
      <button class="btn btn-secondary btn-block" data-action="repeat-last">
        ↻ Repeat last workout <span class="muted">(${formatShortDate(lastWorkout.date)})</span>
      </button>` : ""}

    ${draft.exercises.map(exerciseCard).join("")}

    ${availableLifts.length ? `
      <section class="card">
        <h2 class="card-title" style="margin-bottom: 12px">Add exercise</h2>
        <div class="chips">
          ${availableLifts.map((lift) => `
            <button class="chip" data-action="add-exercise" data-lift="${escapeHTML(lift)}">+ ${escapeHTML(lift)}</button>
          `).join("")}
        </div>
      </section>` : ""}

    <section class="card">
      <label class="label" for="draft-notes">Notes <span class="muted">(optional)</span></label>
      <textarea id="draft-notes" class="input textarea" rows="3" data-draft="notes"
                placeholder="Sleep, energy, how it felt…">${escapeHTML(draft.notes)}</textarea>
    </section>

    <button class="btn btn-primary btn-block" data-action="save-workout">
      ${editing ? "Save changes" : "Finish workout"}
    </button>

    ${editing ? `
      <div class="button-row">
        <button class="btn btn-secondary" data-action="cancel-edit">Cancel</button>
        <button class="btn btn-danger" data-action="delete-workout" data-id="${draft.editingId}">Delete workout</button>
      </div>`
    : draftHasContent() ? `
      <div class="button-row">
        <button class="btn btn-danger" data-action="discard-draft">Discard workout</button>
      </div>` : ""}
  `;
}

// One card per exercise, with a row of big inputs for each set.
// The faint placeholder numbers are what you did LAST time for that set.
function exerciseCard(exercise, exIndex) {
  const history = liftHistory(data, exercise.lift).filter((h) => h.workoutId !== draft.editingId);
  const lastSets = history.length ? history[history.length - 1].sets : [];

  const rows = exercise.sets.map((set, setIndex) => {
    const hint = lastSets[setIndex] || lastSets[lastSets.length - 1] || { reps: "reps", weight: "lbs" };
    return `
      <div class="set-row">
        <span class="set-num">${setIndex + 1}</span>
        <input class="input set-input" type="number" inputmode="numeric" min="1" step="1"
               value="${escapeHTML(set.reps)}" placeholder="${hint.reps}" aria-label="Set ${setIndex + 1} reps"
               data-draft="reps" data-ex="${exIndex}" data-set="${setIndex}">
        <span class="times">×</span>
        <input class="input set-input" type="number" inputmode="decimal" min="0" step="any"
               value="${escapeHTML(set.weight)}" placeholder="${hint.weight}" aria-label="Set ${setIndex + 1} weight"
               data-draft="weight" data-ex="${exIndex}" data-set="${setIndex}">
        <button class="icon-btn" data-action="remove-set" data-ex="${exIndex}" data-set="${setIndex}"
                aria-label="Remove set ${setIndex + 1}">✕</button>
      </div>`;
  }).join("");

  return `
    <section class="card exercise">
      <div class="card-head">
        <h2 class="card-title">${escapeHTML(exercise.lift)}</h2>
        <button class="icon-btn" data-action="remove-exercise" data-ex="${exIndex}"
                aria-label="Remove ${escapeHTML(exercise.lift)}">✕</button>
      </div>
      <div class="set-labels"><span></span><span>Reps</span><span></span><span>Lbs</span><span></span></div>
      ${rows}
      <div class="exercise-foot">
        <button class="btn btn-ghost" data-action="add-set" data-ex="${exIndex}">+ Add set</button>
        <span class="muted small" id="e1rm-${exIndex}">${e1rmLabel(exercise)}</span>
      </div>
    </section>`;
}

// "e1RM 262" for the best set typed so far
function e1rmLabel(exercise) {
  const sets = completeSets(exercise.sets);
  return sets.length ? `e1RM ${fmt(Math.round(bestE1rm(sets)))}` : "";
}

// Check the draft and save it as a workout
function saveWorkout() {
  const exercises = [];

  for (const exercise of draft.exercises) {
    const sets = [];
    for (const set of exercise.sets) {
      if (set.reps === "" && set.weight === "") continue; // skip empty rows

      const reps = Number(set.reps);
      const weight = Number(set.weight);
      if (!Number.isInteger(reps) || reps < 1 || set.weight === "" || !(weight >= 0)) {
        alert(`Check your ${exercise.lift} sets: each one needs whole-number reps and a weight.`);
        return;
      }
      sets.push({ reps, weight });
    }
    if (sets.length) exercises.push({ lift: exercise.lift, sets });
  }

  if (!draft.date) return alert("Pick a date for this workout.");
  if (!exercises.length) return alert("Add at least one set before saving.");

  const editing = draft.editingId !== null;
  const workout = {
    id: editing ? draft.editingId : Date.now(),
    date: draft.date,
    notes: draft.notes.trim(),
    exercises,
  };

  if (editing) {
    // Swap the old version of this workout for the new one
    data.workouts = data.workouts.map((w) => (w.id === workout.id ? workout : w));
  } else {
    data.workouts.push(workout);
  }
  saveData(data);

  // Celebrate any PRs set in this workout
  const prs = findPRs(data).filter((pr) => pr.workoutId === workout.id);
  let message = editing ? "Workout updated." : `Workout saved · ${plural(exercises.length, "exercise")}.`;
  for (const pr of prs) {
    message += `<div class="pr-line">🏆 PR: ${escapeHTML(pr.lift)} ${fmt(pr.weight)} × ${pr.reps}</div>`;
  }
  showToast(message, prs.length ? 6000 : 3000);

  // Clear the draft and go back
  draft = newDraft();
  saveDraft(draft);
  navigate(editing ? "history" : "home");
}


// =====================================================================
// 6. HISTORY (every workout, newest first; tap Edit to fix typos)
// =====================================================================

function renderHistory() {
  const workouts = sortedWorkouts(data).reverse();

  // A quick way to ask "was this set a PR?": a Set of "workoutId|lift|setIndex"
  const prKeys = new Set(findPRs(data).map((pr) => `${pr.workoutId}|${pr.lift}|${pr.setIndex}`));

  view.innerHTML = `
    <header class="page-header">
      <p class="eyebrow">${plural(workouts.length, "workout")}</p>
      <h1>History</h1>
    </header>

    ${workouts.length ? workouts.map((w) => `
      <section class="card">
        <div class="card-head">
          <div>
            <div class="list-main">${formatLongDate(w.date)}</div>
            <div class="list-sub">${fmt(Math.round(workoutVolume(w)))} lbs volume</div>
          </div>
        </div>

        ${w.notes ? `<p class="notes">${escapeHTML(w.notes)}</p>` : ""}

        ${w.exercises.map((ex) => `
          <div class="exercise-block">
            <div class="exercise-line">
              <span>${escapeHTML(ex.lift)}</span>
              <span class="muted small">e1RM ${fmt(Math.round(bestE1rm(ex.sets)))}</span>
            </div>
            <div class="set-pills">
              ${ex.sets.map((set, i) => {
                const isPR = prKeys.has(`${w.id}|${ex.lift}|${i}`);
                return `<span class="set-pill ${isPR ? "pr" : ""}">${set.reps} × ${fmt(set.weight)}${isPR ? " PR" : ""}</span>`;
              }).join("")}
            </div>
          </div>`).join("")}

        <div class="button-row">
          <button class="btn btn-secondary" data-action="edit-workout" data-id="${w.id}">Edit</button>
          <button class="btn btn-danger" data-action="delete-workout" data-id="${w.id}">Delete</button>
        </div>
      </section>`).join("")
    : `<section class="card"><p class="empty">No workouts yet. Tap Log to record your first one.</p></section>`}
  `;
}


// =====================================================================
// 7. PROGRESS (e1RM per lift, and bodyweight)
// =====================================================================

function renderProgress() {
  const tabs = [...LIFTS, "Bodyweight"];

  view.innerHTML = `
    <header class="page-header">
      <h1>Progress</h1>
    </header>
    <div class="chips chips-scroll">
      ${tabs.map((name) => `
        <button class="chip ${name === progressTab ? "active" : ""}" data-action="progress-tab" data-tab="${escapeHTML(name)}">
          ${escapeHTML(name)}
        </button>`).join("")}
    </div>
    ${progressTab === "Bodyweight" ? bodyweightSection() : liftSection(progressTab)}
  `;

  // Slide the chip row so the selected chip is visible
  document.querySelector(".chip.active").scrollIntoView({ inline: "center", block: "nearest" });
  drawProgressChart();
}

function liftSection(lift) {
  const history = liftHistory(data, lift);
  if (!history.length) {
    return `<section class="card"><p class="empty">No ${escapeHTML(lift)} logged yet.</p></section>`;
  }

  const best = bestE1rmEver(data, lift);
  const records = repRecords(data, lift);

  return `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Best estimated 1RM</h2>
        ${isStalled(data, lift) ? `<span class="badge badge-warn">STALLED</span>` : ""}
      </div>
      <div class="stat-value">${fmt(Math.round(best.value))}<span class="stat-unit">lbs</span></div>
      <div class="stat-sub">from ${fmt(best.set.weight)} × ${best.set.reps} on ${formatShortDate(best.date)}</div>
    </section>

    <section class="card">
      <h2 class="card-title" style="margin-bottom: 12px">e1RM per session</h2>
      ${history.length >= 2
        ? `<canvas id="chart" class="chart"></canvas>`
        : `<p class="empty">Log one more session to see the chart.</p>`}
    </section>

    <section class="card">
      <h2 class="card-title" style="margin-bottom: 12px">Best weight at each rep count</h2>
      <ul class="list">
        ${records.map((r) => `
          <li class="list-item">
            <span class="list-main">${plural(r.reps, "rep")}</span>
            <span class="list-sub">${formatShortDate(r.date)}</span>
            <span class="list-value">${fmt(r.weight)} lbs</span>
          </li>`).join("")}
      </ul>
    </section>
  `;
}

function bodyweightSection() {
  const entries = sortedBodyweight(data);

  return `
    <section class="card">
      <h2 class="card-title" style="margin-bottom: 12px">Log bodyweight</h2>
      <form data-form="bodyweight-full">
        <input class="input" name="date" type="date" value="${todayString()}" aria-label="Date" required
               style="margin-bottom: 8px">
        <div class="inline-form">
          <input class="input" name="weight" type="number" inputmode="decimal" step="any" min="0"
                 placeholder="Weight (lbs)" aria-label="Bodyweight in lbs" required>
          <button class="btn btn-secondary" type="submit">Log</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2 class="card-title" style="margin-bottom: 12px">Bodyweight over time</h2>
      ${entries.length >= 2
        ? `<canvas id="chart" class="chart"></canvas>`
        : `<p class="empty">Log at least 2 days to see the chart.</p>`}
    </section>

    ${entries.length ? `
      <section class="card">
        <h2 class="card-title" style="margin-bottom: 12px">Entries</h2>
        <ul class="list">
          ${[...entries].reverse().map((entry) => `
            <li class="list-item">
              <span class="list-main">${formatLongDate(entry.date)}</span>
              <span>
                <span class="list-value">${fmt(entry.weight)} lbs</span>
                <button class="icon-btn" data-action="delete-bodyweight" data-id="${entry.id}"
                        aria-label="Delete entry">✕</button>
              </span>
            </li>`).join("")}
        </ul>
      </section>` : ""}
  `;
}

// The chart can only be drawn once its <canvas> is on screen
function drawProgressChart() {
  const canvas = document.getElementById("chart");
  if (!canvas) return;

  const points = progressTab === "Bodyweight"
    ? sortedBodyweight(data).map((b) => ({ date: b.date, value: b.weight }))
    : liftHistory(data, progressTab).map((h) => ({ date: h.date, value: bestE1rm(h.sets) }));

  drawLineChart(canvas, points);
}

// Add or update the bodyweight for a day (one entry per day)
function logBodyweight(date, weight) {
  const existing = data.bodyweight.find((b) => b.date === date);
  if (existing) existing.weight = weight;
  else data.bodyweight.push({ id: Date.now(), date, weight });
  saveData(data);
  showToast(`Bodyweight logged: ${fmt(weight)} lbs`);
}


// =====================================================================
// 8. BACKUP
// =====================================================================

function renderBackup() {
  view.innerHTML = `
    <header class="page-header">
      <h1>Backup</h1>
    </header>

    <section class="card">
      <h2 class="card-title" style="margin-bottom: 8px">Your data</h2>
      <p class="empty">
        ${plural(data.workouts.length, "workout")} and ${data.bodyweight.length} bodyweight
        ${data.bodyweight.length === 1 ? "entry" : "entries"},
        saved in this browser on this device only.
      </p>
    </section>

    <section class="card">
      <h2 class="card-title" style="margin-bottom: 8px">Export</h2>
      <p class="empty" style="margin-bottom: 12px">
        Download everything as a file. Do this regularly. It's also how you move data to another device.
      </p>
      <button class="btn btn-primary btn-block" data-action="export" style="margin: 0">Download backup</button>
    </section>

    <section class="card">
      <h2 class="card-title" style="margin-bottom: 8px">Import</h2>
      <p class="empty" style="margin-bottom: 12px">
        Load a backup file. This <strong>replaces</strong> all data currently in the app.
      </p>
      <button class="btn btn-secondary btn-block" data-action="import" style="margin: 0">Choose backup file</button>
    </section>
  `;
}

async function importFromFile(file) {
  try {
    const imported = await readBackupFile(file);
    const ok = confirm(
      `Replace your current data with this backup?\n\n` +
      `Backup: ${plural(imported.workouts.length, "workout")}, ${imported.bodyweight.length} bodyweight entries.\n` +
      `Current: ${plural(data.workouts.length, "workout")}, ${data.bodyweight.length} bodyweight entries.`
    );
    if (!ok) return;
    data = imported;
    saveAndRender();
    showToast("Backup imported.");
  } catch (error) {
    alert("Couldn't import that file. " + error.message);
  }
}


// =====================================================================
// 9. ACTIONS — what each data-action="..." button does
// `el` is the button that was tapped; el.dataset holds its data-* values.
// =====================================================================

const actions = {
  // --- navigation
  "nav": (el) => navigate(el.dataset.view),

  "open-bodyweight": () => {
    progressTab = "Bodyweight";
    navigate("progress");
  },

  "progress-tab": (el) => {
    progressTab = el.dataset.tab;
    render();
  },

  // --- logging
  "add-exercise": (el) => {
    draft.exercises.push({ lift: el.dataset.lift, sets: [{ reps: "", weight: "" }] });
    saveDraft(draft);
    render();
  },

  "remove-exercise": (el) => {
    const exercise = draft.exercises[el.dataset.ex];
    const hasSets = exercise.sets.some((s) => s.reps !== "" || s.weight !== "");
    if (hasSets && !confirm(`Remove ${exercise.lift} from this workout?`)) return;
    draft.exercises.splice(el.dataset.ex, 1);
    saveDraft(draft);
    render();
  },

  // New sets copy the previous set's numbers. Just tweak what changed.
  "add-set": (el) => {
    const sets = draft.exercises[el.dataset.ex].sets;
    const previous = sets[sets.length - 1] || { reps: "", weight: "" };
    sets.push({ ...previous });
    saveDraft(draft);
    render();
  },

  "remove-set": (el) => {
    const sets = draft.exercises[el.dataset.ex].sets;
    sets.splice(el.dataset.set, 1);
    if (sets.length === 0) draft.exercises.splice(el.dataset.ex, 1); // last set gone = exercise gone
    saveDraft(draft);
    render();
  },

  "repeat-last": () => {
    const last = sortedWorkouts(data).at(-1);
    if (draftHasContent() && !confirm("Replace what you've entered with your last workout?")) return;
    draft.exercises = last.exercises.map((ex) => ({ lift: ex.lift, sets: toDraftSets(ex.sets) }));
    saveDraft(draft);
    render();
    showToast(`Loaded your ${formatShortDate(last.date)} workout. Adjust anything that changed.`);
  },

  "save-workout": () => saveWorkout(),

  "discard-draft": () => {
    if (!confirm("Discard this workout? Nothing has been saved yet.")) return;
    draft = newDraft();
    saveDraft(draft);
    render();
  },

  // --- editing and deleting saved workouts
  "edit-workout": (el) => {
    const workout = data.workouts.find((w) => w.id === Number(el.dataset.id));
    if (!workout) return;
    const busy = draftHasContent() && draft.editingId !== workout.id;
    if (busy && !confirm("Discard the workout you're currently logging?")) return;

    // Copy the workout into the draft so the Log screen can edit it
    draft = {
      editingId: workout.id,
      date: workout.date,
      notes: workout.notes || "",
      exercises: workout.exercises.map((ex) => ({ lift: ex.lift, sets: toDraftSets(ex.sets) })),
    };
    saveDraft(draft);
    navigate("log");
  },

  "cancel-edit": () => {
    draft = newDraft();
    saveDraft(draft);
    navigate("history");
  },

  "delete-workout": (el) => {
    const id = Number(el.dataset.id);
    const workout = data.workouts.find((w) => w.id === id);
    if (!workout || !confirm(`Delete your ${formatLongDate(workout.date)} workout? This can't be undone.`)) return;

    data.workouts = data.workouts.filter((w) => w.id !== id);
    saveData(data);
    if (draft.editingId === id) {
      draft = newDraft();
      saveDraft(draft);
    }
    showToast("Workout deleted.");
    navigate("history");
  },

  // --- bodyweight
  "delete-bodyweight": (el) => {
    if (!confirm("Delete this bodyweight entry?")) return;
    data.bodyweight = data.bodyweight.filter((b) => b.id !== Number(el.dataset.id));
    saveAndRender();
  },

  // --- backup
  "export": () => exportBackup(data),
  "import": () => document.getElementById("import-file").click(),
};


// =====================================================================
// 10. EVENT LISTENERS — the only places that listen for taps and typing
// =====================================================================

// Taps: find the nearest element with data-action and run that action
document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});

// Typing in the logger: update the draft as you type, without redrawing
// the screen (redrawing would kick the keyboard closed).
document.addEventListener("input", (event) => {
  const el = event.target;
  const field = el.dataset.draft;
  if (!field) return;

  if (field === "date" || field === "notes") {
    draft[field] = el.value;
  } else {
    // reps or weight of one set
    const exercise = draft.exercises[el.dataset.ex];
    exercise.sets[el.dataset.set][field] = el.value;
    document.getElementById(`e1rm-${el.dataset.ex}`).textContent = e1rmLabel(exercise);
  }
  saveDraft(draft);
});

// Forms (bodyweight). preventDefault stops the page from reloading.
document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const values = new FormData(form);
  const weight = Number(values.get("weight"));
  if (!(weight > 0)) return;

  if (form.dataset.form === "bodyweight-quick") logBodyweight(todayString(), weight);
  if (form.dataset.form === "bodyweight-full") logBodyweight(values.get("date"), weight);
  render();
});

// Picking a backup file
document.getElementById("import-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) importFromFile(file);
  event.target.value = ""; // so picking the same file again still works
});

// Redraw the chart when the screen size changes (e.g. phone rotated)
window.addEventListener("resize", () => {
  if (currentView === "progress") drawProgressChart();
});


// =====================================================================
// 11. START
// =====================================================================
render();

// Turn on offline support (see sw.js). This only works when the app is
// on a real website. When you open index.html from your computer's
// folders (a file:// address), the browser doesn't allow it, so we skip it.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js");
}
