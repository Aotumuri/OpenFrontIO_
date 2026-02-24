import { TemplateResult, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { translateText } from "../client/Utils";
import { UserMeResponse } from "../core/ApiSchemas";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  HumansVsNations,
  UnitType,
} from "../core/game/Game";
import { GameConfig, TeamCountConfig } from "../core/Schemas";
import { generateID } from "../core/Util";
import { hasLinkedAccount } from "./Api";
import "./components/baseComponents/Button";
import "./components/baseComponents/Modal";
import { BaseModal } from "./components/BaseModal";
import "./components/GameConfigSettings";
import "./components/ToggleInputCard";
import { modalHeader } from "./components/ui/ModalHeader";
import { getPlayerCosmetics } from "./Cosmetics";
import { crazyGamesSDK } from "./CrazyGamesSDK";
import { JoinLobbyEvent } from "./Main";
import { UsernameInput } from "./UsernameInput";
import {
  getBotsForCompactMap,
  getRandomMapType,
  getUpdatedDisabledUnits,
  parseBoundedFloatFromInput,
  parseBoundedIntegerFromInput,
  preventDisallowedKeys,
  toOptionalNumber,
} from "./utilities/GameConfigHelpers";
import { resolveGeneratedMap } from "./utilities/GeneratedMapResolver";

const DEFAULT_OPTIONS = {
  selectedMap: GameMapType.World,
  selectedDifficulty: Difficulty.Easy,
  disableNations: false,
  bots: 400,
  infiniteGold: false,
  infiniteTroops: false,
  compactMap: false,
  maxTimer: false,
  maxTimerValue: undefined as number | undefined,
  instantBuild: false,
  randomSpawn: false,
  useRandomMap: false,
  useGeneratedMap: false,
  generatedNationCountHint: undefined as number | undefined,
  gameMode: GameMode.FFA,
  teamCount: 2 as TeamCountConfig,
  goldMultiplier: false,
  goldMultiplierValue: undefined as number | undefined,
  startingGold: false,
  startingGoldValue: undefined as number | undefined,
  disabledUnits: [] as UnitType[],
} as const;

@customElement("single-player-modal")
export class SinglePlayerModal extends BaseModal {
  @state() private selectedMap: GameMapType = DEFAULT_OPTIONS.selectedMap;
  @state() private selectedDifficulty: Difficulty =
    DEFAULT_OPTIONS.selectedDifficulty;
  @state() private disableNations: boolean = DEFAULT_OPTIONS.disableNations;
  @state() private bots: number = DEFAULT_OPTIONS.bots;
  @state() private infiniteGold: boolean = DEFAULT_OPTIONS.infiniteGold;
  @state() private infiniteTroops: boolean = DEFAULT_OPTIONS.infiniteTroops;
  @state() private compactMap: boolean = DEFAULT_OPTIONS.compactMap;
  @state() private maxTimer: boolean = DEFAULT_OPTIONS.maxTimer;
  @state() private maxTimerValue: number | undefined =
    DEFAULT_OPTIONS.maxTimerValue;
  @state() private instantBuild: boolean = DEFAULT_OPTIONS.instantBuild;
  @state() private randomSpawn: boolean = DEFAULT_OPTIONS.randomSpawn;
  @state() private useRandomMap: boolean = DEFAULT_OPTIONS.useRandomMap;
  @state() private useGeneratedMap: boolean = DEFAULT_OPTIONS.useGeneratedMap;
  @state() private generatedMapSeed: string = generateID();
  @state() private generatedNationCountHint: number | undefined =
    DEFAULT_OPTIONS.generatedNationCountHint;
  @state() private isStartingGame: boolean = false;
  @state() private isGeneratingMap: boolean = false;
  @state() private gameMode: GameMode = DEFAULT_OPTIONS.gameMode;
  @state() private teamCount: TeamCountConfig = DEFAULT_OPTIONS.teamCount;
  @state() private showAchievements: boolean = false;
  @state() private mapWins: Map<GameMapType, Set<Difficulty>> = new Map();
  @state() private userMeResponse: UserMeResponse | false = false;
  @state() private goldMultiplier: boolean = DEFAULT_OPTIONS.goldMultiplier;
  @state() private goldMultiplierValue: number | undefined =
    DEFAULT_OPTIONS.goldMultiplierValue;
  @state() private startingGold: boolean = DEFAULT_OPTIONS.startingGold;
  @state() private startingGoldValue: number | undefined =
    DEFAULT_OPTIONS.startingGoldValue;

