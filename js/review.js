// Spaced repetition for name recall.
// Each person has review = { box, due, known }.
// "Knew it" moves them up a box (longer gap); "Forgot" sends them back to box 0.

const DAY = 24 * 60 * 60 * 1000;
export const INTERVAL_DAYS = [1, 3, 7, 14, 30, 60];

// First review: the next morning at 08:00 (at least 6 hours after meeting).
export function firstDue(createdAt = Date.now()) {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return Math.max(d.getTime(), createdAt + 6 * 60 * 60 * 1000);
}

export function newReview(createdAt = Date.now()) {
  return { box: 0, due: firstDue(createdAt), known: false };
}

export function answer(review, knewIt, now = Date.now()) {
  const r = review || newReview(now);
  if (knewIt) {
    const box = Math.min((r.box || 0) + 1, INTERVAL_DAYS.length - 1);
    return { box, due: now + INTERVAL_DAYS[box] * DAY, known: box >= INTERVAL_DAYS.length - 1 };
  }
  return { box: 0, due: now + DAY, known: false };
}

export function isDue(person, now = Date.now()) {
  const r = person.review;
  if (!r) return true;
  return !r.known && r.due <= now;
}

// Due cards, "want to see again" first, then oldest due first.
export function dueQueue(people, now = Date.now()) {
  return people
    .filter((p) => isDue(p, now))
    .sort((a, b) => (b.seeAgain ? 1 : 0) - (a.seeAgain ? 1 : 0) || (a.review?.due || 0) - (b.review?.due || 0));
}

// Practice set when nothing is due: people met in the last 14 days.
export function practiceQueue(people, now = Date.now()) {
  return people
    .filter((p) => now - p.createdAt < 14 * DAY)
    .sort((a, b) => (b.seeAgain ? 1 : 0) - (a.seeAgain ? 1 : 0) || b.createdAt - a.createdAt);
}
