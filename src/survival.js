export const FOODS = {
  apple: { food: 4, saturation: 2.4 },
  bread: { food: 5, saturation: 6 },
  meat: { food: 3, saturation: 1.8 },
  cooked: { food: 8, saturation: 12.8 },
  cake: { food: 14, saturation: 2.8 },
  carrot: { food: 3, saturation: 3.6 },
  potato: { food: 1, saturation: 0.6 },
  bakedPotato: { food: 5, saturation: 6 },
  rawCod: { food: 2, saturation: 0.4 },
  rawSalmon: { food: 2, saturation: 0.4 },
  tropicalFish: { food: 1, saturation: 0.2 },
  cookedCod: { food: 5, saturation: 6 },
  cookedSalmon: { food: 6, saturation: 9.6 },
  goldenApple: { food: 4, saturation: 9.6, always: true },
  milkBucket: { food: 0, saturation: 0, always: true, container: 'bucket' },
};

const defaults = {
  saturation: 5,
  exhaustion: 0,
  air: 15,
  burning: 0,
  regeneration: 0,
  absorptionTime: 0,
  absorption: 0,
  healTimer: 0,
  starveTimer: 0,
  drownTimer: 0,
  fireTimer: 0,
  effectTimer: 0,
};
export function validSurvival(state) {
  return (
    state &&
    Object.entries(defaults).every(
      ([key]) =>
        Number.isFinite(state[key]) &&
        state[key] >= 0 &&
        state[key] <=
          (key === 'absorptionTime'
            ? 120
            : key === 'saturation'
              ? 20
              : key === 'air'
                ? 15
                : key === 'exhaustion'
                  ? 40
                  : key === 'absorption'
                    ? 4
                    : 10),
    )
  );
}

// Independent survival rules informed by Minecraft/VoxeLibre's food exhaustion
// and saturation model. Environmental hazards tick once per simulation frame.
export class Survival {
  constructor(state = {}) {
    for (const key of Object.keys(defaults))
      this[key] = state[key] ?? defaults[key];
  }

  exhaust(amount) {
    this.exhaustion = Math.min(40, this.exhaustion + amount);
  }

  eat(item, vitals) {
    const def = FOODS[item];
    if (item === 'milkBucket') {
      this.regeneration =
        this.absorption =
        this.absorptionTime =
        this.effectTimer =
          0;
      return;
    }
    vitals.hunger = Math.min(20, vitals.hunger + def.food);
    this.saturation = Math.min(vitals.hunger, this.saturation + def.saturation);
    if (item === 'goldenApple') {
      this.regeneration = 5;
      this.effectTimer = 0;
      this.absorptionTime = 120;
      this.absorption = Math.max(this.absorption, 4);
    }
  }

  absorb(amount) {
    const absorbed = Math.min(amount, this.absorption);
    this.absorption -= absorbed;
    return amount - absorbed;
  }

  tick(dt, vitals, environment) {
    const damage = [];
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0)
        this.saturation = Math.max(0, this.saturation - 1);
      else vitals.hunger = Math.max(0, vitals.hunger - 1);
    }
    if (environment.submerged) {
      this.air = Math.max(0, this.air - dt);
      if (this.air === 0) {
        this.drownTimer += dt;
        if (this.drownTimer >= 2) {
          damage.push([2, 'drown']);
          this.drownTimer -= 2;
        }
      }
    } else {
      this.air = Math.min(15, this.air + dt * 5);
      this.drownTimer = 0;
    }
    if (environment.lava) this.burning = 6;
    else if (environment.wet) this.burning = 0;
    else this.burning = Math.max(0, this.burning - dt);
    if (this.burning > 0) {
      this.fireTimer += dt;
      if (this.fireTimer >= 1) {
        damage.push([environment.lava ? 4 : 1, 'burn']);
        this.fireTimer -= 1;
      }
    } else this.fireTimer = 0;

    if (this.absorptionTime > 0) {
      this.absorptionTime = Math.max(0, this.absorptionTime - dt);
      if (!this.absorptionTime) this.absorption = 0;
    }
    if (this.regeneration > 0) {
      const remaining = Math.min(dt, this.regeneration);
      this.regeneration = Math.max(0, this.regeneration - dt);
      this.effectTimer += remaining;
      if (this.effectTimer >= 1.25 - 1e-6) {
        vitals.health = Math.min(20, vitals.health + 1);
        this.effectTimer = Math.max(0, this.effectTimer - 1.25);
      }
    } else this.effectTimer = 0;
    if (vitals.hunger >= 18 && vitals.health < 20) {
      this.healTimer += dt;
      const interval = vitals.hunger >= 20 && this.saturation > 0 ? 1 : 4;
      if (this.healTimer >= interval) {
        vitals.health = Math.min(20, vitals.health + 1);
        this.exhaust(6);
        this.healTimer = 0;
      }
    } else this.healTimer = 0;
    if (vitals.hunger <= 0 && vitals.health > 1) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) {
        damage.push([Math.min(1, vitals.health - 1), 'hunger']);
        this.starveTimer -= 4;
      }
    } else this.starveTimer = 0;
    return damage;
  }

  serialize() {
    return Object.fromEntries(
      Object.keys(defaults).map((key) => [key, this[key]]),
    );
  }
}
