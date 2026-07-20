// Objectifs nutritionnels personnalisés calculés depuis le profil.
// BMR : Mifflin-St Jeor. TDEE : BMR × facteur d'activité, ajusté par l'objectif.

const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUSTMENTS_KCAL = {
  lose_weight: -500,
  gain_muscle: 300,
  maintain: 0,
  eat_healthier: 0,
  improve_fitness: 0,
};

const DEFAULT_TARGETS = {
  calories: 2000,
  proteinsG: 125,
  carbsG: 225,
  fatsG: 67,
  waterMl: 2000,
};

const toNumber = (v) => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const ageFromBirthDate = (birthDate) => {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const age = Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  return age > 0 && age < 120 ? age : null;
};

/**
 * Targets journaliers depuis un UserProfile (ou les défauts si incomplet).
 * Retourne { calories, proteinsG, carbsG, fatsG, waterMl, personalized }.
 */
const computeDailyTargets = (profile) => {
  const weight = toNumber(profile?.weightKg);
  const height = toNumber(profile?.heightCm);
  const age = ageFromBirthDate(profile?.birthDate);

  if (!weight || !height || !age) {
    return { ...DEFAULT_TARGETS, personalized: false };
  }

  const genderOffset = profile.gender === 'male' ? 5 : profile.gender === 'female' ? -161 : -78;
  const bmr = 10 * weight + 6.25 * height - 5 * age + genderOffset;
  const factor = ACTIVITY_FACTORS[profile.activityLevel] || 1.375;
  const adjustment = GOAL_ADJUSTMENTS_KCAL[profile.goal] || 0;

  // Bornes de sécurité : jamais en dessous de 1200 kcal
  const calories = Math.round(Math.max(bmr * factor + adjustment, 1200));

  // Protéines 1.8 g/kg, lipides 30 % des kcal, glucides le reste
  const proteinsG = Math.round(1.8 * weight);
  const fatsG = Math.round((calories * 0.30) / 9);
  const carbsG = Math.round(Math.max(calories - proteinsG * 4 - fatsG * 9, 0) / 4);

  // Eau : 35 ml/kg, arrondie aux 250 ml
  const waterMl = Math.round((35 * weight) / 250) * 250;

  return { calories, proteinsG, carbsG, fatsG, waterMl, personalized: true };
};

module.exports = { computeDailyTargets, DEFAULT_TARGETS };
