import { demoRecipes } from "./demo";
import type { ChoiceHistory, FilterMetadata, Recipe, RecipeFilters, RecipePage, UserStats } from "./types";

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
    const matches = demoPage(filters, 0, demoRecipes.length).items.filter((recipe) => recipe.category !== "Соусы и маринады");
    if (!matches.length) throw new Error("Нет рецептов с такими условиями");
    return matches[Math.floor(Math.random() * matches.length)];
  }
  const query = filtersQuery(filters);
  const response = await fetch(`${API_URL}/recipes/random?${query}`, { headers: requestHeaders() });
  return await responseJson<Recipe>(response, "Не удалось подобрать случайный рецепт");
}

export async function getFilterMetadata(): Promise<FilterMetadata> {
  if (isDemoMode()) {
    const countValues = (values: string[]) => [...new Set(values)].map((value) => ({ value, count: values.filter((item) => item === value).length }));
    return {
      categories: countValues(demoRecipes.map((recipe) => recipe.category)),
      grills: countValues(demoRecipes.flatMap((recipe) => recipe.grill_types)),
    };
  }
  const response = await fetch(`${API_URL}/filters`, { headers: requestHeaders() });
  return await responseJson<FilterMetadata>(response, "Не удалось загрузить фильтры");
}

export async function saveRecipeChoice(recipeId: string, guests: number): Promise<void> {
  if (isDemoMode()) {
    const current = JSON.parse(localStorage.getItem("demo-recipe-choices") ?? "[]") as Array<Record<string, unknown>>;
    const recipe = demoRecipes.find((item) => item.id === recipeId);
    if (!recipe) throw new Error("Рецепт не найден");
    const withoutRecipe = current.filter((item) => item.recipe_id !== recipeId);
    withoutRecipe.unshift({ id: crypto.randomUUID(), recipe_id: recipeId, guests, chosen_at: new Date().toISOString(), status: "planned" });
    localStorage.setItem("demo-recipe-choices", JSON.stringify(withoutRecipe.slice(0, 50)));
    return;
  }
  const response = await fetch(`${API_URL}/choices`, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({ recipe_id: recipeId, guests }),
  });
  await responseJson(response, "Не удалось сохранить выбор");
}

export async function markRecipeCooked(recipeId: string, guests: number): Promise<void> {
  if (isDemoMode()) {
    const current = JSON.parse(localStorage.getItem("demo-recipe-choices") ?? "[]") as Array<Record<string, unknown>>;
    const updated = current.map((choice) => choice.recipe_id === recipeId
      ? { ...choice, guests, status: "cooked", status_at: new Date().toISOString() }
      : choice);
    localStorage.setItem("demo-recipe-choices", JSON.stringify(updated));
    return;
  }
  const response = await fetch(`${API_URL}/choices/${encodeURIComponent(recipeId)}/cooked`, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({ guests }),
  });
  await responseJson(response, "Не удалось отметить рецепт приготовленным");
}

export async function getChoiceHistory(): Promise<ChoiceHistory> {
  if (isDemoMode()) {
    const current = JSON.parse(localStorage.getItem("demo-recipe-choices") ?? "[]") as Array<Record<string, unknown>>;
    const items = current.flatMap((choice) => {
      const recipe = demoRecipes.find((item) => item.id === choice.recipe_id);
      return recipe ? [{
        id: String(choice.id),
        chosen_at: String(choice.chosen_at),
        status_at: String(choice.status_at ?? choice.chosen_at),
        status: choice.status === "cooked" ? "cooked" as const : "planned" as const,
        guests: Number(choice.guests) || null,
        recipe,
      }] : [];
    });
    return { items, total: items.length };
  }
  const response = await fetch(`${API_URL}/choices?limit=30`, { headers: requestHeaders() });
  return await responseJson<ChoiceHistory>(response, "Не удалось загрузить историю");
}

export async function getUserStats(): Promise<UserStats> {
  if (isDemoMode()) {
    const history = await getChoiceHistory();
    const cooked = history.items.filter((item) => item.status === "cooked");
    const count = (values: string[]) => [...new Set(values)].map((value) => ({ value, count: values.filter((item) => item === value).length })).sort((a, b) => b.count - a.count).slice(0, 5);
    return {
      planned: history.items.filter((item) => item.status === "planned").length,
      total_chosen: history.total,
      total_cooked: cooked.length,
      distinct_cooked: cooked.length,
      top_categories: count(cooked.map((item) => item.recipe.category)),
      top_grills: count(cooked.flatMap((item) => item.recipe.grill_types)),
      top_equipment: count(cooked.flatMap((item) => item.recipe.equipment ?? [])),
    };
  }
  const response = await fetch(`${API_URL}/stats`, { headers: requestHeaders() });
  return await responseJson<UserStats>(response, "Не удалось загрузить статистику");
}
