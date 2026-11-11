export type BubbleFolder = { id: string; name: string };
export type BubbleLogin = {
  id: string;
  name: string;
  folderId: string | null;
  serviceHost?: string;
  itemType: "login";
};
export type BubbleMove = {
  items: Pick<BubbleLogin, "id" | "folderId">[];
  folderId: string | null;
};

export interface BubbleCanvas {
  setData(folders: readonly BubbleFolder[], items: readonly BubbleLogin[]): void;
  setRounded(rounded: boolean): void;
  setSearch(search: string, matchingIds?: readonly string[]): void;
  setLabelLength(length: number): void;
  setSelected(id: string | null): void;
  zoomBy(factor: number): void;
  fit(): void;
  destroy(): void;
}

export function mountBubbleCanvas(
  canvas: HTMLElement,
  onSelect: (id: string) => void,
  renderIcon?: (host: HTMLElement, serviceHost?: string) => () => void,
  onMoveItems?: (move: BubbleMove) => void,
): BubbleCanvas;
