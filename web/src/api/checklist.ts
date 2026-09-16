import { api } from "./client";

export type ChecklistItem = {
  id: string;
  tripId: string;
  category: string;
  name: string;
  checked: boolean;
  source: string;
};

export type TemplateMeta = { id: string; label: string };

export function listTemplates() {
  return api<TemplateMeta[]>("/api/v1/checklist/templates");
}

export function listChecklist(tripId: string) {
  return api<ChecklistItem[]>(`/api/v1/trips/${tripId}/checklist`);
}

export function applyTemplate(tripId: string, templateId: string) {
  return api<ChecklistItem[]>(`/api/v1/trips/${tripId}/checklist/from-template`, {
    method: "POST",
    body: JSON.stringify({ templateId }),
  });
}

export function addChecklistItem(tripId: string, name: string, category?: string) {
  return api<ChecklistItem[]>(`/api/v1/trips/${tripId}/checklist`, {
    method: "POST",
    body: JSON.stringify({ name, category }),
  });
}

export function patchChecklistItem(id: string, body: { checked?: boolean; name?: string }) {
  return api<ChecklistItem[]>(`/api/v1/checklist-items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteChecklistItem(id: string) {
  return api<ChecklistItem[]>(`/api/v1/checklist-items/${id}`, { method: "DELETE" });
}

export type ChecklistSuggestion = {
  category: string;
  name: string;
  reason: string;
};

export function listChecklistSuggestions(tripId: string) {
  return api<ChecklistSuggestion[]>(`/api/v1/trips/${tripId}/checklist/suggestions`);
}

export function applyChecklistSuggestions(
  tripId: string,
  items: Array<{ name: string; category?: string }>,
) {
  return api<ChecklistItem[]>(`/api/v1/trips/${tripId}/checklist/from-suggestions`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}
