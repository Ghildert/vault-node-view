import type { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";

export const SEARCH_SPECIFIERS = [
  "@username:",
  "@note:",
  "@website:",
  "@field#text:",
  "@field#hidden:",
  "@field#checkbox:",
  "@field#linked:",
] as const;

export interface LoginSearchDocument {
  id: string;
  name: string;
  displayName: string;
  username: string;
  websites: string[];
  notes: string;
  fields: { type: string; name: string; value: string }[];
}

/** Search data stays in Angular memory; never send field values or notes to the canvas. */
export function toLoginSearchDocument(cipher: CipherView): LoginSearchDocument {
  const protectedItem = cipher.reprompt != null && cipher.reprompt !== 0;
  const username = cipher.login?.username ?? "";
  return {
    id: String(cipher.id),
    name: cipher.name ?? "",
    displayName: cipher.name ?? "",
    username,
    websites: (cipher.login?.uris ?? []).map((uri) => uri.uri ?? ""),
    notes: protectedItem ? "" : (cipher.notes ?? ""),
    fields: (cipher.fields ?? []).map((field) => ({
      // Bitwarden FieldType: Text=0, Hidden=1, Boolean=2, Linked=3.
      type: ["text", "hidden", "checkbox", "linked"][field.type] ?? "",
      name: field.name ?? "",
      value: protectedItem
        ? ""
        : field.type === 3
          ? field.linkedId === 100
            ? username
            : field.linkedId === 101
              ? (cipher.login?.password ?? "")
              : ""
          : (field.value ?? ""),
    })),
  };
}

/** Whitespace joins clauses with AND; quotes keep spaces inside a value. */
export function matchesLoginSearch(item: LoginSearchDocument, query: string): boolean {
  const clauses: string[] = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  const contains = (values: string[], value: string) =>
    values.some((candidate) => candidate.toLocaleLowerCase().includes(value));
  return clauses.every((clause) => {
    const specifier = /^@(username|note|website|field#(?:text|hidden|checkbox|linked)):(.*)$/i.exec(
      clause,
    );
    const value = (specifier?.[2] ?? clause).replace(/^"|"$/g, "").toLocaleLowerCase();
    if (!value) {
      return true;
    }
    if (!specifier) {
      // A partially typed/unknown specifier must not silently become a broad search.
      if (clause.startsWith("@")) {
        return false;
      }
      return contains([item.displayName, item.name, ...item.websites, item.notes], value);
    }
    switch (specifier[1].toLowerCase()) {
      case "username":
        return contains([item.username], value);
      case "note":
        return contains([item.notes], value);
      case "website":
        return contains(item.websites, value);
      default: {
        const type = specifier[1].slice("field#".length).toLowerCase();
        return contains(
          item.fields
            .filter((field) => field.type === type)
            .flatMap((field) => [field.name, field.value]),
          value,
        );
      }
    }
  });
}

export function searchSuggestions(query: string, caret = query.length) {
  const before = query.slice(0, caret);
  const token = /(?:^|\s)(@[^\s:]*)$/.exec(before);
  if (!token) {
    return null;
  }
  const prefix = token[1].toLowerCase();
  return {
    start: caret - token[1].length,
    end: caret,
    options: SEARCH_SPECIFIERS.filter((specifier) => specifier.startsWith(prefix)),
  };
}
