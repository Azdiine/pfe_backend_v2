const prisma = require('../../config/prisma');
const { computeDailyTargets } = require('../../utils/nutrition');

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

// logDate is a @db.Date — always work with UTC midnight of "YYYY-MM-DD"
const toLogDate = (dateStr) => {
  // "YYYY-MM-DD" parses as UTC midnight, but getFullYear() then reads it in
  // the *server's* timezone — west of GMT that shifts the log one day back.
  // Date-only strings are therefore taken as-is.
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    const d = new Date(`${dateStr.trim()}T00:00:00.000Z`);
    if (isNaN(d.getTime())) {
      throw { statusCode: 400, message: 'Invalid date' };
    }
    return d;
  }
  const d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) {
    throw { statusCode: 400, message: 'Invalid date' };
  }
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

const num = (v) => (v == null ? 0 : parseFloat(v) || 0);

/**
 * Somme les MealEntry d'un jour et fusionne avec le DailyLog pour produire
 * la vue complète du jour : totaux, repas groupés par type, objectifs.
 * (Les anciennes valeurs caloriesIn du DailyLog, saisies avant l'arrivée
 * des MealEntry, sont conservées dans les totaux.)
 */
const buildDaySummary = async (userId, logDate) => {
  const [log, entries, profile] = await Promise.all([
    prisma.dailyLog.findUnique({ where: { userId_logDate: { userId, logDate } } }),
    prisma.mealEntry.findMany({
      where: { userId, logDate },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.userProfile.findUnique({ where: { userId } }),
  ]);

  const totals = {
    caloriesIn: num(log?.caloriesIn),
    proteinsG: num(log?.proteinsG),
    carbsG: num(log?.carbsG),
    fatsG: num(log?.fatsG),
  };
  for (const e of entries) {
    totals.caloriesIn += num(e.calories);
    totals.proteinsG += num(e.proteinsG);
    totals.carbsG += num(e.carbsG);
    totals.fatsG += num(e.fatsG);
  }

  const meals = Object.fromEntries(MEAL_TYPES.map((t) => [t, []]));
  for (const e of entries) {
    meals[e.mealType].push({
      id: e.id,
      name: e.name,
      calories: num(e.calories),
      proteinsG: num(e.proteinsG),
      carbsG: num(e.carbsG),
      fatsG: num(e.fatsG),
      source: e.source,
      createdAt: e.createdAt,
    });
  }

  return {
    userId,
    logDate,
    ...totals,
    waterMl: log?.waterMl || 0,
    caloriesBurned: num(log?.caloriesBurned),
    activityType: log?.activityType || null,
    activityMinutes: log?.activityMinutes || null,
    weightKg: log?.weightKg != null ? num(log.weightKg) : null,
    bodyFatPercent: log?.bodyFatPercent != null ? num(log.bodyFatPercent) : null,
    notes: log?.notes || null,
    mood: log?.mood || null,
    meals,
    targets: computeDailyTargets(profile),
  };
};

/**
 * Add a meal to the day's log as an individual entry
 * (breakfast / lunch / dinner / snack), then return the full day summary.
 */
const addMeal = async (userId, { calories, proteinsG, carbsG, fatsG, date, mealType, name, source }) => {
  const logDate = toLogDate(date);
  const type = MEAL_TYPES.includes(mealType) ? mealType : 'snack';

  await prisma.mealEntry.create({
    data: {
      userId,
      logDate,
      mealType: type,
      name: name?.toString().slice(0, 200) || null,
      calories: num(calories),
      proteinsG: num(proteinsG),
      carbsG: num(carbsG),
      fatsG: num(fatsG),
      source: source?.toString().slice(0, 50) || null,
    },
  });

  return buildDaySummary(userId, logDate);
};

/**
 * Delete one meal entry (scoped to the user), return the day summary.
 */
const deleteMeal = async (userId, entryId) => {
  const entry = await prisma.mealEntry.findFirst({
    where: { id: entryId, userId },
  });
  if (!entry) {
    throw { statusCode: 404, message: 'Meal entry not found' };
  }
  await prisma.mealEntry.delete({ where: { id: entry.id } });
  return buildDaySummary(userId, entry.logDate);
};

/**
 * Add water (ml) to the day's log.
 */
const addWater = async (userId, { ml, date }) => {
  const logDate = toLogDate(date);

  const existing = await prisma.dailyLog.findUnique({
    where: { userId_logDate: { userId, logDate } },
  });

  const waterMl = (existing?.waterMl || 0) + Math.round(num(ml));

  await prisma.dailyLog.upsert({
    where: { userId_logDate: { userId, logDate } },
    update: { waterMl },
    create: { userId, logDate, waterMl },
  });

  return buildDaySummary(userId, logDate);
};

/**
 * Set day values (weight, activity, mood...) without accumulating.
 */
const updateDay = async (userId, { date, ...fields }) => {
  const logDate = toLogDate(date);

  const allowed = {};
  const editable = [
    'caloriesBurned', 'activityType', 'activityMinutes',
    'weightKg', 'bodyFatPercent', 'notes', 'mood', 'waterMl',
  ];
  for (const key of editable) {
    if (fields[key] !== undefined) allowed[key] = fields[key];
  }

  await prisma.dailyLog.upsert({
    where: { userId_logDate: { userId, logDate } },
    update: allowed,
    create: { userId, logDate, ...allowed },
  });

  return buildDaySummary(userId, logDate);
};

/**
 * One day's log (today by default), with meals and personalized targets.
 */
const getDay = async (userId, date) => {
  return buildDaySummary(userId, toLogDate(date));
};

/**
 * Logs of the last N days (for weekly/monthly progress views).
 * Nutrition totals include the meal entries of each day.
 */
const getRange = async (userId, days = 7) => {
  const n = Math.min(Math.max(parseInt(days) || 7, 1), 366);
  const since = toLogDate();
  since.setUTCDate(since.getUTCDate() - (n - 1));

  const [logs, mealSums] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId, logDate: { gte: since } },
      orderBy: { logDate: 'asc' },
    }),
    prisma.mealEntry.groupBy({
      by: ['logDate'],
      where: { userId, logDate: { gte: since } },
      _sum: { calories: true, proteinsG: true, carbsG: true, fatsG: true },
    }),
  ]);

  const sumsByDate = new Map(
    mealSums.map((m) => [m.logDate.toISOString().slice(0, 10), m._sum])
  );
  const merged = new Map();

  for (const log of logs) {
    const key = log.logDate.toISOString().slice(0, 10);
    merged.set(key, {
      ...log,
      caloriesIn: num(log.caloriesIn),
      proteinsG: num(log.proteinsG),
      carbsG: num(log.carbsG),
      fatsG: num(log.fatsG),
    });
  }
  for (const [key, sums] of sumsByDate) {
    const day = merged.get(key) || {
      userId,
      logDate: new Date(`${key}T00:00:00.000Z`),
      caloriesIn: 0, proteinsG: 0, carbsG: 0, fatsG: 0, waterMl: 0,
    };
    day.caloriesIn = num(day.caloriesIn) + num(sums.calories);
    day.proteinsG = num(day.proteinsG) + num(sums.proteinsG);
    day.carbsG = num(day.carbsG) + num(sums.carbsG);
    day.fatsG = num(day.fatsG) + num(sums.fatsG);
    merged.set(key, day);
  }

  return [...merged.values()].sort((a, b) => a.logDate - b.logDate);
};

module.exports = { addMeal, deleteMeal, addWater, updateDay, getDay, getRange };
