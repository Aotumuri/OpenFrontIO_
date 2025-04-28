import { LitElement, html } from "lit";
import { customElement, query, state } from "lit/decorators.js";

@customElement("player-info-modal")
export class PlayerInfoModal extends LitElement {
  @query("o-modal") private modalEl!: HTMLElement & {
    open: () => void;
    close: () => void;
  };

  @state() private roles: string[] = ["user", "support"];

  @state() private wins: number = 12;
  @state() private playTimeSeconds: number = 5 * 3600 + 33 * 60;
  @state() private progressPercent: number = 62;
  @state() private nextRank: string = "Well-Known Player";

  private formatPlayTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  private toggleRole(role: string, checked: boolean) {
    if (checked && !this.roles.includes(role)) {
      this.roles = [...this.roles, role];
    } else if (!checked) {
      this.roles = this.roles.filter((r) => r !== role);
    }
  }

  private getAllRolesSorted(): Record<string, any> {
    const allRoles = [
      "admin", // Admin
      "og", // OG
      "creator",
      "bot", // Bots
      "challenger", // Challenger
      "og100", // OG100
      "contrib", // Contributor
      "ping", // Ping
      "booster", // Server Booster
      "content", // Content Creator
      "beta", // Beta Tester
      "supporter", // Early Access Supporter
      "mod", // Mod
      "staff", // Support Staff
      "devchat", // DevChatAccess
      "active", // Active Contributor
      "adminasst", // Admin Assistant
      "member", // Member
      "user", // Default Player Role
    ];
    return Object.fromEntries(allRoles.map((r) => [r, this.getRoleStyle(r)]));
  }

  createRenderRoot() {
    return this;
  }

  private getStoredFlag(): string {
    const storedFlag = localStorage.getItem("flag");
    return storedFlag || "";
  }

  private getStoredName(): string {
    const storedName = localStorage.getItem("username");
    return storedName || "";
  }

