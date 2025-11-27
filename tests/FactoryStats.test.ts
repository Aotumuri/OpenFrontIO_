import { ConstructionExecution } from "../src/core/execution/ConstructionExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import {
  OTHER_INDEX_BUILT,
  OTHER_INDEX_CAPTURE,
  OTHER_INDEX_DESTROY,
  OTHER_INDEX_LOST,
} from "../src/core/StatsSchemas";
import { setup } from "./util/Setup";

describe("Factory stats integration", () => {
  let game: Game;
  let player1: Player;
  let player2: Player;

  beforeEach(async () => {
    game = await setup("plains", { infiniteGold: true, instantBuild: true }, [
      new PlayerInfo("p1", PlayerType.Human, "client1", "p1"),
      new PlayerInfo("p2", PlayerType.Human, "client2", "p2"),
    ]);

    game.addExecution(
      new SpawnExecution(playerInfo("p1", PlayerType.Human), game.ref(50, 50)),
    );
    game.addExecution(
      new SpawnExecution(playerInfo("p2", PlayerType.Human), game.ref(50, 55)),
    );

    while (game.inSpawnPhase()) {
      game.executeNextTick();
    }

    player1 = game.player("p1");
    player2 = game.player("p2");
  });

  test("counts factory build", () => {
    buildFactory(game, player1);

    const stats = game.stats().stats()[player1.clientID()!];
    expect(stats.units?.fact?.[OTHER_INDEX_BUILT]).toBe(1n);
  });

  test("counts factory capture and loss", () => {
    const factory = buildFactory(game, player1);

    factory.setOwner(player2);

    const p1Stats = game.stats().stats()[player1.clientID()!];
    const p2Stats = game.stats().stats()[player2.clientID()!];

    expect(p2Stats.units?.fact?.[OTHER_INDEX_CAPTURE]).toBe(1n);
    expect(p1Stats.units?.fact?.[OTHER_INDEX_LOST]).toBe(1n);
  });

  test("counts factory destroy and loss", () => {
    const factory = buildFactory(game, player1);

    factory.delete(true, player2);

    const p1Stats = game.stats().stats()[player1.clientID()!];
    const p2Stats = game.stats().stats()[player2.clientID()!];

    expect(p2Stats.units?.fact?.[OTHER_INDEX_DESTROY]).toBe(1n);
    expect(p1Stats.units?.fact?.[OTHER_INDEX_LOST]).toBe(1n);
  });
});

function buildFactory(game: Game, player: Player) {
  const fallbackTile = game.ref(50, 50);
  const tile = player.tiles()[0] ?? fallbackTile;
  if (player.tiles().length === 0) {
    player.conquer(tile);
  }
  game.addExecution(new ConstructionExecution(player, UnitType.Factory, tile));

  let factory = player.units(UnitType.Factory)[0];
  for (
    let i = 0;
    i < 20 && (!factory || factory.isUnderConstruction?.());
    i++
  ) {
    game.executeNextTick();
    factory = player.units(UnitType.Factory)[0];
  }

  if (!factory) {
    throw new Error("Factory was not built during test setup");
  }

  return factory;
}

function playerInfo(name: string, type: PlayerType): PlayerInfo {
  return new PlayerInfo(name, type, null, name);
}
