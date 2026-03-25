'use strict';
// SkillTree removed per spec. Stub kept for engine.js compatibility.
const SkillTree = {
  applyXPModifier(xp) { return xp; },
  getCardDropChance()  { return 0; },
  getStackMax()        { return STACK_MAX_DEFAULT; },
  getWeeklyLootMin()   { return 'basic'; },
  checkDailyCardSkill(){},
  checkWeeklyShield()  {},
  isUnlocked()         { return false; },
  updateSkillTree()    {},
};
