import {
  ChangeDetectionStrategy,
  Component,
  ApplicationRef,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  NgZone,
  afterNextRender,
  createComponent,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

import { IconComponent as VaultIconComponent } from "@bitwarden/angular/vault/components/icon.component";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { LoginUriView } from "@bitwarden/common/vault/models/view/login-uri.view";
import { ButtonModule, IconButtonModule, SearchModule } from "@bitwarden/components";
import { I18nPipe } from "@bitwarden/ui-common";

import {
  BubbleCanvas,
  BubbleFolder,
  BubbleLogin,
  BubbleMove,
  mountBubbleCanvas,
} from "./bubble-canvas";
import { LoginSearchDocument, matchesLoginSearch, searchSuggestions } from "./login-search";

const LABEL_LENGTH_KEY = "nodevault.labelLength";
const DEFAULT_LABEL_LENGTH = 12;
const MAX_LABEL_LENGTH = 80;

@Component({
  selector: "app-nodevault-bubble-view",
  templateUrl: "./bubble-view.component.html",
  imports: [ButtonModule, FormsModule, I18nPipe, IconButtonModule, SearchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BubbleViewComponent {
  readonly folders = input.required<readonly BubbleFolder[]>();
  readonly items = input.required<readonly BubbleLogin[]>();
  readonly searchDocuments = input<readonly LoginSearchDocument[]>([]);
  readonly selectedItemId = input<string | null>(null);
  readonly openItem = output<string>();
  readonly moveItems = output<BubbleMove>();

  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>("canvas");
  private readonly searchControl = viewChild<{ getFocusTarget(): HTMLInputElement | undefined }>(
    "search",
  );
  private readonly searchInput = signal<HTMLInputElement | null>(null);
  private readonly destroyRef = inject(DestroyRef);
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly zone = inject(NgZone);
  protected readonly engine = signal<BubbleCanvas | null>(null);
  protected readonly rounded = signal(false);
  protected readonly maxLabelLength = MAX_LABEL_LENGTH;
  protected readonly labelLength = signal(this.readLabelLength());
  protected readonly searchQuery = signal("");
  protected readonly suggestions = signal<ReturnType<typeof searchSuggestions>>(null);
  protected readonly activeSuggestion = signal(0);

  constructor() {
    afterNextRender(() => {
      const field = this.searchControl()?.getFocusTarget();
      if (field) {
        this.searchInput.set(field);
        // Capture before bit-search's Escape handler, so the first Escape dismisses suggestions.
        const keydown = (event: KeyboardEvent) => this.searchKeydown(event, field);
        field.addEventListener("keydown", keydown, true);
        this.destroyRef.onDestroy(() => field.removeEventListener("keydown", keydown, true));
      }
      const engine = this.zone.runOutsideAngular(() =>
        mountBubbleCanvas(
          this.canvas().nativeElement,
          (id) => this.zone.run(() => this.openItem.emit(id)),
          (host, serviceHost) => this.zone.run(() => this.mountVaultIcon(host, serviceHost)),
          (move) => this.zone.run(() => this.moveItems.emit(move)),
        ),
      );
      this.engine.set(engine);
    });
    effect(() => {
      const engine = this.engine();
      const folders = this.folders();
      const items = this.items();
      this.zone.runOutsideAngular(() => engine?.setData(folders, items));
    });
    effect(() => {
      this.engine()?.setSelected(this.selectedItemId());
    });
    effect(() => {
      this.engine()?.setLabelLength(this.labelLength());
    });
    effect(() => {
      const query = this.searchQuery();
      const documents = this.searchDocuments();
      const matchingIds = documents
        .filter((item) => matchesLoginSearch(item, query))
        .map((item) => item.id);
      this.engine()?.setSearch(query, query.trim() ? matchingIds : undefined);
    });
    effect(() => {
      const field = this.searchInput();
      if (!field) {
        return;
      }
      const expanded = !!this.suggestions()?.options.length;
      field.setAttribute("role", "combobox");
      field.setAttribute("aria-label", "Search logins");
      field.setAttribute("aria-autocomplete", "list");
      field.setAttribute("aria-controls", "nodevault-search-options");
      field.setAttribute("aria-expanded", String(expanded));
      if (expanded) {
        field.setAttribute(
          "aria-activedescendant",
          "nodevault-search-option-" + this.activeSuggestion(),
        );
      } else {
        field.removeAttribute("aria-activedescendant");
      }
    });
    this.destroyRef.onDestroy(() => this.engine()?.destroy());
  }

  protected updateSearch(value: string, field = this.searchInput()) {
    this.searchQuery.set(value);
    if (!field) {
      return;
    }
    if (field.value !== value) {
      field.value = value;
    }
    this.updateSuggestions(field);
  }

  protected updateSuggestions(field = this.searchInput()) {
    if (!field) {
      return;
    }
    this.suggestions.set(
      searchSuggestions(field.value, field.selectionStart ?? field.value.length),
    );
    this.activeSuggestion.set(0);
  }

  protected searchKeydown(event: KeyboardEvent, field: HTMLInputElement) {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const options = this.suggestions()?.options ?? [];
    if (event.key === "Escape") {
      if (!options.length) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.suggestions.set(null);
    } else if (options.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      this.activeSuggestion.update(
        (index) => (index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length,
      );
    } else if (
      options.length &&
      (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey))
    ) {
      event.preventDefault();
      this.acceptSuggestion(options[this.activeSuggestion()], field);
    }
  }

  protected acceptSuggestion(option: string, field = this.searchInput()) {
    const suggestion = this.suggestions();
    if (!suggestion || !field) {
      return;
    }
    const query = this.searchQuery();
    this.searchQuery.set(query.slice(0, suggestion.start) + option + query.slice(suggestion.end));
    this.suggestions.set(null);
    field.value = this.searchQuery();
    field.focus();
    // Native search inputs do not support setSelectionRange; assigning value puts the caret at the end.
    if (field.type !== "search") {
      field.setSelectionRange(suggestion.start + option.length, suggestion.start + option.length);
    }
  }

  protected closeSuggestions() {
    this.suggestions.set(null);
  }

  private mountVaultIcon(hostElement: HTMLElement, serviceHost?: string): () => void {
    // The icon needs only a hostname. Keep the actual vault item outside the graph.
    const cipher = new CipherView();
    if (serviceHost) {
      const uri = new LoginUriView();
      uri.uri = `https://${serviceHost}`;
      cipher.login.uris = [uri];
    }
    const ref = createComponent(VaultIconComponent, {
      environmentInjector: this.environmentInjector,
      hostElement,
    });
    ref.setInput("cipher", cipher);
    ref.setInput("size", 24);
    this.appRef.attachView(ref.hostView);
    return () => ref.destroy();
  }

  protected toggleShape() {
    this.rounded.update((value) => !value);
    this.engine()?.setRounded(this.rounded());
  }

  protected updateLabelLength(field: HTMLInputElement) {
    if (field.validity.valid) {
      this.labelLength.set(field.valueAsNumber);
      try {
        localStorage.setItem(LABEL_LENGTH_KEY, String(this.labelLength()));
      } catch {
        // The current view can still use the setting when storage is unavailable.
      }
    }
    field.value = String(this.labelLength());
  }

  private readLabelLength(): number {
    try {
      const saved = Number(localStorage.getItem(LABEL_LENGTH_KEY));
      if (Number.isInteger(saved) && saved >= 1 && saved <= MAX_LABEL_LENGTH) {
        return saved;
      }
    } catch {
      // Use the default when storage is unavailable.
    }
    return DEFAULT_LABEL_LENGTH;
  }
}