  private getRoleStyle(role: string) {
    const roleStyles: Record<
      string,
      {
        label: string;
        flagWrapper: string;
        nameText: string;
        roleText: string;
        badgeBg: string;
        priority: number;
      }
    > = {
      creator: {
        label: "Creator",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-yellow-200 via-yellow-300 to-yellow-200 animate-shimmer",
        nameText: "text-2xl font-bold text-yellow-200 drop-shadow",
        roleText: "text-yellow-200 font-semibold",
        badgeBg: "bg-yellow-100/20 border-yellow-200/30",
        priority: 1,
      },
      admin: {
        label: "Admin",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-red-500 via-red-600 to-red-500 animate-shimmer",
        nameText: "text-2xl font-bold text-red-400 drop-shadow",
        roleText: "text-red-300 font-semibold",
        badgeBg: "bg-red-500/20 border-red-400/30",
        priority: 2,
      },
      adminasst: {
        label: "Admin Assistant",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-orange-200 via-orange-300 to-orange-200 animate-shimmer", // Admin と同じアニメーション
        nameText: "text-2xl font-bold text-orange-300 drop-shadow", // 肌色系の色
        roleText: "text-orange-300 font-semibold", // 肌色系の色
        badgeBg: "bg-orange-200/20 border-orange-300/30", // 肌色系の背景
        priority: 3,
      },
      mod: {
        label: "Mod",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-orange-400 via-orange-500 to-orange-400 animate-shimmer",
        nameText: "text-2xl font-bold text-orange-300 drop-shadow",
        roleText: "text-orange-300 font-semibold",
        badgeBg: "bg-orange-400/20 border-orange-300/30",
        priority: 4,
      },
      staff: {
        label: "Support Staff",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-300 animate-shimmer",
        nameText: "text-2xl font-bold text-yellow-300 drop-shadow",
        roleText: "text-yellow-300 font-semibold",
        badgeBg: "bg-yellow-300/20 border-yellow-300/30",
        priority: 5,
      },
      active: {
        label: "Active Contributor",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-green-500 to-green-700 animate-shimmer",
        nameText: "text-2xl font-bold text-green-300 drop-shadow",
        roleText: "text-green-300 font-semibold",
        badgeBg: "bg-green-500/20 border-green-400/30",
        priority: 6,
      },
      contrib: {
        label: "Contributor",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-green-400 to-green-600 animate-shimmer",
        nameText: "text-2xl font-bold text-green-300 drop-shadow",
        roleText: "text-green-300 font-semibold",
        badgeBg: "bg-green-500/20 border-green-300/30",
        priority: 7,
      },
      content: {
        label: "Content Creator",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-orange-500 to-orange-700 animate-shimmer",
        nameText: "text-2xl font-bold text-orange-300 drop-shadow",
        roleText: "text-orange-300 font-semibold",
        badgeBg: "bg-orange-500/20 border-orange-400/30",
        priority: 8,
      },
      beta: {
        label: "Beta Tester",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-teal-500 to-teal-700 animate-shimmer",
        nameText: "text-2xl font-bold text-teal-300 drop-shadow",
        roleText: "text-teal-300 font-semibold",
        badgeBg: "bg-teal-500/20 border-teal-400/30",
        priority: 9,
      },
      devchat: {
        label: "Dev Chat Access",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-purple-500 to-purple-700 animate-shimmer",
        nameText: "text-2xl font-bold text-purple-300 drop-shadow",
        roleText: "text-purple-300 font-semibold",
        badgeBg: "bg-purple-500/20 border-purple-400/30",
        priority: 10,
      },
      supporter: {
        label: "Early Access Supporter",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-yellow-500 to-yellow-400 animate-shimmer",
        nameText: "text-2xl font-bold text-yellow-400 drop-shadow",
        roleText: "text-yellow-400 font-semibold",
        badgeBg: "bg-yellow-400/20 border-yellow-300/30",
        priority: 11,
      },
      booster: {
        label: "Server Booster",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-pink-500 to-pink-700 animate-shimmer",
        nameText: "text-2xl font-bold text-pink-300 drop-shadow",
        roleText: "text-pink-300 font-semibold",
        badgeBg: "bg-pink-500/20 border-pink-400/30",
        priority: 12,
      },
      og: {
        label: "OG",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-yellow-300 to-yellow-200 animate-shimmer",
        nameText: "text-2xl font-bold text-yellow-300 drop-shadow",
        roleText: "text-yellow-300 font-semibold",
        badgeBg: "bg-yellow-200/20 border-yellow-300/30",
        priority: 13,
      },
      og100: {
        label: "OG100",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-lime-300 to-lime-500 animate-shimmer",
        nameText: "text-2xl font-bold text-lime-300 drop-shadow",
        roleText: "text-lime-300 font-semibold",
        badgeBg: "bg-lime-300/20 border-lime-300/30",
        priority: 14,
      },
      challenger: {
        label: "Challenger",
        flagWrapper:
          "p-[3px] rounded-full bg-gradient-to-r from-blue-500 to-blue-700",
        nameText: "text-2xl font-bold text-blue-300 drop-shadow",
        roleText: "text-blue-300 font-semibold",
        badgeBg: "bg-blue-500/20 border-blue-400/30",
        priority: 15,
      },
      ping: {
        label: "Ping",
        flagWrapper: "p-[3px] rounded-full bg-gray-400",
        nameText: "text-2xl font-bold text-gray-300 drop-shadow",
        roleText: "text-gray-300 font-semibold",
        badgeBg: "bg-gray-400/20 border-gray-300/30",
        priority: 16,
      },
      bot: {
        label: "Bot",
        flagWrapper: "p-[3px] rounded-full bg-gray-400",
        nameText: "text-2xl font-bold text-gray-300 drop-shadow",
        roleText: "text-gray-300 font-semibold",
        badgeBg: "bg-gray-400/20 border-gray-300/30",
        priority: 17,
      },
      member: {
        label: "Member",
        flagWrapper: "p-[3px] rounded-full bg-gray-400",
        nameText: "text-2xl font-bold text-gray-300 drop-shadow",
        roleText: "text-gray-300 font-semibold",
        badgeBg: "bg-gray-400/20 border-gray-300/30",
        priority: 18,
      },
    };

    return roleStyles[role] || roleStyles["member"];
  }