  @state() private disabledUnits: UnitType[] = [
    ...DEFAULT_OPTIONS.disabledUnits,
  ];

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(
      "userMeResponse",
      this.handleUserMeResponse as EventListener,
    );
  }

  disconnectedCallback() {
    document.removeEventListener(
      "userMeResponse",
      this.handleUserMeResponse as EventListener,
    );
    super.disconnectedCallback();
  }

  private toggleAchievements = () => {
    this.showAchievements = !this.showAchievements;
  };

  private handleUserMeResponse = (
    event: CustomEvent<UserMeResponse | false>,
  ) => {
    this.userMeResponse = event.detail;
    this.applyAchievements(event.detail);
  };

  private renderNotLoggedInBanner(): TemplateResult {
    if (crazyGamesSDK.isOnCrazyGames()) {
      return html``;
    }
    return html`<button
      class="px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors duration-200 rounded-lg bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 whitespace-nowrap shrink-0 cursor-pointer hover:bg-yellow-500/30"
      @click=${() => {
        this.close();
        window.showPage?.("page-account");
      }}
    >
      ${translateText("single_modal.sign_in_for_achievements")}
    </button>`;
  }

  private applyAchievements(userMe: UserMeResponse | false) {
    if (!userMe) {
      this.mapWins = new Map();
      return;
    }

    const achievements = Array.isArray(userMe.player.achievements)
      ? userMe.player.achievements
      : [];

    const completions =
      achievements.find(
        (achievement) => achievement?.type === "singleplayer-map",
      )?.data ?? [];

    const winsMap = new Map<GameMapType, Set<Difficulty>>();
    for (const entry of completions) {
      const { mapName, difficulty } = entry ?? {};
      const isValidMap =
        typeof mapName === "string" &&
        Object.values(GameMapType).includes(mapName as GameMapType);
      const isValidDifficulty =
        typeof difficulty === "string" &&
        Object.values(Difficulty).includes(difficulty as Difficulty);
      if (!isValidMap || !isValidDifficulty) continue;

      const map = mapName as GameMapType;
      const set = winsMap.get(map) ?? new Set<Difficulty>();
      set.add(difficulty as Difficulty);
      winsMap.set(map, set);
    }

    this.mapWins = winsMap;
  }

  render() {
    const inputCards = [
      html`<toggle-input-card
        .labelKey=${"single_modal.max_timer"}
        .checked=${this.maxTimer}
        .inputId=${"end-timer-value"}
        .inputMin=${1}
        .inputMax=${120}
        .inputValue=${this.maxTimerValue}
        .inputAriaLabel=${translateText("single_modal.max_timer")}
        .inputPlaceholder=${translateText("single_modal.max_timer_placeholder")}
        .defaultInputValue=${30}
        .minValidOnEnable=${1}
        .onToggle=${this.handleMaxTimerToggle}
        .onInput=${this.handleMaxTimerValueChanges}
        .onKeyDown=${this.handleMaxTimerValueKeyDown}
      ></toggle-input-card>`,
      html`<toggle-input-card
        .labelKey=${"single_modal.gold_multiplier"}
        .checked=${this.goldMultiplier}
        .inputId=${"gold-multiplier-value"}
        .inputMin=${0.1}
        .inputMax=${1000}
        .inputStep=${"any"}
        .inputValue=${this.goldMultiplierValue}
        .inputAriaLabel=${translateText("single_modal.gold_multiplier")}
        .inputPlaceholder=${translateText(
          "single_modal.gold_multiplier_placeholder",
        )}
        .defaultInputValue=${2}
        .minValidOnEnable=${0.1}
        .onToggle=${this.handleGoldMultiplierToggle}
        .onChange=${this.handleGoldMultiplierValueChanges}
        .onKeyDown=${this.handleGoldMultiplierValueKeyDown}
      ></toggle-input-card>`,
      html`<toggle-input-card
        .labelKey=${"single_modal.starting_gold"}
        .checked=${this.startingGold}
        .inputId=${"starting-gold-value"}
        .inputMin=${0}
        .inputMax=${1000000000}
        .inputStep=${100000}
        .inputValue=${this.startingGoldValue}
        .inputAriaLabel=${translateText("single_modal.starting_gold")}
        .inputPlaceholder=${translateText(
          "single_modal.starting_gold_placeholder",
        )}
        .defaultInputValue=${5000000}
        .minValidOnEnable=${0}
        .onToggle=${this.handleStartingGoldToggle}
        .onInput=${this.handleStartingGoldValueChanges}
        .onKeyDown=${this.handleStartingGoldValueKeyDown}
      ></toggle-input-card>`,
    ];

    const content = html`
      <div class="${this.modalContainerClass}">
        <!-- Header -->
        ${modalHeader({
          title: translateText("main.solo") || "Solo",
          onBack: () => this.close(),
          ariaLabel: translateText("common.back"),
          rightContent: hasLinkedAccount(this.userMeResponse)
            ? html`<button
                @click=${this.toggleAchievements}
                class="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all shrink-0 ${this
                  .showAchievements
                  ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                  : "text-white/60"}"
              >
                <img
                  src="/images/MedalIconWhite.svg"
                  class="w-4 h-4 opacity-80 shrink-0"
                  style="${this.showAchievements
                    ? ""
                    : "filter: grayscale(1);"}"
                />
                <span
                  class="text-xs font-bold uppercase tracking-wider whitespace-nowrap"
                  >${translateText("single_modal.toggle_achievements")}</span
                >
              </button>`
            : this.renderNotLoggedInBanner(),
        })}

        <div
          class="flex-1 overflow-y-auto custom-scrollbar px-6 pt-4 pb-6 mr-1 mx-auto w-full max-w-5xl"
        >
          <game-config-settings
            class="block"
            .sectionGapClass=${"space-y-6"}
            .settings=${{
              map: {
                selected: this.selectedMap,
                useRandom: this.useGeneratedMap ? false : this.useRandomMap,
                showMedals: this.showAchievements,
                mapWins: this.mapWins,
                generated: {
                  enabled: this.useGeneratedMap,
                  panel: this.renderGeneratedMapPanel(),
                },
              },
              difficulty: {
                selected: this.selectedDifficulty,
                disabled: this.disableNations,
              },
              gameMode: {
                selected: this.gameMode,
              },
              teamCount: {
                selected: this.teamCount,
              },
              options: {
                titleKey: "single_modal.options_title",
                bots: {
                  value: this.bots,
                  labelKey: "single_modal.bots",
                  disabledKey: "single_modal.bots_disabled",
                },
                toggles: [
                  {
                    labelKey: "single_modal.disable_nations",
                    checked: this.disableNations,
                    hidden:
                      this.gameMode === GameMode.Team &&
                      this.teamCount === HumansVsNations,
                  },
                  {
                    labelKey: "single_modal.instant_build",
                    checked: this.instantBuild,
                  },
                  {
                    labelKey: "single_modal.random_spawn",
                    checked: this.randomSpawn,
                  },
                  {
                    labelKey: "single_modal.infinite_gold",
                    checked: this.infiniteGold,
                  },
                  {
                    labelKey: "single_modal.infinite_troops",
                    checked: this.infiniteTroops,
                  },
                  {
                    labelKey: "single_modal.compact_map",
                    checked: this.compactMap,
                  },
                ],
                inputCards,
              },
              unitTypes: {
                titleKey: "single_modal.enables_title",
                disabledUnits: this.disabledUnits,
              },
            }}
            @map-selected=${this.handleConfigMapSelected}
            @random-map-selected=${this.handleConfigRandomMapSelected}
            @generated-map-mode-changed=${this.handleGeneratedMapModeChanged}
            @difficulty-selected=${this.handleConfigDifficultySelected}
            @game-mode-selected=${this.handleConfigGameModeSelected}
            @team-count-selected=${this.handleConfigTeamCountSelected}
            @bots-changed=${this.handleBotsChange}
            @option-toggle-changed=${this.handleConfigOptionToggleChanged}
            @unit-toggle-changed=${this.handleConfigUnitToggleChanged}
          ></game-config-settings>
        </div>

        <!-- Footer Action -->
        <div class="p-6 border-t border-white/10 bg-black/20">
          ${hasLinkedAccount(this.userMeResponse) && this.hasOptionsChanged()
            ? html`<div
                class="mb-4 px-4 py-3 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-xs font-bold uppercase tracking-wider text-center"
              >
                ${translateText("single_modal.options_changed_no_achievements")}
              </div>`
            : null}
          <button
            @click=${this.startGame}
            ?disabled=${this.isStartingGame}
            class="w-full py-4 text-sm font-bold text-white uppercase tracking-widest bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:-translate-y-0.5 active:translate-y-0 disabled:transform-none"
          >
            ${this.isGeneratingMap
              ? translateText("map_component.loading")
              : translateText("single_modal.start")}
          </button>
        </div>
      </div>
    `;

    if (this.inline) {
      return content;
    }

    return html`
      <o-modal
        id="singlePlayerModal"
        title="${translateText("main.solo") || "Solo"}"
        ?inline=${this.inline}
        hideHeader
        hideCloseButton
      >
        ${content}
      </o-modal>
    `;
  }

  // Check if any options other than map and difficulty have been changed from defaults
  private hasOptionsChanged(): boolean {
    return (
      this.disableNations !== DEFAULT_OPTIONS.disableNations ||
      this.bots !== DEFAULT_OPTIONS.bots ||
      this.infiniteGold !== DEFAULT_OPTIONS.infiniteGold ||
      this.infiniteTroops !== DEFAULT_OPTIONS.infiniteTroops ||
      this.compactMap !== DEFAULT_OPTIONS.compactMap ||
      this.maxTimer !== DEFAULT_OPTIONS.maxTimer ||
      this.instantBuild !== DEFAULT_OPTIONS.instantBuild ||
      this.randomSpawn !== DEFAULT_OPTIONS.randomSpawn ||
      this.useGeneratedMap !== DEFAULT_OPTIONS.useGeneratedMap ||
      this.gameMode !== DEFAULT_OPTIONS.gameMode ||
      this.goldMultiplier !== DEFAULT_OPTIONS.goldMultiplier ||
      this.startingGold !== DEFAULT_OPTIONS.startingGold ||
      this.disabledUnits.length > 0
    );
  }

  protected onClose(): void {
    // Reset all transient form state to ensure clean slate
    this.selectedMap = DEFAULT_OPTIONS.selectedMap;
    this.selectedDifficulty = DEFAULT_OPTIONS.selectedDifficulty;
    this.gameMode = DEFAULT_OPTIONS.gameMode;
    this.useRandomMap = DEFAULT_OPTIONS.useRandomMap;
    this.disableNations = DEFAULT_OPTIONS.disableNations;
    this.bots = DEFAULT_OPTIONS.bots;
    this.infiniteGold = DEFAULT_OPTIONS.infiniteGold;
    this.infiniteTroops = DEFAULT_OPTIONS.infiniteTroops;
    this.compactMap = DEFAULT_OPTIONS.compactMap;
    this.maxTimer = DEFAULT_OPTIONS.maxTimer;
    this.maxTimerValue = DEFAULT_OPTIONS.maxTimerValue;
    this.instantBuild = DEFAULT_OPTIONS.instantBuild;
    this.randomSpawn = DEFAULT_OPTIONS.randomSpawn;
    this.teamCount = DEFAULT_OPTIONS.teamCount;
    this.useGeneratedMap = DEFAULT_OPTIONS.useGeneratedMap;
    this.generatedMapSeed = generateID();
    this.generatedNationCountHint = DEFAULT_OPTIONS.generatedNationCountHint;
    this.isStartingGame = false;
    this.isGeneratingMap = false;
    this.disabledUnits = [...DEFAULT_OPTIONS.disabledUnits];
    this.goldMultiplier = DEFAULT_OPTIONS.goldMultiplier;
    this.goldMultiplierValue = DEFAULT_OPTIONS.goldMultiplierValue;
    this.startingGold = DEFAULT_OPTIONS.startingGold;
    this.startingGoldValue = DEFAULT_OPTIONS.startingGoldValue;
  }

  private handleSelectRandomMap() {
    if (this.useGeneratedMap) {
      return;
    }
    this.useRandomMap = true;
  }

  private handleConfigRandomMapSelected = () => {
    this.handleSelectRandomMap();
  };

  private handleMapSelection(value: GameMapType) {
    if (this.useGeneratedMap) {
      return;
    }
    this.selectedMap = value;
    this.useRandomMap = false;
  }

  private handleConfigMapSelected = (e: Event) => {
    const customEvent = e as CustomEvent<{ map: GameMapType }>;
    this.handleMapSelection(customEvent.detail.map);
  };

  private handleDifficultySelection(value: Difficulty) {
    this.selectedDifficulty = value;
  }

  private handleConfigDifficultySelected = (e: Event) => {
    const customEvent = e as CustomEvent<{ difficulty: Difficulty }>;
    this.handleDifficultySelection(customEvent.detail.difficulty);
  };

  private handleConfigGameModeSelected = (e: Event) => {
    const customEvent = e as CustomEvent<{ mode: GameMode }>;
    this.handleGameModeSelection(customEvent.detail.mode);
  };

  private handleConfigTeamCountSelected = (e: Event) => {
    const customEvent = e as CustomEvent<{ count: TeamCountConfig }>;
    this.handleTeamCountSelection(customEvent.detail.count);
  };

  private handleCompactMapChange(val: boolean) {
    this.compactMap = val;
    this.bots = getBotsForCompactMap(this.bots, val);
  }

  private handleConfigOptionToggleChanged = (e: Event) => {
    const customEvent = e as CustomEvent<{
      labelKey: string;
      checked: boolean;
    }>;
    const { labelKey, checked } = customEvent.detail;

    switch (labelKey) {
      case "single_modal.disable_nations":
        this.disableNations = checked;
        break;
      case "single_modal.instant_build":
        this.instantBuild = checked;
        break;
      case "single_modal.random_spawn":
        this.randomSpawn = checked;
        break;
      case "single_modal.infinite_gold":
        this.infiniteGold = checked;
        break;
      case "single_modal.infinite_troops":
        this.infiniteTroops = checked;
        break;
      case "single_modal.compact_map":
        this.handleCompactMapChange(checked);
        break;
      default:
        break;
    }
  };

  private handleConfigUnitToggleChanged = (e: Event) => {
    const customEvent = e as CustomEvent<{ unit: UnitType; checked: boolean }>;
    const { unit, checked } = customEvent.detail;
    this.disabledUnits = getUpdatedDisabledUnits(
      this.disabledUnits,
      unit,
      checked,
    );
  };

  private handleBotsChange = (e: Event) => {
    const customEvent = e as CustomEvent<{ value: number }>;
    const value = customEvent.detail.value;
    if (isNaN(value) || value < 0 || value > 400) {
      return;
    }
    this.bots = value;
  };

  private handleMaxTimerToggle = (
    checked: boolean,
    value: number | string | undefined,
  ) => {
    this.maxTimer = checked;
    this.maxTimerValue = toOptionalNumber(value);
  };

  private handleGoldMultiplierToggle = (
    checked: boolean,
    value: number | string | undefined,
  ) => {
    this.goldMultiplier = checked;
    this.goldMultiplierValue = toOptionalNumber(value);
  };

  private handleStartingGoldToggle = (
    checked: boolean,
    value: number | string | undefined,
  ) => {
    this.startingGold = checked;
    this.startingGoldValue = toOptionalNumber(value);
  };

  private handleMaxTimerValueKeyDown = (e: KeyboardEvent) => {
    preventDisallowedKeys(e, ["-", "+", "e"]);
  };

  private getEndTimerInput(): HTMLInputElement | null {
    return (
      (this.renderRoot.querySelector(
        "#end-timer-value",
      ) as HTMLInputElement | null) ??
      (this.querySelector("#end-timer-value") as HTMLInputElement | null)
    );
  }

  private handleMaxTimerValueChanges = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const value = parseBoundedIntegerFromInput(input, {
      min: 1,
      max: 120,
      stripPattern: /[e+-]/gi,
    });

    this.maxTimerValue = value;
  };

  private handleGoldMultiplierValueKeyDown = (e: KeyboardEvent) => {
    preventDisallowedKeys(e, ["+", "-", "e", "E"]);
  };

  private handleGoldMultiplierValueChanges = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const value = parseBoundedFloatFromInput(input, { min: 0.1, max: 1000 });

    if (value === undefined) {
      this.goldMultiplierValue = undefined;
      input.value = "";
    } else {
      this.goldMultiplierValue = value;
    }
  };

  private handleStartingGoldValueKeyDown = (e: KeyboardEvent) => {
    preventDisallowedKeys(e, ["-", "+", "e", "E"]);
  };

  private handleStartingGoldValueChanges = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const value = parseBoundedIntegerFromInput(input, {
      min: 0,
      max: 1000000000,
    });

    this.startingGoldValue = value;
  };

  private handleGameModeSelection(value: GameMode) {
    this.gameMode = value;
  }

  private handleTeamCountSelection(value: TeamCountConfig) {
    this.teamCount = value;
  }

  private setGeneratedMapEnabled(enabled: boolean) {
    if (this.useGeneratedMap === enabled) {
      return;
    }

    this.useGeneratedMap = enabled;
    if (enabled) {
      this.useRandomMap = false;
      if (!this.generatedMapSeed.trim()) {
        this.generatedMapSeed = generateID();
      }
    }
  }

  private handleGeneratedMapModeChanged = (e: Event) => {
    const customEvent = e as CustomEvent<{ enabled: boolean }>;
    this.setGeneratedMapEnabled(customEvent.detail.enabled);
  };

  private handleGeneratedMapSeedChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const trimmed = input.value.trim();
    this.generatedMapSeed = trimmed || generateID();
  };

  private handleGeneratedMapNationCountHintKeyDown = (e: KeyboardEvent) => {
    preventDisallowedKeys(e, ["-", "+", "e", "E", "."]);
  };

  private handleGeneratedMapNationCountHintChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const trimmed = input.value.trim();
    if (!trimmed) {
      this.generatedNationCountHint = undefined;
      return;
    }

    const parsed = parseBoundedIntegerFromInput(input, { min: 1, max: 10000 });
    if (parsed === undefined) {
      return;
    }
    this.generatedNationCountHint = parsed;
  };

  private renderGeneratedMapPanel(): TemplateResult {
    return html`
      <div>
        <h4 class="text-sm font-bold text-white uppercase tracking-wider">
          ${translateText("generated_map.title")}
        </h4>
        <p class="text-xs text-white/60 mt-1">
          ${translateText("generated_map.description")}
        </p>
      </div>
      <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <label class="flex flex-col gap-1">
          <span
            class="text-xs font-bold uppercase tracking-wider text-white/70"
          >
            ${translateText("generated_map.seed")}
          </span>
          <input
            type="text"
            class="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            .value=${this.generatedMapSeed}
            placeholder=${translateText("generated_map.seed_placeholder")}
            @change=${this.handleGeneratedMapSeedChange}
          />
        </label>
        <label class="flex flex-col gap-1">
          <span
            class="text-xs font-bold uppercase tracking-wider text-white/70"
          >
            ${translateText("generated_map.nation_count_hint")}
          </span>
          <input
            type="number"
            min="1"
            max="10000"
            class="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            .value=${this.generatedNationCountHint?.toString() ?? ""}
            placeholder=${translateText(
              "generated_map.nation_count_hint_placeholder",
            )}
            @keydown=${this.handleGeneratedMapNationCountHintKeyDown}
            @change=${this.handleGeneratedMapNationCountHintChange}
          />
        </label>
      </div>
    `;
  }

  private async startGame() {
    if (this.isStartingGame) {
      return;
    }
    // Validate and clamp maxTimer setting before starting
    let finalMaxTimerValue: number | undefined = undefined;
    if (this.maxTimer) {
      if (!this.maxTimerValue || this.maxTimerValue <= 0) {
        console.error("Max timer is enabled but no valid value is set");
        alert(
          translateText("single_modal.max_timer_invalid") ||
            "Please enter a valid max timer value (1-120 minutes)",
        );
        // Focus the input
        const input = this.getEndTimerInput();
        if (input) {
          input.focus();
          input.select();
        }
        return;
      }
      // Clamp value to valid range
      finalMaxTimerValue = Math.max(1, Math.min(120, this.maxTimerValue));
    }
    this.isStartingGame = true;
    let startedSuccessfully = false;

    try {
      // If random map is selected, choose a random map now
      if (this.useRandomMap && !this.useGeneratedMap) {
        this.selectedMap = getRandomMapType();
      }

      console.log(
        `Starting single player game with map: ${GameMapType[this.selectedMap as keyof typeof GameMapType]}${this.useRandomMap ? " (Randomly selected)" : ""}`,
      );
      const clientID = generateID();
      const gameID = generateID();
      const gameMapSize = this.compactMap
        ? GameMapSize.Compact
        : GameMapSize.Normal;
      let gameMap: GameMapType = this.selectedMap;
      let mapRef: NonNullable<GameConfig["mapRef"]> = {
        kind: "static" as const,
        map: this.selectedMap,
      };

      if (this.useGeneratedMap) {
        this.isGeneratingMap = true;
        try {
          const resolved = await resolveGeneratedMap({
            gameID,
            seed: this.generatedMapSeed,
            mapSize: gameMapSize,
            nationCountHint: this.generatedNationCountHint,
          });
          mapRef = resolved.mapRef;
          gameMap = resolved.fallbackGameMap;
        } catch (error) {
          console.warn(
            "Failed to resolve generated map for single player",
            error,
          );
        } finally {
          this.isGeneratingMap = false;
        }
      }

      const usernameInput = document.querySelector(
        "username-input",
      ) as UsernameInput;
      if (!usernameInput) {
        console.warn("Username input element not found");
      }

      await crazyGamesSDK.requestMidgameAd();

      this.dispatchEvent(
        new CustomEvent("join-lobby", {
          detail: {
            gameID: gameID,
            gameStartInfo: {
              gameID: gameID,
              players: [
                {
                  clientID,
                  username: usernameInput.getCurrentUsername(),
                  cosmetics: await getPlayerCosmetics(),
                },
              ],
              config: {
                gameMap,
                mapRef,
                gameMapSize,
                gameType: GameType.Singleplayer,
                gameMode: this.gameMode,
                playerTeams: this.teamCount,
                difficulty: this.selectedDifficulty,
                maxTimerValue: finalMaxTimerValue,
                bots: this.bots,
                infiniteGold: this.infiniteGold,
                donateGold: this.gameMode === GameMode.Team,
                donateTroops: this.gameMode === GameMode.Team,
                infiniteTroops: this.infiniteTroops,
                instantBuild: this.instantBuild,
                randomSpawn: this.randomSpawn,
                disabledUnits: this.disabledUnits
                  .map((u) => Object.values(UnitType).find((ut) => ut === u))
                  .filter((ut): ut is UnitType => ut !== undefined),
                ...(this.gameMode === GameMode.Team &&
                this.teamCount === HumansVsNations
                  ? {
                      disableNations: false,
                    }
                  : {
                      disableNations: this.disableNations,
                    }),
                ...(this.goldMultiplier && this.goldMultiplierValue
                  ? { goldMultiplier: this.goldMultiplierValue }
                  : {}),
                ...(this.startingGold && this.startingGoldValue !== undefined
                  ? { startingGold: this.startingGoldValue }
                  : {}),
              },
              lobbyCreatedAt: Date.now(), // ms; server should be authoritative in MP
            },
            source: "singleplayer",
          } satisfies JoinLobbyEvent,
          bubbles: true,
          composed: true,
        }),
      );
      startedSuccessfully = true;
      this.close();
    } catch (error) {
      this.isGeneratingMap = false;
      this.isStartingGame = false;
      console.error("Failed to start single player game", error);
      return;
    } finally {
      this.isGeneratingMap = false;
      if (!startedSuccessfully || this.inline) {
        this.isStartingGame = false;
      }
    }
  }
}
