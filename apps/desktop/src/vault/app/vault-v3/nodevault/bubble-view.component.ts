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

import { BubbleCanvas, BubbleFolder, BubbleLogin, mountBubbleCanvas } from "./bubble-canvas";

@Component({
  selector: "app-nodevault-bubble-view",
  templateUrl: "./bubble-view.component.html",
  imports: [ButtonModule, FormsModule, I18nPipe, IconButtonModule, SearchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BubbleViewComponent {
  readonly folders = input.required<readonly BubbleFolder[]>();
  readonly items = input.required<readonly BubbleLogin[]>();
  readonly selectedItemId = input<string | null>(null);
  readonly openItem = output<string>();

  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>("canvas");
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly zone = inject(NgZone);
  protected readonly engine = signal<BubbleCanvas | null>(null);
  protected readonly rounded = signal(false);

  constructor() {
    afterNextRender(() => {
      const engine = this.zone.runOutsideAngular(() =>
        mountBubbleCanvas(
          this.canvas().nativeElement,
          (id) => this.zone.run(() => this.openItem.emit(id)),
          (host, serviceHost) => this.zone.run(() => this.mountVaultIcon(host, serviceHost)),
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
    inject(DestroyRef).onDestroy(() => this.engine()?.destroy());
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
}
