import { useDeferredValue, useEffect, useState } from "react";
import { getChoiceHistory, getRandomRecipe, getRecipe, getRecipes, isDemoMode, saveRecipeChoice } from "./api";
import type { ChoiceHistoryItem, Ingredient, Recipe, RecipeFilters } from "./types";

const categories = ["", "Говядина", "Свинина", "Птица", "Баранина", "Рыба и морепродукты", "Овощи и гарниры"];
const grills = ["", "дом", "угольный", "газовый", "мангал", "камадо"];
const difficultyLabels = { easy: "Легко", medium: "Средне", hard: "Сложно" };
const categoryMarks: Record<string, string> = {
  "Говядина": "ГВ",
  "Свинина": "СВ",
  "Птица": "ПТ",
  "Баранина": "БР",
  "Рыба и морепродукты": "РБ",
  "Овощи и гарниры": "ОВ",
};

function totalMinutes(recipe: Recipe): number {
  return (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0) + (recipe.rest_minutes ?? 0);
}

function portions(recipe: Recipe): string {
  if (!recipe.servings_min) return "Порции не указаны";
  return recipe.servings_max && recipe.servings_max !== recipe.servings_min
    ? `${recipe.servings_min}–${recipe.servings_max} порций`
    : `${recipe.servings_min} порции`;
}

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("ru");
}

function scaledQuantity(value: number, unit: string | null | undefined, factor: number): number {
  let result = value * factor;
  const normalizedUnit = normalized(unit);
  if (/^(шт\.?|зубчик|веточк|ломтик|кус|стеб|лист|бан|упаков|кочан|луковиц)/.test(normalizedUnit)) {
    result = Math.ceil(result - 1e-9);
  } else if (/^(г|грам|мл|миллилитр)/.test(normalizedUnit)) {
    result = Math.round(result);
  } else if (/^(ч\.? ?л\.?|ст\.? ?л\.?|чай|столов)/.test(normalizedUnit)) {
    result = Math.round(result * 4) / 4;
  } else if (/^(кг|л|литр)/.test(normalizedUnit)) {
    result = Math.round(result * 100) / 100;
  } else {
    result = Math.round(result * 10) / 10;
  }
  return result;
}

function quantityText(ingredient: Ingredient, factor = 1): string {
  if (ingredient.quantity == null) return ingredient.note ?? "по вкусу";
  const scaled = scaledQuantity(ingredient.quantity, ingredient.unit, factor);
  const value = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(scaled);
  return [value, ingredient.unit, ingredient.note].filter(Boolean).join(" ");
}

function recipeBaseServings(recipe: Recipe): number | null {
  const value = Number(recipe.servings_max ?? recipe.servings_min ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function GuestPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const update = (next: number) => onChange(Math.max(1, Math.min(30, Math.trunc(next || 1))));
  return (
    <div className="guest-picker" aria-label="Количество человек">
      <button onClick={() => update(value - 1)} disabled={value <= 1} aria-label="Уменьшить количество">−</button>
      <label><input type="number" min="1" max="30" value={value} onChange={(event) => update(Number(event.target.value))} /><span>человек</span></label>
      <button onClick={() => update(value + 1)} disabled={value >= 30} aria-label="Увеличить количество">+</button>
    </div>
  );
}

function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: (id: string) => void }) {
  return (
    <button className="recipe-card" onClick={() => onOpen(recipe.id)} aria-label={`Открыть рецепт ${recipe.title}`}>
      <div className="recipe-media">
        {recipe.image_url ? <img src={recipe.image_url} alt="" /> : <span>{categoryMarks[recipe.category] ?? "Е"}</span>}
        <div className="card-time">{totalMinutes(recipe) || "—"} мин</div>
      </div>
      <div className="recipe-card-body">
        <p className="eyebrow">{recipe.category}</p>
        <h3>{recipe.title}</h3>
        <p className="summary">{recipe.summary}</p>
        <div className="card-meta">
          <span>{portions(recipe)}</span>
          <span>{recipe.difficulty ? difficultyLabels[recipe.difficulty] : "Любая сложность"}</span>
        </div>
      </div>
    </button>
  );
}

