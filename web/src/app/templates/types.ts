export type TemplateDraft = {
  name: string;
  description: string;
  content: string;
};

export const emptyDraft: TemplateDraft = {
  name: "",
  description: "",
  content: "",
};
