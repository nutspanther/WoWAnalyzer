import Module from 'Parser/Core/Module';
import { LIFEBLOOM_HOT_HEAL_SPELL_ID} from '../../Constants';

class Lifebloom extends Module {
  get uptime() {
  return Object.keys(this.owner.combatants.players)
    .map(key => this.owner.combatants.players[key])
    .reduce((uptime, player) =>
      uptime + player.getBuffUptime(LIFEBLOOM_HOT_HEAL_SPELL_ID),0);
  }
}

export default Lifebloom;
