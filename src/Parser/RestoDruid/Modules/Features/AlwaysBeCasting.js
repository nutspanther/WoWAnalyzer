import Module from 'Parser/Core/Module';
import {
  REJUVENATION_HEAL_SPELL_ID, REGROWTH_HEAL_SPELL_ID, WILD_GROWTH_HEAL_SPELL_ID,
  HEALING_TOUCH_HEAL_SPELL_ID, TRANQUILITY_CAST_SPELL_ID,
  LIFEBLOOM_HOT_HEAL_SPELL_ID, SWIFTMEND_HEAL_SPELL_ID, FRENZIED_REGENERATION_HEAL_SPELL_ID,
  RENEWAL_HEAL_SPELL_ID, INNERVATE_CAST_ID, ESSENCE_OF_GHANIR_CAST_ID, CENARION_WARD_HEAL_SPELL_ID,
  IRONBARK_CAST_ID, FLOURISH_CAST_ID, BARKSKIN_CAST_ID, TREE_OF_LIFE_CAST_ID
} from '../../Constants';

const HEALING_ABILITIES_ON_GCD = [
  REJUVENATION_HEAL_SPELL_ID,
  REGROWTH_HEAL_SPELL_ID,
  WILD_GROWTH_HEAL_SPELL_ID,
  HEALING_TOUCH_HEAL_SPELL_ID,
  TRANQUILITY_CAST_SPELL_ID,
  CENARION_WARD_HEAL_SPELL_ID,
  LIFEBLOOM_HOT_HEAL_SPELL_ID,
  SWIFTMEND_HEAL_SPELL_ID,
  FRENZIED_REGENERATION_HEAL_SPELL_ID,
  RENEWAL_HEAL_SPELL_ID,
  ESSENCE_OF_GHANIR_CAST_ID,
  FLOURISH_CAST_ID,
  TREE_OF_LIFE_CAST_ID,
];
const ABILITIES_ON_GCD = [
  ...HEALING_ABILITIES_ON_GCD,
  INNERVATE_CAST_ID,
  IRONBARK_CAST_ID,
  BARKSKIN_CAST_ID,
];
/* eslint-disable no-useless-computed-key */
const HASTE_BUFFS = {
  [2825]: 0.3, // Bloodlust
  [32182]: 0.3, // Heroism
  [80353]: 0.3, // Time Warp
  [90355]: 0.3, // Ancient Hysteria (Hunter pet BL)
  [160452]: 0.3, // Netherwinds (Hunter pet BL)
  [178207]: 0.25, // Drums of Fury
  [230935]: 0.25, // Drums of the Mountain
  [146555]: 0.25, // Drums of Rage
};

const debug = false;

class AlwaysBeCasting extends Module {
  eventLog = [];

  totalTimeWasted = 0;
  totalHealingTimeWasted = 0;

  lastCastFinishedTimestamp = null;
  lastHealingCastFinishedTimestamp = null;

  _currentlyCasting = null;
  on_byPlayer_begincast(event) {
    const cast = {
      begincast: event,
      cast: null,
    };

    this._currentlyCasting = cast;
    this.eventLog.push(cast);
  }
  on_byPlayer_cast(event) {
    const spellId = event.ability.guid;
    const isOnGcd = ABILITIES_ON_GCD.indexOf(spellId) !== -1;
    // This fixes a crash when boss abilities are registered as casts which could even happen while channeling. For example on Trilliax: http://i.imgur.com/7QAFy1q.png
    if (!isOnGcd) {
      return;
    }

    if (this._currentlyCasting && this._currentlyCasting.begincast.ability.guid !== event.ability.guid) {
      // This is a different spell then registered in `begincast`, previous cast was interrupted
      this._currentlyCasting = null;
    }

    const logEntry = this._currentlyCasting || {
      begincast: null,
    };
    logEntry.cast = event;
    if (!this._currentlyCasting) {
      this.eventLog.push(logEntry);
    }

    this.processCast(logEntry);
    this._currentlyCasting = null;
  }

