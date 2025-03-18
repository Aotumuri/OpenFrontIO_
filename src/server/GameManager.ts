import { ServerConfig } from "../core/configuration/Config";
import { GameConfig, GameID } from "../core/Schemas";
import { Client } from "./Client";
import { GamePhase, GameServer } from "./GameServer";
import { Difficulty, GameMapType, GameType } from "../core/game/Game";
import { Logger } from "winston";

export class GameManager {
  private games: Map<GameID, GameServer> = new Map();

  constructor(
    private config: ServerConfig,
    private log: Logger,
  ) {
    setInterval(() => this.tick(), 1000);
  }

  public game(id: GameID): GameServer | null {
    return this.games.get(id);
  }

  addClient(client: Client, gameID: GameID, lastTurn: number): boolean {
    const game = this.games.get(gameID);
    if (game) {
      game.addClient(client, lastTurn);
      return true;
    }
    return false;
  }

  createGame(id: GameID, gameConfig: GameConfig | undefined) {
    const game = new GameServer(id, this.log, Date.now(), this.config, {
      gameMap: GameMapType.World,
      gameType: GameType.Private,
      difficulty: Difficulty.Medium,
      disableNPCs: false,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      bots: 400,
      ...gameConfig,
    });
    this.games.set(id, game);
    return game;
  }

  activeGames(): number {
    return this.games.size;
  }

  activeClients(): number {
    let totalClients = 0;
    this.games.forEach((game: GameServer) => {
      totalClients += game.activeClients.length;
    });
    return totalClients;
  }

  tick() {
    const active = new Map<GameID, GameServer>();
    for (const [id, game] of this.games) {
      const phase = game.phase();
      if (phase == GamePhase.Active) {
        if (!game.hasStarted()) {
          try {
            game.start();
          } catch (error) {
            this.log.error(`error starting game ${id}: ${error}`);
          }
        }
      }

      if (phase == GamePhase.Finished) {
        try {
          game.end();
        } catch (error) {
          this.log.error(`error ending game ${id}: ${error}`);
        }
      } else {
        active.set(id, game);
      }
    }
    this.games = active;
  }
}
