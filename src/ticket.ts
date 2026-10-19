/** Ein einfaches Support-Ticket, wie es ein Agent zusammenfassen soll. */
export interface Ticket {
  id: number;
  title: string;
  priority: "low" | "medium" | "high";
}

/** Sortiert Tickets nach Priorität (high zuerst), stabil nach id. */
export function sortByPriority(tickets: Ticket[]): Ticket[] {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return [...tickets].sort((a, b) => rank[a.priority] - rank[b.priority] || a.id - b.id);
}
