import Module from 'Parser/Core/Module';
import { TRANQUILITY_HEAL_SPELL_ID} from '../../Constants';

export const ESSENCE_OF_INFUSION_ITEM_ID = 137026;
const ESSENCE_OF_INFUSION_HEALING_INCREASE = 1.6;

class EssenceOfInfusion extends Module {
  healing = 0;

  on_byPlayer_heal(event) {
    const spellId = event.ability.guid;

    if (spellId === TRANQUILITY_HEAL_SPELL_ID) {
      let healthBeforeHeal = event.hitPoints - event.amount;
      let healthBreakpoint = event.maxHitPoints * 0.6;
      if(healthBeforeHeal <= healthBreakpoint) {
        this.healing += (event.amount - (event.amount / ESSENCE_OF_INFUSION_HEALING_INCREASE));
      }
      return;
    }
  }
}

export default EssenceOfInfusion;