  processCast({ begincast, cast }) {
    if (!cast) {
      return;
    }
    const spellId = cast.ability.guid;
    const isOnGcd = ABILITIES_ON_GCD.indexOf(spellId) !== -1;
    let countsAsHealingAbility = HEALING_ABILITIES_ON_GCD.indexOf(spellId) !== -1;

    if (!isOnGcd) {
      debug && console.log(`%cABC: ${cast.ability.name} (${spellId}) ignored`, 'color: gray');
      return;
    }
    if (countsAsHealingAbility && !cast.targetIsFriendly) {
      debug && console.log(`%cABC: ${cast.ability.name} (${spellId}) skipped for healing time; target is not friendly`, 'color: orange');
      countsAsHealingAbility = false;
    }

    const castStartTimestamp = (begincast ? begincast : cast).timestamp;
    const timeWasted = castStartTimestamp - (this.lastCastFinishedTimestamp || this.owner.fight.start_time);
    this.totalTimeWasted += timeWasted;

    if (countsAsHealingAbility) {
      const healTimeWasted = castStartTimestamp - (this.lastHealingCastFinishedTimestamp || this.owner.fight.start_time);
      this.totalHealingTimeWasted += healTimeWasted;
    }

    const gcd = this.constructor.calculateGlobalCooldown(this.currentHaste) * 1000;

    debug && console.log(`ABC: tot.:${Math.floor(this.totalTimeWasted)}\tthis:${Math.floor(timeWasted)}\t%c${cast.ability.name} (${spellId}): ${begincast ? 'channeled' : 'instant'}\t%cgcd:${Math.floor(gcd)}\t%ccasttime:${cast.timestamp - castStartTimestamp}\tfighttime:${castStartTimestamp - this.owner.fight.start_time}`, 'color:red', 'color:green', 'color:black');
    this.verifyCast({ begincast, cast }, gcd);

    this.lastCastFinishedTimestamp = Math.max(castStartTimestamp + gcd, cast.timestamp);
    if (countsAsHealingAbility) {
      this.lastHealingCastFinishedTimestamp = Math.max(castStartTimestamp + gcd, cast.timestamp);
    }
  }
  verifyCast({ begincast, cast }, gcd) {
    if(begincast !== null) {
      const castTime = cast.timestamp - begincast.timestamp;
      if (!this.constructor.inRange(castTime, gcd, 50)) { // cast times seem to fluctuate by 50ms, not sure if it depends on player latency, in that case it could be a lot more flexible
        console.warn(`Expected Flash of Light cast time (${castTime}) to match GCD (${Math.round(gcd)}) @${cast.timestamp - this.owner.fight.start_time}`);
      }
    }
  }
  static inRange(num1, goal, buffer) {
    return num1 > (goal - buffer) && num1 < (goal + buffer);
  }
  baseHaste = null;
  currentHaste = null;
  on_byPlayer_combatantinfo() {
    const combatant = this.owner.modules.combatants.selected;
    this.baseHaste = combatant.hastePercentage;
    this.currentHaste = this.baseHaste;

    debug && console.log(`ABC: Current haste: ${this.currentHaste}`);
  }
  on_toPlayer_applybuff(event) {
    const spellId = event.ability.guid;
    if (HASTE_BUFFS[spellId]) {
      this.currentHaste = this.constructor.applyHasteGain(this.currentHaste, HASTE_BUFFS[spellId]);

      debug && console.log(`ABC: Current haste: ${this.currentHaste} (gained ${HASTE_BUFFS[spellId]} from ${spellId})`);
    }
  }
  on_toPlayer_removebuff(event) {
    const spellId = event.ability.guid;
    if (HASTE_BUFFS[spellId]) {
      this.currentHaste = Math.max(this.baseHaste, this.constructor.applyHasteLoss(this.currentHaste, HASTE_BUFFS[spellId]));

      debug && console.log(`ABC: Current haste: ${this.currentHaste} (lost ${HASTE_BUFFS[spellId]} from ${spellId})`);
    }
  }

  on_finished() {
    const fightDuration = this.owner.fight.end_time - this.owner.fight.start_time;
    debug && console.log('totalTimeWasted:', this.totalTimeWasted, 'totalTime:', fightDuration, (this.totalTimeWasted / fightDuration));
    debug && console.log('totalHealingTimeWasted:', this.totalHealingTimeWasted, 'totalTime:', fightDuration, (this.totalHealingTimeWasted / fightDuration));

    const selectedCombatant = this.owner.selectedCombatant;

    this.totalTimeWasted = 0;
    this.totalHealingTimeWasted = 0;

    this.lastCastFinishedTimestamp = null;
    this.lastHealingCastFinishedTimestamp = null;

    this.eventLog.forEach((logEntry) => {
      this.currentHaste = this.baseHaste;
      Object.keys(HASTE_BUFFS).forEach((spellId) => {
        if (selectedCombatant.hasBuff(spellId, (logEntry.begincast || logEntry.cast).timestamp)) {
          this.currentHaste = this.constructor.applyHasteGain(this.currentHaste, HASTE_BUFFS[spellId]);
        }
      });

      this.processCast(logEntry);
    });

    debug && console.log('totalTimeWasted:', this.totalTimeWasted, 'totalTime:', fightDuration, (this.totalTimeWasted / fightDuration));
    debug && console.log('totalHealingTimeWasted:', this.totalHealingTimeWasted, 'totalTime:', fightDuration, (this.totalHealingTimeWasted / fightDuration));
  }

  static calculateGlobalCooldown(haste) {
    return 1.5 / (1 + haste);
  }
  static applyHasteGain(baseHaste, hasteGain) {
    return baseHaste * (1 + hasteGain) + hasteGain;
  }
  static applyHasteLoss(baseHaste, hasteLoss) {
    return (baseHaste - hasteLoss) / (1 + hasteLoss);
  }
}


export default AlwaysBeCasting;
