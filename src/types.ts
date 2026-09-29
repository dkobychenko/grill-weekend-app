export type Ingredient = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
  is_optional?: boolean;
};

export type RecipeStep = {
  title?: string | null;
  instruction: string;
  duration_minutes?: number | null;
  temperature_c?: number | null;
};

export type Recipe = {
  id: string;
  title: string;
  summary?: string | null;
  category: string;
  grill_types: string[];
  difficulty?: "easy" | "medium" | "hard" | null;
  servings_min?: number | null;
  servings_max?: number | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  rest_minutes?: number | null;
  image_url?: string | null;
  image_status?: string | null;
  equipment?: string[];
  allergens?: string[];
  ingredients?: Ingredient[];
  steps?: RecipeStep[];
  target_internal_temp_min_c?: number | null;
  target_internal_temp_max_c?: number | null;
  temperature_guidance?: string | null;
};

export type RecipePage = {
  items: Recipe[];
  total: number;
  limit: number;
  offset: number;
};

export type RecipeFilters = {
  query: string;
  category: string;
  grill: string;
};

export type ChoiceHistoryItem = {
  id: string;
  chosen_at: string;
  guests: number | null;
  recipe: Recipe;
};

export type ChoiceHistory = {
  items: ChoiceHistoryItem[];
  total: number;
};

export type FilterOption = {
  value: string;
  count: number;
};

export type FilterMetadata = {
  categories: FilterOption[];
  grills: FilterOption[];
};
