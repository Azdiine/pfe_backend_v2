const prisma = require('../../config/prisma');

// Save onboarding answers → user_profiles
const buildProfileData = (data, { withOnboardingDone = false } = {}) => {
  const profileData = {
    gender: data.gender ?? undefined,
    birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
    heightCm: data.heightCm != null ? parseFloat(data.heightCm) : undefined,
    weightKg: data.weightKg != null ? parseFloat(data.weightKg) : undefined,
    targetWeightKg: data.targetWeightKg != null ? parseFloat(data.targetWeightKg) : undefined,
    goal: data.goal ?? undefined,
    activityLevel: data.activityLevel ?? undefined,
    dietType: data.dietType ?? undefined,
    allergies: Array.isArray(data.allergies) ? data.allergies : undefined,
    healthConditions: Array.isArray(data.healthConditions)
      ? data.healthConditions
      : undefined,
    cuisinePrefs: Array.isArray(data.cuisinePrefs) ? data.cuisinePrefs : undefined,
  };

  if (withOnboardingDone) {
    profileData.onboardingDone = true;
  }

  return profileData;
};

const saveOnboarding = async (userId, data) => {
  const fullData = buildProfileData(data, { withOnboardingDone: true });

  const updated = await prisma.userProfile.upsert({
    where: { userId },
    update: fullData,
    create: {
      userId,
      allergies: [],
      healthConditions: [],
      cuisinePrefs: [],
      ...fullData,
    },
  });

  return updated;
};

// Get full profile
const getProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });

  if (!user) {
    throw { statusCode: 404, message: 'User not found' };
  }

  return {
    id: user.id,
    email: user.email,
    name: user.profile?.name,
    createdAt: user.createdAt,
    profile: user.profile,
  };
};

// Update profile fields
const updateProfile = async (userId, data) => {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw { statusCode: 404, message: 'Profile not found' };
  }

  const updated = await prisma.userProfile.update({
    where: { userId },
    data: {
      name: data.name ?? undefined,
      ...buildProfileData(data),
    },
  });

  return updated;
};

module.exports = { saveOnboarding, getProfile, updateProfile };