function RecipeView({ recipe, guests, onGuestsChange, onChoose, onBack }: { recipe: Recipe; guests: number; onGuestsChange: (value: number) => void; onChoose: () => Promise<void>; onBack: () => void }) {
  const [choiceState, setChoiceState] = useState<"idle" | "saving" | "saved">("idle");
  const [choiceError, setChoiceError] = useState("");

  useEffect(() => {
    const telegram = window.Telegram?.WebApp;
    const backButton = telegram?.initData ? telegram.BackButton : undefined;
    backButton?.show();
    backButton?.onClick(onBack);
    return () => {
      backButton?.offClick(onBack);
      backButton?.hide();
    };
  }, [onBack]);

  const temperature = recipe.target_internal_temp_min_c
    ? recipe.target_internal_temp_max_c && recipe.target_internal_temp_max_c !== recipe.target_internal_temp_min_c
      ? `${recipe.target_internal_temp_min_c}–${recipe.target_internal_temp_max_c} °C`
      : `${recipe.target_internal_temp_min_c} °C`
    : null;
  const baseServings = recipeBaseServings(recipe);
  const factor = baseServings ? guests / baseServings : 1;

  async function chooseRecipe() {
    if (choiceState !== "idle") return;
    setChoiceError("");
    setChoiceState("saving");
    try {
      await onChoose();
      setChoiceState("saved");
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
    } catch (reason) {
      setChoiceState("idle");
      setChoiceError(reason instanceof Error ? reason.message : "Не удалось сохранить выбор");
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("heavy");
    }
  }

  return (
    <main className="recipe-page">
      <button className="back-button" onClick={onBack}>← К каталогу</button>
      <div className="detail-hero">
        <div className="detail-mark">{categoryMarks[recipe.category] ?? "Е"}</div>
        <p className="eyebrow">{recipe.category}</p>
        <h1>{recipe.title}</h1>
        <p>{recipe.summary}</p>
        <div className="detail-facts">
          <div><strong>{totalMinutes(recipe)}</strong><span>минут</span></div>
          <div><strong>{guests}</strong><span>человек</span></div>
          <div><strong>{recipe.difficulty ? difficultyLabels[recipe.difficulty] : "—"}</strong><span>сложность</span></div>
        </div>
      </div>

      <section className="servings-panel">
        <div><span>Готовим на</span><GuestPicker value={guests} onChange={onGuestsChange} /></div>
        <p>{baseServings
          ? factor === 1
            ? `Ингредиенты указаны на ${baseServings} человек.`
            : `Ингредиенты пересчитаны с ${baseServings} на ${guests} человек · ×${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(factor)}`
          : "В рецепте не указано исходное количество порций, поэтому количества оставлены без изменения."}</p>
      </section>

      <section className="choice-panel">
        <div><span>План на готовку</span><strong>{choiceState === "saved" ? "Рецепт сохранён" : `На ${guests} человек`}</strong></div>
        <button onClick={chooseRecipe} disabled={choiceState !== "idle"}>
          {choiceState === "saving" ? "Сохраняю…" : choiceState === "saved" ? "✓ Буду готовить" : "Буду готовить"}
        </button>
        {choiceError && <p role="alert">{choiceError}</p>}
      </section>

      <section className="detail-section">
        <div className="section-heading"><span>01</span><h2>Ингредиенты</h2></div>
        <div className="ingredient-list">
          {(recipe.ingredients ?? []).map((ingredient, index) => (
            <div className="ingredient-row" key={`${ingredient.name}-${index}`}>
              <span>{ingredient.name}{ingredient.is_optional ? " (по желанию)" : ""}</span>
              <strong>{quantityText(ingredient, factor)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="detail-section steps-section">
        <div className="section-heading"><span>02</span><h2>Приготовление</h2></div>
        <ol className="steps-list">
          {(recipe.steps ?? []).map((step, index) => (
            <li key={`${step.instruction}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>{step.title && <h3>{step.title}</h3>}<p>{step.instruction}</p></div>
            </li>
          ))}
        </ol>
      </section>

      {(temperature || recipe.allergens?.length) && (
        <section className="safety-panel">
          {temperature && <div><span>Температура внутри</span><strong>{temperature}</strong><p>{recipe.temperature_guidance}</p></div>}
          {!!recipe.allergens?.length && <div><span>Аллергены</span><strong>{recipe.allergens.join(", ")}</strong></div>}
        </section>
      )}
    </main>
  );
}

function historyDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function HistoryView({ items, loading, error, onOpen, onBack }: { items: ChoiceHistoryItem[]; loading: boolean; error: string; onOpen: (item: ChoiceHistoryItem) => void; onBack: () => void }) {
  return (
    <main className="history-page">
      <button className="back-button" onClick={onBack}>← В каталог</button>
      <header className="history-heading">
        <p className="eyebrow">Личная коллекция</p>
        <h1>Мой выбор</h1>
        <p>Рецепты, которые вы решили приготовить. Количество гостей тоже сохранено.</p>
      </header>
      {error && <div className="error-note" role="alert">{error}</div>}
      {loading && <div className="loader"><span /><span /><span /></div>}
      {!loading && !items.length && <div className="empty-state history-empty"><strong>Здесь пока пусто</strong><p>Откройте рецепт и нажмите «Буду готовить».</p></div>}
      <div className="history-grid">
        {items.map((item) => (
          <article className="history-item" key={item.id}>
            <div className="history-meta"><span>{historyDate(item.chosen_at)}</span><strong>{item.guests ? `${item.guests} чел.` : "Порции не указаны"}</strong></div>
            <RecipeCard recipe={item.recipe} onOpen={() => onOpen(item)} />
          </article>
        ))}
      </div>
    </main>
  );
}

export default function App() {
  const [filters, setFilters] = useState<RecipeFilters>({ query: "", category: "", grill: "" });
  const deferredQuery = useDeferredValue(filters.query);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [guests, setGuests] = useState(4);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ChoiceHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const firstName = window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getRecipes({ ...filters, query: deferredQuery }, 0, 12)
      .then((page) => {
        if (!active) return;
        setRecipes(page.items);
        setTotal(page.total);
      })
      .catch((reason: Error) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [deferredQuery, filters.category, filters.grill]);

  async function loadMore() {
    setLoading(true);
    try {
      const page = await getRecipes({ ...filters, query: deferredQuery }, recipes.length, 12);
      setRecipes((current) => [...current, ...page.items]);
      setTotal(page.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить рецепты");
    } finally {
      setLoading(false);
    }
  }

  async function openRecipe(id: string) {
    setError("");
    setDetailLoading(true);
    try {
      setSelected(await getRecipe(id));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось открыть рецепт");
    } finally {
      setDetailLoading(false);
    }
  }

  async function randomRecipe() {
    if (detailLoading) return;
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
    setError("");
    setDetailLoading(true);
    try {
      setSelected(await getRandomRecipe({ ...filters, query: deferredQuery }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось подобрать случайный рецепт");
    } finally {
      setDetailLoading(false);
    }
  }

  async function chooseRecipe() {
    if (!selected) return;
    await saveRecipeChoice(selected.id, guests);
    setHistory([]);
  }

  async function openHistory() {
    setShowHistory(true);
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const result = await getChoiceHistory();
      setHistory(result.items);
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : "Не удалось загрузить историю");
    } finally {
      setHistoryLoading(false);
    }
  }

  function openHistoryRecipe(item: ChoiceHistoryItem) {
    if (item.guests) setGuests(item.guests);
    setSelected(item.recipe);
    setShowHistory(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (selected) return <RecipeView recipe={selected} guests={guests} onGuestsChange={setGuests} onChoose={chooseRecipe} onBack={() => setSelected(null)} />;
  if (showHistory) return <HistoryView items={history} loading={historyLoading} error={historyError} onOpen={openHistoryRecipe} onBack={() => setShowHistory(false)} />;

  return (
    <main>
      {detailLoading && (
        <div className="detail-loading" role="status" aria-live="polite">
          <div className="detail-loading-card">
            <div className="loader compact" aria-hidden="true"><span /><span /><span /></div>
            <strong>Подбираю рецепт…</strong>
            <small>Обычно это занимает пару секунд</small>
          </div>
        </div>
      )}
      <header className="topbar">
        <div className="brand"><span>ОГ</span><div><strong>Что на огонь?</strong><small>рецепты без суеты</small></div></div>
        <button className="history-button" onClick={openHistory}><span>Мой выбор</span><strong>{firstName?.[0] ?? "Г"}</strong></button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{firstName ? `${firstName}, выбираем вместе` : "Ваш следующий ужин"}</p>
          <h1>Найдём блюдо,<br /><em>которое хочется готовить</em></h1>
          <p>От домашней духовки до угольного гриля. Фильтруйте, выбирайте или доверьтесь случаю.</p>
        </div>
        <button className="random-button" onClick={randomRecipe} disabled={detailLoading} aria-busy={detailLoading}>
          <span>↻</span><strong>{detailLoading ? "Подбираю…" : "Мне повезёт"}</strong><small>случайный рецепт</small>
        </button>
      </section>

      {error && <div className="status-toast error-note" role="alert">{error}</div>}

      <section className="controls">
        <label className="search-field">
          <span>⌕</span>
          <input value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Блюдо или ингредиент" />
        </label>
        <div className="filter-group">
          <p>Что готовим</p>
          <div className="chips">
            {categories.map((category) => (
              <button className={filters.category === category ? "active" : ""} onClick={() => setFilters({ ...filters, category })} key={category || "all"}>
                {category || "Все"}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <p>Где готовим</p>
          <div className="chips compact">
            {grills.map((grill) => (
              <button className={filters.grill === grill ? "active" : ""} onClick={() => setFilters({ ...filters, grill })} key={grill || "any"}>
                {grill || "Неважно"}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group guest-filter">
          <p>На сколько человек</p>
          <GuestPicker value={guests} onChange={setGuests} />
        </div>
      </section>

      <section className="catalog">
        <div className="catalog-heading">
          <div><p className="eyebrow">Коллекция</p><h2>Подходящие рецепты</h2></div>
          <span>{total}</span>
        </div>
        {isDemoMode() && <div className="demo-note">Демонстрационный режим · после публикации здесь появятся рецепты из Supabase</div>}
        <div className="recipe-grid">
          {recipes.map((recipe) => <RecipeCard recipe={recipe} onOpen={openRecipe} key={recipe.id} />)}
        </div>
        {!loading && !recipes.length && <div className="empty-state"><strong>Ничего не нашли</strong><p>Попробуйте убрать один из фильтров.</p></div>}
        {loading && <div className="loader"><span /><span /><span /></div>}
        {recipes.length < total && !loading && <button className="load-more" onClick={loadMore}>Показать ещё</button>}
      </section>

      <footer><span>Что на огонь?</span><p>Каталог работает вместе с Telegram-ботом</p></footer>
    </main>
  );
}
