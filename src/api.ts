import { demoRecipes } from "./demo";
import type { Recipe, RecipeFilters, RecipePage } from "./types";

const API_URL = (import.meta.env.VITE_MINI_APP_API_URL ?? "").replace(/\/$/, "");

function telegramInitData(): string {
  return window.Telegram?.WebApp?.initData ?? "";
}

function requestHeaders(): HeadersInit {
  return {
    "content-type": "application/json",
    "x-telegram-init-data": telegramInitData(),
  };
}

function demoPage(filters: RecipeFilters, offset: number, limit: number): RecipePage {
  const query = filters.query.toLocaleLowerCase("ru").trim();
  const matches = demoRecipes.filter((recipe) => {
    const searchable = [recipe.title, recipe.summary, recipe.category, ...(recipe.ingredients ?? []).map((item) => item.name)]
      .join(" ")
      .toLocaleLowerCase("ru");
    return (!query || searchable.includes(query)) &&
      (!filters.category || recipe.category === filters.category) &&
      (!filters.grill || recipe.grill_types.includes(filters.grill));
  });
  return { items: matches.slice(offset, offset + limit), total: matches.length, offset, limit };
}

export function isDemoMode(): boolean {
  return !API_URL || !telegramInitData();
}

export async function getRecipes(filters: RecipeFilters, offset = 0, limit = 12): Promise<RecipePage> {
  if (isDemoMode()) return demoPage(filters, offset, limit);
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (filters.query.trim()) query.set("q", filters.query.trim());
  if (filters.category) query.set("category", filters.category);
  if (filters.grill) query.set("grill", filters.grill);
  const response = await fetch(`${API_URL}/recipes?${query}`, { headers: requestHeaders() });
  if (!response.ok) throw new Error(`Каталог временно недоступен (${response.status})`);
  return await response.json();
}

export async function getRecipe(id: string): Promise<Recipe> {
  const demo = demoRecipes.find((recipe) => recipe.id === id);
  if (isDemoMode()) {
    if (!demo) throw new Error("Рецепт не найден");
    return demo;
  }
  const response = await fetch(`${API_URL}/recipes/${encodeURIComponent(id)}`, { headers: requestHeaders() });
  if (!response.ok) throw new Error(response.status === 404 ? "Рецепт не найден" : "Не удалось загрузить рецепт");
  return await response.json();
}
