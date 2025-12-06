import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("setting-reset-all")
export class SettingResetAll extends LitElement {
  @property() label = "Reset all settings";
  @property() description = "";
  @property() warning = "";
  @property() confirmLabel = "";
  @property() cancelLabel = "";

  @state() private confirming = false;

  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <div class="setting-item column">
        <div class="setting-label-group">
          <label class="setting-label block mb-1 text-red-200">
            ${this.label}
          </label>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              class="px-3 py-2 rounded bg-red-700 text-white hover:bg-red-600 transition"
              @click=${() => (this.confirming = true)}
            >
              ${this.label}
            </button>
          </div>

          ${this.confirming
            ? html`
                <div
                  class="mt-3 p-3 border border-red-500/70 rounded bg-red-900/60 text-red-100"
                >
                  <div class="text-sm font-semibold mb-2">${this.warning}</div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      class="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-500 transition"
                      @click=${this.confirm}
                    >
                      ${this.confirmLabel}
                    </button>
                    <button
                      class="px-3 py-2 rounded border border-red-300 text-red-100 hover:bg-red-800 transition"
                      @click=${() => (this.confirming = false)}
                    >
                      ${this.cancelLabel}
                    </button>
                  </div>
                </div>
              `
            : null}
        </div>
      </div>
    `;
  }

  private confirm() {
    this.confirming = false;
    this.dispatchEvent(
      new CustomEvent("reset-all-settings", {
        bubbles: true,
        composed: true,
      }),
    );
  }
}
