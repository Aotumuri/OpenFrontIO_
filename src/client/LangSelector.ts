import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("lang-selector")
export class LangSelector extends LitElement {
  @state() private translations: any = {};
  @state() private defaultTranslations: any = {};
  @state() private currentLang: string = "en";
  @state() private languageList: any[] = [];
  @state() private showModal: boolean = false;
  @state() private debugMode: boolean = false;

  private dKeyPressed: boolean = false;

  static styles = css`
    .modal {
      @apply fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center;
    }
    .modal.hidden {
      display: none;
    }
    .modal-content {
      @apply bg-white rounded-lg shadow-lg p-6 w-96 max-w-full;
    }
    .lang-button {
      @apply w-full flex items-center gap-2 p-2 rounded hover:bg-blue-100 transition;
    }
    .lang-button.active {
      @apply bg-blue-200;
    }
    .close-button {
      @apply mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded;
    }
  `;

  createRenderRoot() {
    return this; // Use Light DOM if you prefer this
  }

  connectedCallback() {
    super.connectedCallback();
    this.setupDebugKey();
    this.initializeLanguage();
  }

  private setupDebugKey() {
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "d") this.dKeyPressed = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.key.toLowerCase() === "d") this.dKeyPressed = false;
    });
  }

  private async initializeLanguage() {
    const locale = new Intl.Locale(navigator.language);
    const defaultLang = locale.language;
    const userLang = localStorage.getItem("lang") || defaultLang;

    this.defaultTranslations = await this.loadLanguage("en");
    this.translations = await this.loadLanguage(userLang);
    this.currentLang = userLang;

    await this.loadLanguageList();
    this.applyTranslation(this.translations);
  }

  private async loadLanguage(lang: string) {
    try {
      const response = await fetch(`/lang/${lang}.json`);
      if (!response.ok) throw new Error(`Missing language: ${lang}`);
      return await response.json();
    } catch (err) {
      console.error("Language load failed:", err);
      return {};
    }
  }

  private async loadLanguageList() {
    try {
      const res = await fetch("/lang/index.json");
      const data = await res.json();
      const list: any[] = [];

      for (const langCode of data.languages) {
        const langData = await this.loadLanguage(langCode);
        if (!langData?.lang) continue;
        list.push({
          code: langCode,
          native: langData.lang.native ?? langCode,
          en: langData.lang.en ?? langCode,
          svg: langData.lang.svg ?? langCode,
        });
      }

      if (this.dKeyPressed) {
        list.push({
          code: "debug",
          native: "Debug",
          en: "Debug",
          svg: "debug",
        });
        this.debugMode = true;
      }

      this.languageList = list;
    } catch (err) {
      console.error("言語リストの読み込みに失敗しました:", err);
    }
  }

  private async changeLanguage(lang: string) {
    localStorage.setItem("lang", lang);
    this.translations = await this.loadLanguage(lang);
    this.currentLang = lang;
    this.applyTranslation(this.translations);
    this.showModal = false;
  }

  private applyTranslation(translations: any) {
    const components = [
      "single-player-modal",
      "host-lobby-modal",
      "join-private-lobby-modal",
      "emoji-table",
      "leader-board",
      "build-menu",
      "win-modal",
      "game-starting-modal",
      "top-bar",
      "player-panel",
      "help-modal",
      "username-input",
      "public-lobby",
      "o-modal",
      "o-button",
    ];

    document.title = translations.main?.title || document.title;

    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.getAttribute("data-i18n");
      const keys = key?.split(".") || [];
      let text = translations;

      for (const k of keys) {
        text = text?.[k];
        if (!text) break;
      }

      if (!text && this.defaultTranslations) {
        let fallback = this.defaultTranslations;
        for (const k of keys) {
          fallback = fallback?.[k];
          if (!fallback) break;
        }
        text = fallback;
      }

      if (text) {
        element.innerHTML = text;
      } else {
        console.warn(`翻訳キーが見つかりません: ${key}`);
      }
    });

    components.forEach((tag) => {
      document.querySelectorAll(tag).forEach((el) => {
        if (typeof (el as any).requestUpdate === "function") {
          (el as any).requestUpdate();
        }
      });
    });
  }

  private openModal() {
    this.debugMode = this.dKeyPressed;
    this.showModal = true;
    this.loadLanguageList();
  }

  render() {
    return html`
      <button
        class="text-center bg-blue-100 hover:bg-blue-200 text-blue-900 p-3 rounded-md font-medium"
        @click=${this.openModal}
      >
        言語を選ぶ
      </button>

      <!-- モーダル -->
      <div id="language-modal" class="modal ${this.showModal ? "" : "hidden"}">
        <div class="modal-content">
          <h2 class="text-xl font-semibold mb-4">Select Language</h2>
          <div id="language-list" class="space-y-2 max-h-80 overflow-y-auto">
            ${this.languageList.map(
              (lang) => html`
                <button
                  class="lang-button ${this.currentLang === lang.code
                    ? "active"
                    : ""}"
                  @click=${() => this.changeLanguage(lang.code)}
                >
                  <img
                    src="/flags/${lang.svg}.svg"
                    class="w-6 h-4"
                    alt="${lang.code}"
                  />
                  <span>${lang.native} (${lang.en})</span>
                </button>
              `,
            )}
          </div>
          <button class="close-button" @click=${() => (this.showModal = false)}>
            Close
          </button>
        </div>
      </div>
    `;
  }
}
