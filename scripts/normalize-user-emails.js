#!/usr/bin/env node
/**
 * One-off data fix: normalize existing user emails to the same canonical
 * form used by the express-validator chains (lowercase, gmail dots stripped).
 * Users created via Google sign-in before the googleAuth normalization fix
 * were stored with the raw email (e.g. "saropez.pro@gmail.com"), making them
 * invisible to the register duplicate check and the login lookup.
 *
 * Usage: node scripts/normalize-user-emails.js
 */
require('dotenv').config();
const validator = require('validator');
const prisma = require('../config/prisma');

const normalize = (email) => validator.normalizeEmail(email) || email.toLowerCase();

(async () => {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });

  const changes = users
    .map((u) => ({ ...u, normalized: normalize(u.email) }))
    .filter((u) => u.normalized !== u.email);

  if (changes.length === 0) {
    console.log('✅ All user emails are already normalized, nothing to do.');
    await prisma.$disconnect();
    return;
  }

  // Abort on collision: two accounts that would normalize to the same email
  // must be merged manually, never silently overwritten.
  const allTargets = users.map((u) => normalize(u.email));
  const collisions = changes.filter(
    (c) => allTargets.filter((t) => t === c.normalized).length > 1
  );
  if (collisions.length > 0) {
    console.error('❌ Collision detected, manual merge required for:');
    collisions.forEach((c) => console.error(`   ${c.email} -> ${c.normalized}`));
    await prisma.$disconnect();
    process.exit(1);
  }

  for (const c of changes) {
    await prisma.user.update({ where: { id: c.id }, data: { email: c.normalized } });
    console.log(`✏️  ${c.email} -> ${c.normalized}`);
  }

  // Pending OTP rows keyed by the old email form would become unreachable
  const otps = await prisma.otpCode.findMany({
    where: { used: false },
    select: { id: true, email: true },
  });
  for (const otp of otps) {
    const normalized = normalize(otp.email);
    if (normalized !== otp.email) {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { email: normalized } });
      console.log(`✏️  OTP ${otp.email} -> ${normalized}`);
    }
  }

  console.log(`✅ Done: ${changes.length} user email(s) normalized.`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('❌ Migration failed:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