  private getHighestRole(roles: string[]): string {
    return (
      roles
        .map((role) => ({
          role,
          priority: this.getRoleStyle(role).priority,
        }))
        .sort((a, b) => a.priority - b.priority)[0]?.role ?? "user"
    );
  }

  render() {
    const playerName = this.getStoredName();
    const flag = this.getStoredFlag();
    const discordUserName = "DiscordName"; // test name
    const discordAvatarUrl =
      "https://cdn.discordapp.com/avatars/212760412582707200/06a64cee00dfb078269181f59a153ae3"; // test link

    const highestRole = this.getHighestRole(this.roles);
    const { flagWrapper, nameText } = this.getRoleStyle(highestRole);

    return html`
      <o-modal id="playerInfoModal" title="Player Info">
        <div class="flex flex-col items-center mt-2 mb-4">
          <div class="flex justify-center items-center gap-3">
            <div class="${flagWrapper}">
              <img
                class="size-[48px] rounded-full block"
                src="/flags/${flag || "xx"}.svg"
                alt="Flag"
              />
            </div>
            <div class="${nameText}">${playerName}</div>
            <span>|</span>
            <div class="${nameText}">${discordUserName}</div>
            <div class="${flagWrapper}">
              <img
                class="size-[48px] rounded-full block"
                src="${discordAvatarUrl}"
                alt="Discord Avatar"
              />
            </div>
          </div>

          <hr class="w-2/3 border-gray-600 my-2" />

          <div class="flex flex-wrap justify-center gap-2 mb-2">
            ${this.roles
              .map((role) => ({
                role,
                priority: this.getRoleStyle(role).priority,
              }))
              .sort((a, b) => a.priority - b.priority)
              .map(({ role }) => {
                const { label, roleText, badgeBg } = this.getRoleStyle(role);
                const isOwner = role === "creator";
                return html`
                  <span
                    class="${roleText} ${badgeBg} ${isOwner
                      ? "text-base border-2 shadow-md shadow-yellow-300/30 px-3 py-1.5"
                      : "text-sm border px-2 py-1"} rounded-full flex items-center gap-1"
                  >
                    ${isOwner ? "👑" : ""} ${label}
                  </span>
                `;
              })}
          </div>

          <hr class="w-2/3 border-gray-600 my-2" />

          <div class="flex justify-center gap-6 text-sm text-white">
            <div class="flex items-center gap-1">
              <span>🏆</span>
              <span>Wins: ${this.wins ?? 0}</span>
            </div>
            <div class="flex items-center gap-1">
              <span>⏱️</span>
              <span
                >Play Time:
                ${this.formatPlayTime(this.playTimeSeconds ?? 0)}</span
              >
            </div>
          </div>

          <div class="text-sm text-gray-300 mb-2">
            📈 Your rank increases based on play time and number of wins.
          </div>

          <div
            class="w-2/3 bg-white/10 h-3 rounded-full overflow-hidden mb-1 relative"
          >
            <div
              class="bg-green-400 h-full transition-all duration-300"
              style="width: ${this.progressPercent ?? 0}%;"
            ></div>
          </div>

          <div class="w-2/3 text-right text-xs text-gray-400 italic">
            Next rank: ${this.nextRank ?? "???"}
          </div>

          <hr class="w-2/3 border-gray-600 my-2" />

          <div class="mt-4 w-full max-w-md">
            <div class="text-sm text-gray-400 font-semibold mb-1">
              🛠️ Debug: Set Roles
            </div>
            <div class="flex flex-wrap gap-2">
              ${Object.keys(this.getAllRolesSorted()).map((role) => {
                const isSelected = this.roles.includes(role);
                return html`
                  <label
                    class="flex items-center gap-1 text-xs bg-white/5 px-2 py-1 rounded border border-white/10 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      class="accent-white"
                      .checked=${isSelected}
                      @change=${(e: Event) =>
                        this.toggleRole(
                          role,
                          (e.target as HTMLInputElement).checked,
                        )}
                    />
                    ${this.getRoleStyle(role).label}
                  </label>
                `;
              })}
            </div>
          </div>
        </div>
      </o-modal>
    `;
  }

  public open() {
    this.requestUpdate();
    this.modalEl?.open();
  }

  public close() {
    this.modalEl?.close();
  }
}
