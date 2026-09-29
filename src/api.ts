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

function filtersQuery(filters: RecipeFilters): URLSearchParams {
  const query = new URLSearchParams();
  if (filters.query.trim()) query.set("q", filters.query.trim());
  if (filters.category) query.set("category", filters.category);
  if (filters.grill) query.set("grill", filters.grill);
  return query;
}

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : fallback;
    throw new Error(message);
  }
  return body as T;
}

export function isDemoMode(): boolean {
  return !API_URL || !telegramInitData();
}

export async function getRecipes(filters: RecipeFilters, offset = 0, limit = 12): Promise<RecipePage> {
  if (isDemoMode()) return demoPage(filters, offset, limit);
  const query = filtersQuery(filters);
  query.set("limit", String(limit));
  query.set("offset", String(offset));
  const response = await fetch(`${API_URL}/recipes?${query}`, { headers: requestHeaders() });
  return await responseJson<RecipePage>(response, `Каталог временно недоступен (${response.status})`);
}

export async function getRecipe(id: string): Promise<Recipe> {
  const demo = demoRecipes.find((recipe) => recipe.id === id);
  if (isDemoMode()) {
    if (!demo) throw new Error("Рецепт не найден");
    return demo;
  }
  const response = await fetch(`${API_URL}/recipes/${encodeURIComponent(id)}`, { headers: requestHeaders() });
  return await responseJson<Recipe>(response, response.status === 404 ? "Рецепт не найден" : "Не удалось загрузить рецепт");
}

export async function getRandomRecipe(filters: RecipeFilters): Promise<Recipe> {
  if (isDemoMode()) {
    const matches = demoPage(filters, 0, demoRecipes.length).items;
    if (!matches.length) throw new Error("Нет рецептов с такими условиями");
    return matches[Math.floor(Math.random() * matches.length)];
  }
  const query = filtersQuery(filters);
  const response = await fetch(`${API_URL}/recipes/random?${query}`, { headers: requestHeaders() });
  return await responseJson<Recipe>(response, "Не удалось подобрать случайный рецепт");
}
